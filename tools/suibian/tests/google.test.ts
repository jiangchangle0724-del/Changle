// The Google parts, against recorded-shape responses (no key in tests): Places search and details,
// photos with their author, and the sign-in round trip.
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { finishLogin, sign, startLogin, verify } from "../src/server/auth";
import { detailsGoogle, fromGoogle, keepAbout, searchGoogle } from "../src/server/places";

type Call = { url: string; init?: RequestInit };
const realFetch = globalThis.fetch;
let calls: Call[] = [];

/** Answer each fetch with the first route whose test matches the URL. */
function mockFetch(routes: [RegExp, (c: Call) => Response][]) {
  calls = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const c = { url: String(input), init };
    calls.push(c);
    const r = routes.find(([re]) => re.test(c.url));
    if (!r) throw new Error(`unexpected fetch ${c.url}`);
    return r[1](c);
  }) as typeof fetch;
}
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });

afterEach(() => {
  globalThis.fetch = realFetch;
});

const center = { lat: 49.1724, lng: -123.1366 };

const golden = {
  id: "ChIJgolden",
  displayName: { text: "金閣海鮮酒家 Golden Paramount Seafood Restaurant", languageCode: "zh" },
  primaryType: "chinese_restaurant",
  types: ["chinese_restaurant", "restaurant", "food", "point_of_interest", "establishment"],
  location: { latitude: 49.1701, longitude: -123.1371 },
  rating: 4.2,
  userRatingCount: 2310,
  priceLevel: "PRICE_LEVEL_MODERATE",
  priceRange: { startPrice: { currencyCode: "CAD", units: "20" }, endPrice: { currencyCode: "CAD", units: "40" } },
  currentOpeningHours: { openNow: true, nextCloseTime: "2026-10-23T05:00:00Z", weekdayDescriptions: [] },
  businessStatus: "OPERATIONAL",
  reservable: true,
};

test("search: two Nearby Search calls, the right headers and body, results merged", async () => {
  mockFetch([
    [
      /places:searchNearby$/,
      (c) => {
        const body = JSON.parse(String(c.init?.body));
        const extra = body.rankPreference === "DISTANCE" ? [{ ...golden }, { id: "ChIJclosed", displayName: { text: "Gone Café" }, location: { latitude: 49.17, longitude: -123.13 }, businessStatus: "CLOSED_PERMANENTLY" }] : [golden];
        return json({ places: extra });
      },
    ],
  ]);
  const places = await searchGoogle("KEY", center, "drive15", "en");
  assert.equal(calls.length, 2);
  for (const c of calls) {
    const h = new Headers(c.init?.headers);
    assert.equal(h.get("X-Goog-Api-Key"), "KEY");
    assert.match(h.get("X-Goog-FieldMask")!, /places\.currentOpeningHours/);
    const body = JSON.parse(String(c.init?.body));
    assert.deepEqual(body.includedTypes, ["restaurant"]);
    assert.equal(body.maxResultCount, 20);
    assert.equal(body.languageCode, "en");
    assert.deepEqual(body.locationRestriction.circle, { center: { latitude: center.lat, longitude: center.lng }, radius: 6000 });
  }
  assert.deepEqual(
    calls.map((c) => JSON.parse(String(c.init?.body)).rankPreference).sort(),
    ["DISTANCE", "POPULARITY"],
  );
  // Same place from both calls once; permanently closed dropped.
  assert.equal(places.length, 1);
  const p = places[0];
  assert.equal(p.cuisine, "cantonese");
  assert.equal(p.price, 20);
  assert.equal(p.priceLabel, "$$");
  assert.equal(p.closesAt, Date.parse("2026-10-23T05:00:00Z"));
  assert.equal(p.openNow, true);
  assert.equal(p.reservable, true);
  assert.equal(p.ratings, 2310);
});

test("search: Chinese names when the host uses Chinese", async () => {
  mockFetch([[/searchNearby/, () => json({})]]);
  assert.deepEqual(await searchGoogle("KEY", center, "walk10", "zh"), []);
  assert.equal(JSON.parse(String(calls[0].init?.body)).languageCode, "zh-CN");
});

test("search: a Google error (bad key, API not enabled) is thrown, for the room to report", async () => {
  mockFetch([[/searchNearby/, () => json({ error: { code: 403, message: "Places API (New) has not been used in project" } }, 403)]]);
  await assert.rejects(searchGoogle("KEY", center, "walk10", "zh"), /google 403/);
});

