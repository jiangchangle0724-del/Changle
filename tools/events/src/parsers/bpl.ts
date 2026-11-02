// Burnaby's own programs feed (BiblioCommons' "bpl" is Boston).
import { fromVan, vanIso } from "../time";
import type { Lang, NormalizedEvent, Place, Tag } from "../types";
import { categoryOf } from "./bibliocommons";

interface BplLabel {
  title: string;
}

/** Only the fields read from the feed; meta and the supplied timezone labels are ignored. */
export interface BplFeed {
  data: {
    title: string;
    url: string;
    group: string;
    startDate?: { date?: string | null } | null;
    startTime?: { date?: string | null } | null;
    eventStatus?: string;
    location?: (BplLabel & { slug: string })[];
    type?: BplLabel[];
    audience?: BplLabel[];
    language?: BplLabel[];
  }[];
}

// With coordinates, so the boundaries decide the area: the temporary Cameron branch, in Lougheed
// Town Centre on the Burnaby side of North Road, has a V3J postal code, which is Coquitlam's (the
// table in src/area.ts would put it in the Tri-Cities). The three others are Wikipedia's
// ("Burnaby Public Library"); Cameron's is the mall's (geocoder.ca).
const BRANCHES = new Map<string, Place>([
  ["bob-prittie-metrotown", { name: "Bob Prittie Metrotown", address: "6100 Willingdon Avenue", city: "Burnaby", postalCode: "V5H 4N5", lat: 49.2281, lon: -123.0064 }],
  ["tommy-douglas", { name: "Tommy Douglas", address: "7311 Kingsway", city: "Burnaby", postalCode: "V5E 1G8", lat: 49.219, lon: -122.9523 }],
  ["mcgill", { name: "McGill", address: "4595 Albert Street", city: "Burnaby", postalCode: "V5C 2G6", lat: 49.2826, lon: -123.0005 }],
  ["cameron", { name: "Temporary Cameron", address: "110 - 9855 Austin Avenue", city: "Burnaby", postalCode: "V3J 1N4", lat: 49.2503, lon: -122.8962 }],
]);

export function parseBpl(feed: BplFeed, source: string): NormalizedEvent[] {
  const out: NormalizedEvent[] = [];
  for (const ev of feed.data) {
    if (ev.group === "past") continue;
    const date = ev.startDate?.date?.slice(0, 10);
    if (!date) continue;
    // startTime's day belongs to the series, not this occurrence. Its timezone is also
    // misleading after November 2026: both parts are Vancouver wall-clock values.
    const time = ev.startTime?.date?.slice(11, 19);
    const timeTBD = !time;
    const startMs = fromVan(time ? `${date}T${time}` : date);
    if (!Number.isFinite(startMs)) continue;
    let sourceEventId: string | undefined;
    try {
      sourceEventId = new URL(ev.url).pathname.split("/").filter(Boolean).at(-1);
    } catch {
      continue;
    }
    if (!sourceEventId) continue;
    const status = ev.eventStatus?.toLowerCase();

    const types = (ev.type ?? []).map((x) => x.title);
    const audiences = (ev.audience ?? []).map((x) => x.title);
    const languages = (ev.language ?? []).map((x) => x.title);
    const chinese = languages.some((l) => /chinese|mandarin|cantonese/i.test(l));
    const english = languages.length === 0 || languages.some((l) => /english/i.test(l));
    const lang: Lang = chinese ? (english && languages.length > 1 ? "both" : "zh") : "en";
    const loc = ev.location?.[0];
    const online = loc?.slug === "online";
    const place: Place | null = online || !loc ? null : {
      ...(BRANCHES.get(loc.slug) ?? { name: loc.title, address: null, city: null, postalCode: null, lat: null, lon: null }),
    };
    const tags: Tag[] = ["free"];
    if (audiences.some((a) => /children/i.test(a))) tags.push("kids");
    if (chinese) tags.push("chinese");
    if (!online) tags.push("indoor");

    out.push({
      source,
      sourceEventId,
      url: ev.url,
      title: ev.title.trim(),
      description: null,
      start: timeTBD ? date : vanIso(startMs),
      end: null,
      allDay: timeTBD,
      timeTBD,
      status: status === "cancelled" || status === "canceled" ? "cancelled" : status === "rescheduled" || status === "postponed" ? status : "scheduled",
      place,
      online,
      priceMin: 0,
      priceMax: 0,
      isFree: true,
      category: categoryOf(types, audiences),
      sourceCategories: [...types, ...audiences],
      tags,
      lang,
      imageUrl: null,
      organizer: place?.name ?? null,
    });
  }
  return out;
}
