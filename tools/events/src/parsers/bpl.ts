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
    startDate: { date: string };
    startTime: { date: string };
    eventStatus?: string;
    location?: (BplLabel & { slug: string })[];
    type?: BplLabel[];
    audience?: BplLabel[];
    language?: BplLabel[];
  }[];
}

const BRANCHES = new Map<string, Place>([
  ["bob-prittie-metrotown", { name: "Bob Prittie Metrotown", address: "6100 Willingdon Avenue", city: "Burnaby", postalCode: "V5H 4N5", lat: null, lon: null }],
  ["tommy-douglas", { name: "Tommy Douglas", address: "7311 Kingsway", city: "Burnaby", postalCode: "V5E 1G8", lat: null, lon: null }],
  ["mcgill", { name: "McGill", address: "4595 Albert Street", city: "Burnaby", postalCode: "V5C 2G6", lat: null, lon: null }],
  ["cameron", { name: "Temporary Cameron", address: "110 - 9855 Austin Avenue", city: "Burnaby", postalCode: "V3J 1N4", lat: null, lon: null }],
]);

export function parseBpl(feed: BplFeed, source: string): NormalizedEvent[] {
  const out: NormalizedEvent[] = [];
  for (const ev of feed.data) {
    if (ev.group === "past") continue;
    // startTime's day belongs to the series, not this occurrence. Its timezone is also
    // misleading after November 2026: both parts are Vancouver wall-clock values.
    const startMs = fromVan(`${ev.startDate.date.slice(0, 10)}T${ev.startTime.date.slice(11, 19)}`);
    if (!Number.isFinite(startMs)) continue;

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
      sourceEventId: ev.url.slice(ev.url.lastIndexOf("/") + 1),
      url: ev.url,
      title: ev.title.trim(),
      description: null,
      start: vanIso(startMs),
      end: null,
      allDay: false,
      timeTBD: false,
      status: ev.eventStatus === "cancelled" || ev.eventStatus === "rescheduled" ? ev.eventStatus : "scheduled",
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