test("place from Google: missing fields stay missing, halal from the name or description", () => {
  const p = fromGoogle({ id: "x", displayName: { text: "Spice Hut" }, location: { latitude: 49.2, longitude: -123.1 }, editorialSummary: { text: "Halal Pakistani grill" } })!;
  assert.equal(p.halal, "yes");
  assert.equal(p.rating, undefined);
  assert.equal(p.price, undefined);
  assert.equal(p.closesAt, undefined);
  assert.equal(fromGoogle({ id: "y", location: { latitude: 1, longitude: 1 } }), null);
});

test("place from Google: hotels that Google also calls restaurants are left out", () => {
  const base = { location: { latitude: 49.28, longitude: -123.12 }, types: ["restaurant", "lodging"] };
  assert.equal(fromGoogle({ ...base, id: "h", displayName: { text: "Fairmont Hotel Vancouver" }, primaryType: "hotel" }), null);
  assert.equal(fromGoogle({ ...base, id: "l", displayName: { text: "Some Inn" }, primaryType: "lodging" }), null);
  assert.ok(fromGoogle({ ...base, id: "r", displayName: { text: "Hotel Bar & Grill" }, primaryType: "restaurant" }));
});

test("place from Google: its one-line description and short address come along", () => {
  const p = fromGoogle({
    id: "d",
    displayName: { text: "Kissa Tanto" },
    location: { latitude: 49.28, longitude: -123.1 },
    editorialSummary: { text: "  Italian-Japanese dishes in a moody 1960s-style room.  " },
    shortFormattedAddress: "263 E Pender St, Vancouver",
  })!;
  assert.equal(p.about, "Italian-Japanese dishes in a moody 1960s-style room.");
  assert.equal(p.address, "263 E Pender St, Vancouver");
  assert.equal(fromGoogle({ id: "e", displayName: { text: "X" }, location: { latitude: 49.2, longitude: -123.1 } })!.about, undefined);
});

test("details: phone, map, a queue review with its author, a photo with its author", async () => {
  mockFetch([
    [/\/media\?/, () => json({ name: "places/ChIJgolden/photos/AbC/media", photoUri: "https://lh3.googleusercontent.com/places/AbC=s480" })],
    [
      /\/v1\/places\/ChIJgolden\?/,
      () =>
        json({
          nationalPhoneNumber: "(604) 278-0873",
          googleMapsUri: "https://maps.google.com/?cid=123",
          photos: [{ name: "places/ChIJgolden/photos/AbC", widthPx: 4032, heightPx: 3024, authorAttributions: [{ displayName: "Ming L", uri: "https://maps.google.com/maps/contrib/1" }] }],
          reviews: [
            { text: { text: "Great har gow." }, authorAttribution: { displayName: "A" } },
            { originalText: { text: "点心很好吃。周末排了40分钟才进去！服务一般。" }, text: { text: "Dim sum was good." }, authorAttribution: { displayName: "Lily W" } },
          ],
          editorialSummary: { text: "Longtime Cantonese banquet hall known for its dim sum." },
        }),
    ],
  ]);
  const d = await detailsGoogle("KEY", "ChIJgolden");
  assert.equal(d.phone, "(604) 278-0873");
  assert.equal(d.mapsUrl, "https://maps.google.com/?cid=123");
  // The review keeps its own language even though details are asked in English.
  assert.deepEqual(d.waitQuote, { text: "周末排了40分钟才进去！", author: "Lily W" });
  assert.equal(d.about, "Longtime Cantonese banquet hall known for its dim sum.");
  assert.equal(d.photo, "https://lh3.googleusercontent.com/places/AbC=s480");
  assert.deepEqual(d.photoBy, { name: "Ming L", uri: "https://maps.google.com/maps/contrib/1" });
  const details = calls.find((c) => c.url.includes("/v1/places/ChIJgolden?"))!;
  assert.match(details.url, /languageCode=en/);
  assert.equal(new Headers(details.init?.headers).get("X-Goog-FieldMask"), "nationalPhoneNumber,googleMapsUri,photos,reviews,editorialSummary");
  const media = calls.find((c) => c.url.includes("/media?"))!;
  assert.match(media.url, /skipHttpRedirect=true/);
  // The key is in our server's request, never in what phones get.
  assert.ok(!d.photo!.includes("KEY"));
});

