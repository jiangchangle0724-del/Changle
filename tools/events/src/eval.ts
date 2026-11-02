/** The hand-labelled answer key. Empty CSV cells stay empty strings. */
export interface GoldenRow {
  id: string; by: string; kind: string; source: string; url: string; title: string;
  start: string; end: string; status: string; venue: string; address: string;
  area: string; category: string; price: string; sameAs: string; notes: string;
}

export interface StoredEvent {
  id: string; source: string; url: string; title: string; start_at: string;
  all_day: number | boolean; time_tbd: number | boolean;
  venue_name: string | null; venue_address: string | null;
  venue_area: string | null; category: string | null; duplicate_of: string | null;
}

export interface Metric { right: number; of: number; pct: number | null }
const metricNames = ["date", "venue", "category", "area", "falseMerges", "missedMerges"] as const;
type MetricName = (typeof metricNames)[number];
export interface EvalReport {
  read: number; matched: number; notFound: string[]; unread: Record<string, number>;
  date: Metric; venue: Metric; category: Metric; area: Metric;
  falseMerges: Metric; missedMerges: Metric;
  wrong: Record<MetricName, string[]>;
  gateA: boolean;
}

const columns = ["id", "by", "kind", "source", "url", "title", "start", "end", "status",
  "venue", "address", "area", "category", "price", "same_as", "notes"] as const;

/** RFC 4180 fields; the golden contract excludes line breaks inside a field. */
function csvLine(line: string): string[] {
  const fields: string[] = [];
  let field = "", quoted = false, closed = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c !== '"') field += c;
      else if (line[i + 1] === '"') { field += '"'; i++; }
      else { quoted = false; closed = true; }
    } else if (c === ",") {
      fields.push(field); field = ""; closed = false;
    } else if (c === '"' && field === "" && !closed) quoted = true;
    else {
      if (closed || c === '"') throw new Error("Invalid golden CSV quoting");
      field += c;
    }
  }
  if (quoted) throw new Error("Unclosed golden CSV field");
  fields.push(field);
  return fields;
}

export function parseGolden(csv: string): GoldenRow[] {
  const lines = csv.replace(/^\uFEFF/, "").split(/\r?\n/);
  while (lines.at(-1) === "") lines.pop();
  if (!lines.length) return [];
  const header = csvLine(lines[0]);
  if (header.length !== columns.length || columns.some((c) => !header.includes(c))) {
    throw new Error("Invalid golden CSV columns");
  }
  return lines.slice(1).map((line, i) => {
    const fields = csvLine(line);
    if (fields.length !== header.length) throw new Error(`Invalid golden CSV row ${i + 2}`);
    return Object.fromEntries(header.map((key, j) => [key === "same_as" ? "sameAs" : key, fields[j]])) as unknown as GoldenRow;
  });
}

export function readSources(sourceIds: string[]): string[] {
  return sourceIds.map((id) => id === "luma-vancouver" ? "luma" : id);
}

