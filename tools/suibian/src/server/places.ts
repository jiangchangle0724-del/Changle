// Restaurants from Google Places API (New), or made-up demo ones when no key is set.
//
// Google's terms: everything except the place id is fetched fresh for each room and dropped when
// the room ends; we only keep place ids next to our own numbers. Field masks keep each request to
// the fields we use (Google bills by the fields asked for).
import { RANGES, guessCuisine, mentionsQueue, type Center, type Place, type RangeId } from "../engine";

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
].join(",");

const DETAIL_FIELDS = ["nationalPhoneNumber", "googleMapsUri", "photos", "reviews"].join(",");

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
  priceRange?: { startPrice?: { units?: string; currencyCode?: string } };
  currentOpeningHours?: { openNow?: boolean; nextCloseTime?: string };
  businessStatus?: string;
  reservable?: boolean;
  servesVegetarianFood?: boolean;
  editorialSummary?: { text?: string };
}

export function fromGoogle(g: GPlace): Place | null {
  if (!g.id || !g.location || !g.displayName?.text) return null;
  if (g.businessStatus && g.businessStatus !== "OPERATIONAL") return null;
  const name = g.displayName.text;
  const level = g.priceLevel ? LEVEL_PRICE[g.priceLevel] : undefined;
  const start = g.priceRange?.startPrice?.units ? Number(g.priceRange.startPrice.units) : undefined;
  const close = g.currentOpeningHours?.nextCloseTime ? Date.parse(g.currentOpeningHours.nextCloseTime) : NaN;
  const halalText = `${name} ${g.editorialSummary?.text ?? ""}`;
  return {
    id: g.id,
    name,
    cuisine: guessCuisine(name, g.primaryType, g.types),
    lat: g.location.latitude,
    lng: g.location.longitude,
    rating: g.rating,
    ratings: g.userRatingCount,
    price: start ?? level?.[0],
    priceLabel: level?.[1],
    openNow: g.currentOpeningHours?.openNow,
    closesAt: Number.isFinite(close) ? close : undefined,
    reservable: g.reservable,
    veg: g.servesVegetarianFood,
    halal: /halal|清真|حلال/i.test(halalText) ? "yes" : undefined,
  };
}

async function google(key: string, url: string, init: RequestInit & { fields: string }): Promise<unknown> {
  const res = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json", "X-Goog-Api-Key": key, "X-Goog-FieldMask": init.fields },
  });
  if (!res.ok) throw new Error(`google ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}

/** Up to 40 restaurants: the 20 most popular and the 20 nearest (Google returns 20 per call). */
export async function searchGoogle(key: string, center: Center, range: RangeId): Promise<Place[]> {
  const body = (rank: "POPULARITY" | "DISTANCE") =>
    JSON.stringify({
      includedTypes: ["restaurant"],
      maxResultCount: 20,
      rankPreference: rank,
      languageCode: "zh-CN",
      regionCode: "CA",
      locationRestriction: { circle: { center: { latitude: center.lat, longitude: center.lng }, radius: RANGES[range].meters } },
    });
  const url = "https://places.googleapis.com/v1/places:searchNearby";
  const lists = await Promise.all(
    (["POPULARITY", "DISTANCE"] as const).map((r) => google(key, url, { method: "POST", body: body(r), fields: SEARCH_FIELDS }) as Promise<{ places?: GPlace[] }>),
  );
  const seen = new Map<string, Place>();
  for (const l of lists) for (const g of l.places ?? []) if (!seen.has(g.id)) {
    const p = fromGoogle(g);
    if (p) seen.set(p.id, p);
  }
  return [...seen.values()];
}

interface GDetails {
  nationalPhoneNumber?: string;
  googleMapsUri?: string;
  photos?: { name: string }[];
  reviews?: { text?: { text?: string }; originalText?: { text?: string }; authorAttribution?: { displayName?: string } }[];
}

/** Phone, map link, one photo and any review that mentions queueing, for one card. */
export async function detailsGoogle(key: string, id: string): Promise<Partial<Place>> {
  const d = (await google(key, `https://places.googleapis.com/v1/places/${encodeURIComponent(id)}?languageCode=zh-CN`, { fields: DETAIL_FIELDS })) as GDetails;
  const out: Partial<Place> = { phone: d.nationalPhoneNumber, mapsUrl: d.googleMapsUri };
  for (const r of d.reviews ?? []) {
    const text = r.originalText?.text ?? r.text?.text ?? "";
    if (mentionsQueue(text)) {
      out.waitQuote = { text: excerpt(text), author: r.authorAttribution?.displayName ?? "Google" };
      break;
    }
  }
  const photo = d.photos?.[0]?.name;
  if (photo) {
    // skipHttpRedirect gives a photo URL without our key in it, safe to hand to phones.
    const res = await fetch(`https://places.googleapis.com/v1/${photo}/media?maxWidthPx=480&skipHttpRedirect=true&key=${encodeURIComponent(key)}`);
    if (res.ok) out.photo = ((await res.json()) as { photoUri?: string }).photoUri;
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
      currentOpeningHours: { openNow: true, nextCloseTime: new Date(now + (2 + (i % 4)) * 3600_000).toISOString() },
      reservable: reservable ?? false,
      servesVegetarianFood: type === "vegan_restaurant" || type === "indian_restaurant" || type === "italian_restaurant" ? true : undefined,
    })!;
    return { ...p, demo: true, phone: "604-555-0" + String(100 + i), mapsUrl: `https://www.google.com/maps/search/?api=1&query=${p.lat},${p.lng}` };
  });
}