test("details: no photo when Google gives no author to credit", async () => {
  mockFetch([
    [/\/media\?/, () => json({ photoUri: "https://lh3.googleusercontent.com/x" })],
    [/\/v1\/places\//, () => json({ photos: [{ name: "places/p/photos/x" }] })],
  ]);
  const d = await detailsGoogle("KEY", "p");
  assert.equal(d.photo, undefined);
  assert.equal(d.about, undefined);
});

test("details: the English description only fills in when the search had none", () => {
  const found = fromGoogle({ id: "a", displayName: { text: "金閣" }, location: { latitude: 49.17, longitude: -123.14 }, editorialSummary: { text: "粤式点心" } })!;
  const bare = fromGoogle({ id: "b", displayName: { text: "金閣" }, location: { latitude: 49.17, longitude: -123.14 } })!;
  const details = { phone: "(604) 000-0000", about: "Cantonese dim sum" };
  assert.deepEqual(keepAbout(found, details), { phone: "(604) 000-0000", about: "粤式点心" });
  assert.deepEqual(keepAbout(bare, details), details);
});

// ---- sign-in ----

const env = { GOOGLE_CLIENT_ID: "client-123.apps.googleusercontent.com", GOOGLE_CLIENT_SECRET: "shh", SESSION_SECRET: "a-long-random-secret" };
const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const idToken = (claims: object) => `${b64url({ alg: "RS256" })}.${b64url(claims)}.sig`;

test("session cookie: signed, tamper-proof, expires", async () => {
  const tok = await sign(env.SESSION_SECRET, { sub: "1", name: "小明", exp: Date.now() + 1000 });
  assert.equal((await verify(env.SESSION_SECRET, tok))?.name, "小明");
  assert.equal(await verify("other-secret", tok), null);
  const [body, mac] = tok.split(".");
  const forged = b64url({ sub: "2", name: "x", exp: Date.now() + 1000 });
  assert.equal(await verify(env.SESSION_SECRET, `${forged}.${mac}`), null);
  assert.equal(await verify(env.SESSION_SECRET, `${body}.${mac}`, Date.now() + 5000), null);
});

/** Start a login, then come back from Google with `code` and the state Google echoes. */
async function roundTrip(o: { claims?: object; tokenStatus?: number; echoState?: (s: string) => string; back?: string }) {
  const start = startLogin(new Request(`https://changle.ca/eat/auth/google?back=${encodeURIComponent(o.back ?? "/eat/r/1234")}`), env);
  assert.equal(start.status, 302);
  const go = new URL(start.headers.get("location")!);
  assert.equal(go.origin, "https://accounts.google.com");
  assert.equal(go.searchParams.get("redirect_uri"), "https://changle.ca/eat/auth/callback");
  assert.equal(go.searchParams.get("scope"), "openid profile");
  const stateCookie = start.headers.get("set-cookie")!;
  assert.match(stateCookie, /Path=\/eat; HttpOnly; Secure/);
  const cookie = stateCookie.split(";")[0];
  const state = go.searchParams.get("state")!;
  mockFetch([
    [
      /oauth2\.googleapis\.com\/token/,
      (c) => {
        const form = new URLSearchParams(String(c.init?.body));
        assert.equal(form.get("code"), "the-code");
        assert.equal(form.get("redirect_uri"), "https://changle.ca/eat/auth/callback");
        return json({ id_token: idToken(o.claims ?? {}) }, o.tokenStatus ?? 200);
      },
    ],
  ]);
  const cb = new Request(`https://changle.ca/eat/auth/callback?code=the-code&state=${(o.echoState ?? ((s) => s))(state)}`, { headers: { cookie } });
  return finishLogin(cb, env);
}

test("sign-in: Google's answer becomes our session, and you land back where you were", async () => {
  const { res, session } = await roundTrip({ claims: { sub: "g-42", aud: env.GOOGLE_CLIENT_ID, given_name: "Changle", name: "Changle Jiang" } });
  assert.equal(res.headers.get("location"), "/eat/r/1234");
  assert.equal(session?.sub, "g-42");
  assert.equal(session?.name, "Changle");
  const set = res.headers.get("set-cookie")!;
  assert.match(set, /sb_session=[^;]+; Path=\/eat; HttpOnly; Secure; SameSite=Lax/);
});

test("sign-in: wrong state, wrong audience, or a failed token call all refuse", async () => {
  assert.equal((await roundTrip({ claims: { sub: "g", aud: env.GOOGLE_CLIENT_ID }, echoState: () => "forged" })).res.headers.get("location"), "/eat/?login=failed");
  assert.equal((await roundTrip({ claims: { sub: "g", aud: "someone-else" } })).res.headers.get("location"), "/eat/?login=failed");
  assert.equal((await roundTrip({ claims: { sub: "g", aud: env.GOOGLE_CLIENT_ID }, tokenStatus: 400 })).res.headers.get("location"), "/eat/?login=failed");
});

test("sign-in: 'back' can't send you to another site, or out of /eat", async () => {
  for (const back of ["//evil.example/x", "https://evil.example/x", "/trip/r/1234", "/eaten"]) {
    const { res } = await roundTrip({ claims: { sub: "g", aud: env.GOOGLE_CLIENT_ID }, back });
    assert.equal(res.headers.get("location"), "/eat/", back);
  }
});