function urlKey(value: string): string {
  // Keep the path exactly as supplied, including case and escaped characters.
  const m = /^([a-z][a-z\d+.-]*:\/\/)([^/?#]+)([^?#]*)/i.exec(value);
  if (!m) return value.split(/[?#]/)[0].replace(/\/+$/, "");
  const host = m[2].toLowerCase().replace(/^lu\.ma(?=:|$)/, "luma.com");
  return m[1].toLowerCase() + host + m[3].replace(/\/+$/, "");
}

const words = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const streetTypes = new Set("street st avenue ave road rd boulevard blvd drive dr place pl way lane ln court ct crescent cres gate highway hwy mall".split(" "));
const directions: Record<string, string> = { e: "east", w: "west", n: "north", s: "south" };
function streetKey(address: string | null): string | null {
  const part = (address ?? "").split(",")[0].toLowerCase()
    .replace(/#\s*\d+\b/g, "").replace(/^\s*\d+\s*-\s*(?=\d)/, "");
  const tokens = words(part).split(" ");
  if (!/^\d+[a-z]?$/.test(tokens[0])) return null;
  return tokens.map((t) => directions[t] ?? t).filter((t) => !streetTypes.has(t)).join(" ");
}

function dateRight(row: GoldenRow, event: StoredEvent): boolean {
  if (row.start.length === 10) {
    return row.start === event.start_at.slice(0, 10) && (!!event.all_day || !!event.time_tbd);
  }
  return !event.all_day && row.start === event.start_at.slice(0, 16).replace("T", " ");
}

/** A dangling link ends at its last existing event; a loop has one stable representative. */
function mergeRoot(event: StoredEvent, byId: Map<string, StoredEvent>): string {
  const path: string[] = [];
  const seen = new Map<string, number>();
  let current = event;
  while (true) {
    const loop = seen.get(current.id);
    if (loop !== undefined) return path.slice(loop).sort()[0];
    seen.set(current.id, path.length); path.push(current.id);
    const next = current.duplicate_of ? byId.get(current.duplicate_of) : undefined;
    if (!next) return current.id;
    current = next;
  }
}

const metric = (right: number, of: number): Metric => ({ right, of, pct: of ? Math.round(right / of * 1000) / 10 : null });
const passes = (m: Metric, threshold: number, fault = false) =>
  m.of > 0 && (fault ? m.right / m.of * 100 < threshold : m.right / m.of * 100 >= threshold);

export function score(golden: GoldenRow[], stored: StoredEvent[], read: string[]): EvalReport {
  const readable = new Set(read);
  const unread: Record<string, number> = {};
  const notFound: string[] = [];
  const matched: { row: GoldenRow; event: StoredEvent; root: string }[] = [];
  const byId = new Map(stored.map((e) => [e.id, e]));
  const byUrl = new Map<string, StoredEvent[]>();
  for (const event of stored) {
    const key = urlKey(event.url);
    const group = byUrl.get(key) ?? [];
    group.push(event); byUrl.set(key, group);
  }
  let readCount = 0;
  for (const row of golden) {
    if (!readable.has(row.source)) {
      Object.defineProperty(unread, row.source, { value: (Object.hasOwn(unread, row.source) ? unread[row.source] : 0) + 1, enumerable: true, configurable: true });
      continue;
    }
    readCount++;
    const candidates = byUrl.get(urlKey(row.url)) ?? [];
    const event = candidates.length === 1 ? candidates[0] : candidates.find((e) => e.start_at.slice(0, 10) === row.start.slice(0, 10));
    if (!event) notFound.push(row.id);
    else matched.push({ row, event, root: mergeRoot(event, byId) });
  }
  const wrong: EvalReport["wrong"] = { date: [], venue: [], category: [], area: [], falseMerges: [], missedMerges: [] };
  let paired = 0;
  for (const { row, event, root } of matched) {
    if (!dateRight(row, event)) wrong.date.push(row.id);
    const street = streetKey(row.address);
    const venueRight = row.address ? street !== null && street === streetKey(event.venue_address)
      : words(row.venue) === words(event.venue_name ?? "");
    if (!venueRight) wrong.venue.push(row.id);
    if (row.category !== event.category) wrong.category.push(row.id);
    if (row.area !== event.venue_area) wrong.area.push(row.id);
    const others = matched.filter((m) => m.row.id !== row.id);
    const partners = others.filter((m) => row.sameAs === m.row.id || m.row.sameAs === row.id);
    if (others.some((m) => m.root === root && !partners.includes(m))) wrong.falseMerges.push(row.id);
    if (partners.length) {
      paired++;
      if (partners.some((m) => m.root !== root)) wrong.missedMerges.push(row.id);
    }
  }
  const count = matched.length;
  const report: EvalReport = {
    read: readCount, matched: count, notFound, unread, wrong,
    date: metric(count - wrong.date.length, count), venue: metric(count - wrong.venue.length, count),
    category: metric(count - wrong.category.length, count), area: metric(count - wrong.area.length, count),
    falseMerges: metric(wrong.falseMerges.length, count), missedMerges: metric(wrong.missedMerges.length, paired), gateA: false,
  };
  report.gateA = passes(report.date, 95) && passes(report.venue, 95) && passes(report.category, 90)
    && passes(report.area, 95) && passes(report.falseMerges, 1, true) && passes(report.missedMerges, 5, true);
  return report;
}

export function formatReport(r: EvalReport): string {
  const thresholds: Record<MetricName, number> = { date: 95, venue: 95, category: 90, area: 95, falseMerges: 1, missedMerges: 5 };
  const lines = [`read ${r.read}; matched ${r.matched}`];
  for (const name of metricNames) {
    const m = r[name], fault = name === "falseMerges" || name === "missedMerges";
    lines.push(`${name} ${m.right}/${m.of} ${m.pct === null ? "n/a" : m.pct.toFixed(1) + "%"}  ${fault ? "<" : ">="} ${thresholds[name]}% ${passes(m, thresholds[name], fault) ? "ok" : "not yet"}`);
  }
  lines.push(`notFound: ${r.notFound.join(", ") || "none"}`);
  for (const name of metricNames) lines.push(`wrong ${name}: ${r.wrong[name].join(", ") || "none"}`);
  lines.push(`unread: ${Object.entries(r.unread).map(([s, n]) => `${s} ${n}`).join(", ") || "none"}`);
  lines.push(`Gate A: ${r.gateA ? "passes" : "not yet"}`);
  return lines.join("\n");
}
