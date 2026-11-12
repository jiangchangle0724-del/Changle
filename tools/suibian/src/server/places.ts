// Restaurants from Google Places API (New), or made-up demo ones when no key is set.
//
// Google's terms: everything except the place id is fetched fresh for each room and dropped when
// the room ends; we only keep place ids next to our own numbers. Field masks keep each request to
// the fields we use (Google bills by the fields asked for).
import { RANGES, dishesFor, guessCuisine, mentionsQueue, searchPlan, vancouverDay, vancouverMs, type Center, type Lang, type Place, type RangeId, type SoloSide } from "../engine";
import { curatedFor } from "./curated";

const SEARCH_FIELDS = [
  "places.id",
  "places.displayName",
  "places.primaryType",
  "places.types",
  "places.location",
  "places.rating",
  "places.userRatingCount",
  "places.priceLevel",
  "places.priceRange",
  "places.currentOpeningHours",
  "places.businessStatus",
  "places.reservable",
  "places.servesVegetarianFood",
  "places.editorialSummary",
  // Google bills a search at the dearest field asked for, and the ones above already make it the
  // dearest (Enterprise + Atmosphere), so these cost nothing more. Every place on the list gets its
  // phone, map link and Google's AI summary (English only in Canada, often missing in Chinese).
  "places.generativeSummary",
  "places.nationalPhoneNumber",
  "places.googleMapsUri",
  // Tells branches of one name apart.
  "places.shortFormattedAddress",
].join(",");

// Only for the top of the list: photos and reviews (billed per place). Details are asked in English:
// Google has its descriptions and AI summaries mostly or only in English, the review we quote keeps
// its original language, and nothing else here depends on the language. The summaries ride along
// at no extra cost (reviews already bill this request at the Atmosphere tier).
const DETAIL_FIELDS = ["photos", "reviews", "editorialSummary", "generativeSummary"].join(",");

/** Names and reviews in the host's language where Google has them. */
const languageCode = (lang: Lang) => (lang === "zh" ? "zh-CN" : "en");

/** Rough lowest price per person (CAD) for each Google price level. */
const LEVEL_PRICE: Record<string, [number, string]> = {
  PRICE_LEVEL_FREE: [0, "$"],
  PRICE_LEVEL_INEXPENSIVE: [15, "$"],
  PRICE_LEVEL_MODERATE: [25, "$$"],
  PRICE_LEVEL_EXPENSIVE: [45, "$$$"],
  PRICE_LEVEL_VERY_EXPENSIVE: [90, "$$$$"],
};

interface GPlace {
  id: string;
  displayName?: { text: string };
  primaryType?: string;
  types?: string[];
  location?: { latitude: number; longitude: number };
  rating?: number;
  userRatingCount?: number;
  priceLevel?: string;
  priceRange?: { startPrice?: { units?: string; currencyCode?: string }; endPrice?: { units?: string; currencyCode?: string } };
  currentOpeningHours?: { openNow?: boolean; nextCloseTime?: string; periods?: GPeriod[] };
  businessStatus?: string;
  reservable?: boolean;
  servesVegetarianFood?: boolean;
  editorialSummary?: { text?: string };
  generativeSummary?: GSummary;
  nationalPhoneNumber?: string;
  googleMapsUri?: string;
  shortFormattedAddress?: string;
}

/** A stretch of opening hours. In `currentOpeningHours` each point has its date, for the coming week. */
interface GPeriod {
  open?: GPoint;
  close?: GPoint;
}
interface GPoint {
  date?: { year: number; month: number; day: number };
  /** Day of the week, 0 = Sunday. */
  day?: number;
  hour?: number;
  minute?: number;
}

/** A week, in ms: how long "open around the clock" lasts here. */
const WEEK = 7 * 24 * 3600_000;

/** The coming week's opening hours as [opens, closes] in ms since epoch, from Google's dated periods. */
export function hoursFrom(periods: GPeriod[] | undefined): Place["hours"] {
  const at = (p: GPoint) => (p.date ? vancouverMs({ y: p.date.year, m: p.date.month, d: p.date.day }, (p.hour ?? 0) * 60 + (p.minute ?? 0)) : NaN);
  const out: [number, number][] = [];
  for (const x of periods ?? []) {
    if (!x.open) continue;
    // Open around the clock: Google gives one period that opens at midnight and never closes.
    if (!x.close) {
      if (!x.open.date && !x.open.hour && !x.open.minute) return [[0, Number.MAX_SAFE_INTEGER]];
      const a = at(x.open);
      if (Number.isFinite(a)) out.push([a, a + WEEK]);
      continue;
    }
    const a = at(x.open);
    const b = at(x.close);
    if (Number.isFinite(a) && Number.isFinite(b) && b > a) out.push([a, b]);
  }
  return out.length ? out.sort((p, q) => p[0] - q[0]) : undefined;
}

