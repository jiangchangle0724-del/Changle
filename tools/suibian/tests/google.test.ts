// The Google parts, against recorded-shape responses (no key in tests): Places search and details,
// photos with their author, and the sign-in round trip.
import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { finishLogin, sign, startLogin, verify } from "../src/server/auth";
import { vancouverClock } from "../src/engine";
import { detailsGoogle, fromGoogle, hoursFrom, keepAbout, searchGoogle } from "../src/server/places";

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
  nationalPhoneNumber: "(604) 278-0873",
  googleMapsUri: "https://maps.google.com/?cid=123",
  generativeSummary: {
    overview: { text: "Big Cantonese banquet hall serving dim sum by day and seafood at night.", languageCode: "en-US" },
    overviewFlagContentUri: "https://www.google.com/local/review/rap/report?postId=x",
    disclosureText: { text: "Summarized with Gemini", languageCode: "en-US" },
  },
};

test("search: a short walk is two Nearby Search calls, the right headers and body, results merged", async () => {
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
  const places = await searchGoogle("KEY", center, "walk10", "en");
  assert.equal(calls.length, 2);
  for (const c of calls) {
    const h = new Headers(c.init?.headers);
    assert.equal(h.get("X-Goog-Api-Key"), "KEY");
    assert.match(h.get("X-Goog-FieldMask")!, /places\.currentOpeningHours/);
    // On every place of the list, at no extra cost: the mask already bills at Enterprise + Atmosphere.
    for (const f of ["places.generativeSummary", "places.nationalPhoneNumber", "places.googleMapsUri", "places.reservable", "places.servesDinner", "places.servesLunch", "places.dineIn"]) assert.ok(h.get("X-Goog-FieldMask")!.split(",").includes(f), f);
    const body = JSON.parse(String(c.init?.body));
    assert.deepEqual(body.includedTypes, ["restaurant"]);
    assert.equal(body.maxResultCount, 20);
    assert.equal(body.languageCode, "en");
    assert.deepEqual(body.locationRestriction.circle, { center: { latitude: center.lat, longitude: center.lng }, radius: 800 });
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
  assert.equal(p.priceTo, 40);
  assert.equal(p.priceLabel, "$$");
  assert.equal(p.phone, "(604) 278-0873");
  assert.equal(p.mapsUrl, "https://maps.google.com/?cid=123");
  assert.deepEqual(p.summary, {
    text: "Big Cantonese banquet hall serving dim sum by day and seafood at night.",
    disclosure: "Summarized with Gemini",
    flag: "https://www.google.com/local/review/rap/report?postId=x",
  });
  assert.deepEqual(p.dishes, ["seafood"]);
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

test("search: a drive asks the whole area and three parts of it, so more than the same 40 come in", async () => {
  mockFetch([
    [
      /searchNearby/,
      (c) => {
        // Each search finds its own place, as different corners of a big area would.
        const { latitude, longitude } = JSON.parse(String(c.init?.body)).locationRestriction.circle.center;
        return json({ places: [{ ...golden, id: `ChIJ${latitude.toFixed(5)}_${longitude.toFixed(5)}`, location: { latitude, longitude } }] });
      },
    ],
  ]);
  const places = await searchGoogle("KEY", center, "drive15", "en", { random: () => 0.25 });
  assert.equal(calls.length, 4);
  const bodies = calls.map((c) => JSON.parse(String(c.init?.body)));
  assert.deepEqual(bodies[0].locationRestriction.circle, { center: { latitude: center.lat, longitude: center.lng }, radius: 6000 });
  for (const b of bodies.slice(1)) {
    assert.equal(b.rankPreference, "POPULARITY");
    assert.equal(b.locationRestriction.circle.radius, 3300);
  }
  assert.equal(places.length, 4);
});

test("search: round 1's liked cuisines get their own searches: by Google's type, or by words where it has none", async () => {
  // A 川菜 place whose name doesn't say so, one just outside the circle, and one found twice.
  const tony = { ...golden, id: "ChIJtony", displayName: { text: "Chef Tony" }, location: { latitude: center.lat + 0.004, longitude: center.lng } };
  const far = { ...golden, id: "ChIJfar", displayName: { text: "Corner Spot" }, location: { latitude: center.lat + 0.0071, longitude: center.lng + 0.0105 } };
  const pot = { ...golden, id: "ChIJpot", displayName: { text: "Liuyishou" }, types: ["chinese_restaurant", "hot_pot_restaurant", "restaurant"] };
  mockFetch([
    [/places:searchText$/, () => json({ places: [tony, far, golden] })],
    [/places:searchNearby$/, (c) => json({ places: JSON.parse(String(c.init?.body)).includedTypes[0] === "hot_pot_restaurant" ? [pot] : [golden] })],
  ]);
  const places = await searchGoogle("KEY", center, "walk10", "zh", { liked: ["sichuan", "hotpot"] });
  assert.equal(calls.length, 4);
  const text = calls.find((c) => /searchText$/.test(c.url))!;
  const body = JSON.parse(String(text.init?.body));
  assert.equal(body.textQuery, "Sichuan restaurant");
  assert.equal(body.pageSize, 20);
  assert.equal(body.languageCode, "zh-CN");
  // A Text Search takes only a rectangle: the square around the circle.
  const { low, high } = body.locationRestriction.rectangle;
  assert.ok(low.latitude < center.lat && high.latitude > center.lat && low.longitude < center.lng && high.longitude > center.lng);
  assert.ok(Math.abs(high.latitude - low.latitude - (2 * 800) / 111_320) < 1e-9);
  assert.equal(new Headers(text.init?.headers).get("X-Goog-FieldMask"), new Headers(calls[0].init?.headers).get("X-Goog-FieldMask"), "the same fields, the same price tier");
  const nearby = calls.filter((c) => /searchNearby$/.test(c.url)).map((c) => JSON.parse(String(c.init?.body)));
  assert.deepEqual(nearby.map((b) => b.includedTypes), [["restaurant"], ["hot_pot_restaurant"], ["restaurant"]]);
  assert.deepEqual(places.map((p) => p.id).sort(), ["ChIJgolden", "ChIJpot", "ChIJtony"], "outside the circle dropped, the same place once");
  const by = (id: string) => places.find((p) => p.id === id)!;
  assert.equal(by("ChIJtony").cuisine, "sichuan", "found by the Sichuan search, its name doesn't say otherwise");
  assert.equal(by("ChIJgolden").cuisine, "cantonese", "its name says Cantonese");
  assert.equal(by("ChIJpot").cuisine, "hotpot", "Google's other types say hot pot");
});

test("search: one search failing (a daily cap running out) keeps what the others found", async () => {
  mockFetch([
    [
      /searchNearby/,
      (c) => (JSON.parse(String(c.init?.body)).rankPreference === "DISTANCE" ? json({ error: { code: 429 } }, 429) : json({ places: [golden] })),
    ],
  ]);
  const quiet = console.error;
  console.error = () => {};
  try {
    const places = await searchGoogle("KEY", center, "walk10", "en");
    assert.deepEqual(places.map((p) => p.id), [golden.id]);
  } finally {
    console.error = quiet;
  }
});

test("place from Google: missing fields stay missing, halal from the name or description", () => {
  const p = fromGoogle({ id: "x", displayName: { text: "Spice Hut" }, location: { latitude: 49.2, longitude: -123.1 }, editorialSummary: { text: "Halal Pakistani grill" } })!;
  assert.equal(p.halal, "yes");
  assert.equal(p.rating, undefined);
  assert.equal(p.price, undefined);
  assert.equal(p.closesAt, undefined);
  assert.equal(fromGoogle({ id: "y", location: { latitude: 1, longitude: 1 } }), null);
});

test("place from Google: what it says about groups, kids, drinks and the kind of place, for the occasion; halal from its type", () => {
  const base = { location: { latitude: 49.28, longitude: -123.12 }, displayName: { text: "Some Place" } };
  const p = fromGoogle({ ...base, id: "a", types: ["restaurant", "bar", "halal_restaurant"], goodForGroups: true, goodForChildren: false, servesWine: true, servesCocktails: true })!;
  assert.deepEqual(p.traits, { groups: true, kids: false, wine: true, cocktails: true, bar: true });
  assert.equal(p.halal, "yes");
  assert.deepEqual(fromGoogle({ ...base, id: "b", types: ["fast_food_restaurant", "restaurant"] })!.traits, { fastFood: true });
  assert.deepEqual(fromGoogle({ ...base, id: "c", types: ["fine_dining_restaurant", "restaurant"] })!.traits, { fineDining: true });
  assert.equal(fromGoogle({ ...base, id: "d" })!.traits, undefined, "nothing said, nothing guessed");
  // The kind of place, from its main type; the meals it serves; takeout only.
  const bagels = fromGoogle({ ...base, id: "e", primaryType: "bagel_shop", types: ["bagel_shop", "bakery", "restaurant"], servesBreakfast: true, servesDinner: true })!;
  assert.deepEqual(bagels.traits, { breakfast: true, dinner: true, kind: "breakfast" });
  assert.equal(fromGoogle({ ...base, id: "f", primaryType: "coffee_shop", types: ["coffee_shop", "cafe"] })!.traits?.kind, "cafe");
  assert.equal(fromGoogle({ ...base, id: "g", primaryType: "hamburger_restaurant", types: ["hamburger_restaurant", "fast_food_restaurant"] })!.traits?.kind, "fastFood");
  assert.equal(fromGoogle({ ...base, id: "h", primaryType: "chinese_restaurant", types: ["chinese_restaurant"], dineIn: false })!.traits?.kind, "counter");
  assert.equal(fromGoogle({ ...base, id: "i", primaryType: "wine_bar", types: ["wine_bar", "bar"] })!.traits?.kind, "bar");
  assert.equal(fromGoogle({ ...base, id: "j", primaryType: "steak_house", types: ["steak_house", "restaurant"] })!.traits, undefined, "a plain restaurant has no kind");
});

test("search: an occasion's searches leave out what it rules out; a liked cuisine's search doesn't", async () => {
  mockFetch([[/places:searchNearby$/, () => json({ places: [golden] })]]);
  const dinner = Date.parse("2026-11-13T02:30:00Z"); // Thursday 6:30 pm in Vancouver
  await searchGoogle("KEY", center, "walk10", "zh", { occasion: "business", at: dinner, liked: ["cafe"] });
  const bodies = calls.map((c) => JSON.parse(String(c.init?.body)));
  assert.equal(bodies.length, 4);
  assert.deepEqual(bodies[1].includedTypes.slice(0, 2), ["fine_dining_restaurant", "steak_house"], "the occasion's own search");
  for (const b of bodies) {
    if (b.includedTypes.includes("coffee_shop")) assert.equal(b.excludedPrimaryTypes, undefined, "someone liked cafés");
    else assert.ok(b.excludedPrimaryTypes.includes("bagel_shop") && b.excludedPrimaryTypes.includes("cafe"));
  }
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

test("details: a queue review with its author, a photo with its author, Google's summaries in English", async () => {
  mockFetch([
    [/\/media\?/, () => json({ name: "places/ChIJgolden/photos/AbC/media", photoUri: "https://lh3.googleusercontent.com/places/AbC=s480" })],
    [
      /\/v1\/places\/ChIJgolden\?/,
      () =>
        json({
          photos: [{ name: "places/ChIJgolden/photos/AbC", widthPx: 4032, heightPx: 3024, authorAttributions: [{ displayName: "Ming L", uri: "https://maps.google.com/maps/contrib/1" }] }],
          reviews: [
            { text: { text: "Great har gow." }, authorAttribution: { displayName: "A" } },
            { originalText: { text: "点心很好吃。周末排了40分钟才进去！服务一般。" }, text: { text: "Dim sum was good." }, authorAttribution: { displayName: "Lily W" } },
          ],
          editorialSummary: { text: "Longtime Cantonese banquet hall known for its dim sum." },
          // Google's own docs also spell it "disclaimerText".
          generativeSummary: { overview: { text: "Dim sum hall." }, disclaimerText: { text: "Summarized with Gemini" } },
        }),
    ],
  ]);
  const d = await detailsGoogle("KEY", "ChIJgolden");
  assert.deepEqual(d.summary, { text: "Dim sum hall.", disclosure: "Summarized with Gemini", flag: undefined });
  // The review keeps its own language even though details are asked in English.
  assert.deepEqual(d.waitQuote, { text: "周末排了40分钟才进去！", author: "Lily W" });
  assert.equal(d.about, "Longtime Cantonese banquet hall known for its dim sum.");
  assert.equal(d.photo, "https://lh3.googleusercontent.com/places/AbC=s480");
  assert.deepEqual(d.photoBy, { name: "Ming L", uri: "https://maps.google.com/maps/contrib/1" });
  const details = calls.find((c) => c.url.includes("/v1/places/ChIJgolden?"))!;
  assert.match(details.url, /languageCode=en/);
  assert.equal(new Headers(details.init?.headers).get("X-Goog-FieldMask"), "photos,reviews,editorialSummary,generativeSummary");
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

test("details: the English description and summary only fill in when the search had none", () => {
  const found = fromGoogle({ id: "a", displayName: { text: "金閣" }, location: { latitude: 49.17, longitude: -123.14 }, editorialSummary: { text: "粤式点心" } })!;
  const bare = fromGoogle({ id: "b", displayName: { text: "金閣" }, location: { latitude: 49.17, longitude: -123.14 } })!;
  const summary = { text: "Dim sum hall.", disclosure: "Summarized with Gemini" };
  const details = { photo: "https://lh3.googleusercontent.com/x", about: "Cantonese dim sum", summary };
  assert.deepEqual(keepAbout(found, details), { ...details, about: "粤式点心" });
  assert.deepEqual(keepAbout(bare, details), details);
  const summed = { ...bare, summary: { text: "From the search.", disclosure: "Summarized with Gemini" } };
  assert.equal(keepAbout(summed, details).summary?.text, "From the search.");
});

test("place from Google: a summary never without its disclosure; a price range with both ends", () => {
  const base = { id: "s", displayName: { text: "X" }, location: { latitude: 49.2, longitude: -123.1 } };
  assert.equal(fromGoogle({ ...base, generativeSummary: { overview: { text: "  " } } })!.summary, undefined);
  assert.equal(fromGoogle({ ...base, generativeSummary: { overview: { text: "Cozy spot." } } })!.summary?.disclosure, "Summarized with Gemini");
  const open = fromGoogle({ ...base, priceRange: { startPrice: { units: "100" } }, priceLevel: "PRICE_LEVEL_VERY_EXPENSIVE" })!;
  assert.equal(open.price, 100);
  assert.equal(open.priceTo, undefined);
  assert.equal(fromGoogle({ ...base, priceLevel: "PRICE_LEVEL_MODERATE" })!.priceTo, undefined, "no range from a level alone");
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

test("opening hours: Google's dated periods for the coming week, past midnight and around the clock", () => {
  const d = (day: number) => ({ year: 2026, month: 11, day });
  const hours = hoursFrom([
    { open: { date: d(13), hour: 17, minute: 30 }, close: { date: d(14), hour: 1, minute: 0 } },
    { open: { date: d(12), hour: 11, minute: 0 }, close: { date: d(12), hour: 14, minute: 30 } },
    { open: { hour: 9 } },
  ])!;
  assert.equal(hours.length, 2, "a period with no date and no close that isn't midnight is skipped");
  assert.ok(hours[0][0] < hours[1][0], "in order");
  assert.equal(vancouverClock(hours[0][0]).minutes, 11 * 60);
  assert.equal(vancouverClock(hours[0][1]).minutes, 14 * 60 + 30);
  assert.equal(hours[1][1] - hours[1][0], 7.5 * 3600_000, "past midnight");
  assert.deepEqual(hoursFrom([{ open: { day: 0, hour: 0, minute: 0 } }]), [[0, Number.MAX_SAFE_INTEGER]]);
  assert.equal(hoursFrom(undefined), undefined);
  const p = fromGoogle({ ...golden, currentOpeningHours: { openNow: true, periods: [{ open: { date: d(12), hour: 11, minute: 0 }, close: { date: d(12), hour: 22, minute: 0 } }] } })!;
  assert.equal(p.hours?.length, 1);
});