/** Google's AI summary. Its docs spell the disclosure both ways. */
interface GSummary {
  overview?: { text?: string };
  overviewFlagContentUri?: string;
  disclosureText?: { text?: string };
  disclaimerText?: { text?: string };
}

/** Google's AI summary as a card shows it: never without its disclosure ("Summarized with Gemini"). */
export function summaryFrom(g: GSummary | undefined): Place["summary"] {
  const text = g?.overview?.text?.trim();
  if (!text) return undefined;
  const disclosure = (g!.disclosureText?.text ?? g!.disclaimerText?.text ?? "").trim() || "Summarized with Gemini";
  return { text: text.length > 300 ? `${text.slice(0, 298)}…` : text, disclosure, flag: g!.overviewFlagContentUri };
}

/** Hotels and the like that Google also tags as restaurants (their restaurant is inside). */
const LODGING = /^(lodging|hotel|motel|resort_hotel|inn|bed_and_breakfast|extended_stay_hotel|hostel|guest_house|campground|rv_park|cottage|farmstay|japanese_inn|budget_japanese_inn|private_guest_room)$/;

export function fromGoogle(g: GPlace): Place | null {
  if (!g.id || !g.location || !g.displayName?.text) return null;
  if (g.businessStatus && g.businessStatus !== "OPERATIONAL") return null;
  if (g.primaryType && LODGING.test(g.primaryType)) return null;
  const name = g.displayName.text;
  const level = g.priceLevel ? LEVEL_PRICE[g.priceLevel] : undefined;
  const start = g.priceRange?.startPrice?.units ? Number(g.priceRange.startPrice.units) : undefined;
  const end = g.priceRange?.endPrice?.units ? Number(g.priceRange.endPrice.units) : undefined;
  const cuisine = guessCuisine(name, g.primaryType, g.types);
  const close = g.currentOpeningHours?.nextCloseTime ? Date.parse(g.currentOpeningHours.nextCloseTime) : NaN;
  const halalText = `${name} ${g.editorialSummary?.text ?? ""}`;
  return {
    id: g.id,
    name,
    cuisine,
    lat: g.location.latitude,
    lng: g.location.longitude,
    rating: g.rating,
    ratings: g.userRatingCount,
    price: start ?? level?.[0],
    priceTo: start !== undefined ? end : undefined,
    priceLabel: level?.[1],
    dishes: orNone(dishesFor(name, g.types ?? (g.primaryType ? [g.primaryType] : []), cuisine)),
    openNow: g.currentOpeningHours?.openNow,
    closesAt: Number.isFinite(close) ? close : undefined,
    hours: hoursFrom(g.currentOpeningHours?.periods),
    reservable: g.reservable,
    veg: g.servesVegetarianFood,
    halal: /halal|清真|حلال/i.test(halalText) ? "yes" : undefined,
    about: g.editorialSummary?.text?.trim().slice(0, 160) || undefined,
    summary: summaryFrom(g.generativeSummary),
    phone: g.nationalPhoneNumber,
    mapsUrl: g.googleMapsUri,
    address: g.shortFormattedAddress,
    ...curatedFor(name, g.shortFormattedAddress),
  };
}

const orNone = <T>(xs: T[]) => (xs.length ? xs : undefined);

async function google(key: string, url: string, init: RequestInit & { fields: string }): Promise<unknown> {
  const res = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": init.fields },
  });
  if (!res.ok) throw new Error(`google ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

export interface SearchOptions {
  /** One person's side of the menu: adds a search for that side's restaurants alone. */
  side?: SoloSide;
  /** Turns the parts of the area each time (see searchPlan); fixed without it, as in tests. */
  random?: () => number;
}

/**
 * Restaurants for one pick: the searches searchPlan() lays out (at most four, Google returns 20 per
 * search), merged. A search that fails (a daily cap running out, a hiccup) doesn't lose the others;
 * all of them failing is thrown, for the room or the page to report.
 */
export async function searchGoogle(key: string, center: Center, range: RangeId, lang: Lang, opts: SearchOptions = {}): Promise<Place[]> {
  const url = "https://places.googleapis.com/v1/places:searchNearby";
  const plan = searchPlan(center, range, opts.side, opts.random ?? (() => 0));
  const got = await Promise.allSettled(
    plan.map(
      (c) =>
        google(key, url, {
          method: "POST",
          body: JSON.stringify({
            includedTypes: c.types,
            maxResultCount: 20,
            rankPreference: c.rank,
            languageCode: languageCode(lang),
            regionCode: "CA",
            locationRestriction: { circle: { center: { latitude: c.center.lat, longitude: c.center.lng }, radius: Math.round(c.radius) } },
          }),
          fields: SEARCH_FIELDS,
        }) as Promise<{ places?: GPlace[] }>,
    ),
  );
  const failed = got.flatMap((g) => (g.status === "rejected" ? [g.reason] : []));
  if (failed.length === got.length) throw failed[0];
  if (failed.length) console.error("places", `${failed.length} of ${got.length} searches failed`, String(failed[0]));
  const seen = new Map<string, Place>();
  for (const g of got) {
    if (g.status !== "fulfilled") continue;
    for (const x of g.value.places ?? []) {
      if (seen.has(x.id)) continue;
      const p = fromGoogle(x);
      if (p) seen.set(p.id, p);
    }
  }
  return [...seen.values()];
}

interface GDetails {
  photos?: { name: string; authorAttributions?: { displayName?: string; uri?: string }[] }[];
  reviews?: { text?: { text?: string }; originalText?: { text?: string }; authorAttribution?: { displayName?: string } }[];
  editorialSummary?: { text?: string };
  generativeSummary?: GSummary;
}

/** One photo, any review that mentions queueing, and Google's descriptions in English, for one card. */
export async function detailsGoogle(key: string, id: string): Promise<Partial<Place>> {
  const d = (await google(key, `https://places.googleapis.com/v1/places/${encodeURIComponent(id)}?languageCode=en`, { fields: DETAIL_FIELDS })) as GDetails;
  const out: Partial<Place> = {};
  // Only used when the search (in the table's language) had none: see keepAbout().
  const about = d.editorialSummary?.text?.trim().slice(0, 160);
  if (about) out.about = about;
  const summary = summaryFrom(d.generativeSummary);
  if (summary) out.summary = summary;
  for (const r of d.reviews ?? []) {
    const text = r.originalText?.text ?? r.text?.text ?? "";
    if (mentionsQueue(text)) {
      out.waitQuote = { text: excerpt(text), author: r.authorAttribution?.displayName ?? "Google" };
      break;
    }
  }
  const photo = d.photos?.[0];
  if (photo?.name) {
    // skipHttpRedirect gives a photo URL without our key in it, safe to hand to phones.
    const res = await fetch(`https://places.googleapis.com/v1/${photo.name}/media?maxWidthPx=480&skipHttpRedirect=true&key=${encodeURIComponent(key)}`);
    const uri = res.ok ? ((await res.json()) as { photoUri?: string }).photoUri : undefined;
    const by = photo.authorAttributions?.[0];
    // No photo without its author: Google's terms require showing who took it.
    if (uri && by?.displayName) {
      out.photo = uri;
      out.photoBy = { name: by.displayName, uri: by.uri };
    }
  }
  return out;
}

/** The sentence around the queue mention, at most ~90 characters. */
function excerpt(text: string): string {
  const parts = text.split(/(?<=[。！？!?.\n])/);
  const hit = parts.find((s) => mentionsQueue(s)) ?? text;
  const s = hit.trim();
  return s.length > 90 ? `${s.slice(0, 88)}…` : s;
}

// ---- demo data: clearly made up, for local development, tests, and before the key is set ----

const DEMO: [string, string, number, number, string, boolean?][] = [
  ["示例 · 金满楼点心", "chinese_restaurant", 4.3, 1800, "PRICE_LEVEL_MODERATE", true],
  ["示例 · 港记茶餐厅", "chinese_restaurant", 4.1, 650, "PRICE_LEVEL_INEXPENSIVE"],
  ["示例 · 蜀香川菜", "chinese_restaurant", 4.4, 900, "PRICE_LEVEL_MODERATE"],
  ["示例 · 小肥羊火锅", "hot_pot_restaurant", 4.2, 1200, "PRICE_LEVEL_MODERATE", true],
  ["示例 · 台北牛肉面", "taiwanese_restaurant", 4.5, 420, "PRICE_LEVEL_INEXPENSIVE"],
  ["Demo · Ramen Hinoki", "ramen_restaurant", 4.6, 2100, "PRICE_LEVEL_INEXPENSIVE"],
  ["Demo · Sushi Kaze", "sushi_restaurant", 4.4, 760, "PRICE_LEVEL_EXPENSIVE", true],
  ["Demo · Seoul Table BBQ", "korean_restaurant", 4.3, 980, "PRICE_LEVEL_MODERATE", true],
  ["Demo · Pho Lotus", "vietnamese_restaurant", 4.2, 540, "PRICE_LEVEL_INEXPENSIVE"],
  ["Demo · Bangkok Basil", "thai_restaurant", 4.3, 610, "PRICE_LEVEL_MODERATE"],
  ["Demo · Spice Route Halal Grill", "middle_eastern_restaurant", 4.5, 330, "PRICE_LEVEL_INEXPENSIVE"],
  ["Demo · Tandoor House", "indian_restaurant", 4.4, 700, "PRICE_LEVEL_MODERATE", true],
  ["Demo · Nonna's Pasta", "italian_restaurant", 4.2, 880, "PRICE_LEVEL_MODERATE", true],
  ["Demo · Taco Loco", "mexican_restaurant", 4.1, 450, "PRICE_LEVEL_INEXPENSIVE"],
  ["Demo · Harbour Oyster Bar", "seafood_restaurant", 4.6, 1300, "PRICE_LEVEL_EXPENSIVE", true],
  ["Demo · Green Leaf Kitchen", "vegan_restaurant", 4.5, 390, "PRICE_LEVEL_MODERATE"],
  ["Demo · Laksa King", "malaysian_restaurant", 4.3, 520, "PRICE_LEVEL_INEXPENSIVE"],
  ["Demo · Burger Lab", "hamburger_restaurant", 4.0, 1100, "PRICE_LEVEL_INEXPENSIVE"],
];

/**
 * Made-up opening hours for the coming week, so planning ahead works in demo mode too: most places
 * 11:00–22:00; the dim sum place 9:00–15:00 and 17:00–22:00; every fourth place shut on Mondays.
 */
function demoHours(i: number, now: number): GPeriod[] {
  const out: GPeriod[] = [];
  for (let k = 0; k < 7; k++) {
    const day = vancouverDay(now, k);
    const date = { year: day.y, month: day.m, day: day.d };
    const dow = new Date(Date.UTC(day.y, day.m - 1, day.d)).getUTCDay();
    if (i % 4 === 3 && dow === 1) continue;
    const spans: [number, number][] = i === 0 ? [[9, 15], [17, 22]] : [[11, 22]];
    for (const [a, b] of spans) out.push({ open: { date, hour: a, minute: 0 }, close: { date, hour: b, minute: 0 } });
  }
  return out;
}

/** Made-up restaurants scattered around the starting point, always open for the next few hours. */
export function demoPlaces(center: Center, range: RangeId, now: number): Place[] {
  const r = RANGES[range].meters;
  return DEMO.map(([name, type, rating, count, level, reservable], i) => {
    const angle = (i * 137.5 * Math.PI) / 180;
    const dist = r * (0.15 + ((i * 37) % 80) / 100);
    const p = fromGoogle({
      id: `demo-${i}`,
      displayName: { text: name },
      primaryType: type,
      location: { latitude: center.lat + (dist * Math.cos(angle)) / 111_320, longitude: center.lng + (dist * Math.sin(angle)) / (111_320 * Math.cos((center.lat * Math.PI) / 180)) },
      rating,
      userRatingCount: count,
      priceLevel: level,
      currentOpeningHours: { openNow: true, nextCloseTime: new Date(now + (2 + (i % 4)) * 3600_000).toISOString(), periods: demoHours(i, now) },
      reservable: reservable ?? false,
      servesVegetarianFood: type === "vegan_restaurant" || type === "indian_restaurant" || type === "italian_restaurant" ? true : undefined,
    })!;
    return { ...p, demo: true, phone: "604-555-0" + String(100 + i), mapsUrl: `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}`, ...DEMO_EXTRA[i] };
  });
}

/** Made-up descriptions, a list badge and a pick, so the cards show every part in demo mode too. */
const DEMO_EXTRA: Record<number, Partial<Place>> = {
  0: {
    about: "示例：推车点心，周末一早就满座",
    recommend: {
      note: { zh: "示例推荐：虾饺皮薄，周末早点去", en: "Demo pick: thin-skinned har gow; go early at weekends" },
      by: "Steve",
      links: [{ platform: "小红书", url: "https://www.xiaohongshu.com/", title: "示例探店" }],
    },
  },
  2: { about: "示例：水煮鱼和口水鸡，辣度可以选" },
  5: {
    about: "Demo: rich tonkotsu ramen at a quick counter",
    badges: [{ source: "demo", label: { zh: "示例榜单 · 必吃拉面", en: "Demo list · must-try ramen" }, year: 2026 }],
  },
  8: {
    about: "Demo: pho and banh mi, open late",
    // Where Google's AI summary would be; made up like everything here, and labelled so.
    summary: { text: "Demo: a made-up summary in the place of Google's AI one, which comes in English.", disclosure: "Demo, not from Google" },
  },
};

/** Details never replace a description or summary the search already gave in the table's own language. */
export function keepAbout(p: Place, details: Partial<Place>): Partial<Place> {
  const out = { ...details };
  if (p.about) out.about = p.about;
  if (p.summary) out.summary = p.summary;
  return out;
}
