// What's On: the libraries' hand-over (src/handoff.ts). GitHub runs this every morning at 05:50
// Vancouver time (.github/workflows/events-libraries.yml). It reads Vancouver's and Richmond's
// library pages with exactly the requests the 06:00 run would make, and hands each page to the
// Worker, which keeps it for the run. (BiblioCommons refuses requests from Cloudflare Workers.)
//   npm run libraries -- --dry-run   read the pages and print what came; nothing is sent, no key needed
//   npm run libraries                read, then hand over: needs EVENTS_HANDOFF_URL and EVENTS_HANDOFF_KEY
// Ends with an error (a red run on GitHub) when a library couldn't be read to the end or the Worker
// refuses a page. The pages read before a library failed are still handed over.
import { fetchPages, handOver, HANDOFF_SOURCES, type Page } from "../src/handoff";
import { vanParts, windowOf } from "../src/time";

const dry = process.argv.includes("--dry-run");
const endpoint = process.env.EVENTS_HANDOFF_URL ?? "";
const key = process.env.EVENTS_HANDOFF_KEY ?? "";

/** A failure, said loudly: on GitHub also as an error on the run's page. */
function fail(text: string): void {
  console.error(process.env.GITHUB_ACTIONS === "true" ? `::error title=What's On libraries::${text}` : `error: ${text}`);
  process.exitCode = 1;
}

const kb = (chars: number) => `${Math.round(chars / 1024)} KB`;
const sum = (pages: Page[], f: (p: Page) => number) => pages.reduce((n, p) => n + f(p), 0);

async function main(): Promise<void> {
  if (!dry && !endpoint) return fail("EVENTS_HANDOFF_URL is not set (where to hand the pages over), or run with --dry-run");
  if (!dry && !key) return fail("EVENTS_HANDOFF_KEY is not set (GitHub: Settings > Secrets and variables > Actions), or run with --dry-run");
  const date = vanParts(Date.now()).date;
  const w = windowOf(date);
  console.log(`The libraries' pages for the run of ${date} (its 14 days: ${w.from} to ${w.to})${dry ? ". Dry run: nothing is sent." : ""}`);
  for (const src of HANDOFF_SOURCES) {
    const { pages, error } = await fetchPages(src, date, fetch);
    console.log(`${src.name} (${src.id}): ${pages.length} pages, ${kb(sum(pages, (p) => p.raw.length))}, ${sum(pages, (p) => p.found)} events, ${sum(pages, (p) => p.inWindow)} in the 14 days`);
    for (const p of pages) console.log(`  part ${p.part}: ${kb(p.raw.length)}, ${p.found} events, ${p.inWindow} in the 14 days`);
    if (!dry && pages.length > 0) {
      for (const p of pages) await handOver(fetch, endpoint, key, src.id, date, p);
      console.log(`  handed over: ${pages.length} pages`);
    }
    if (error) fail(`${error}${pages.length > 0 && !dry ? ". The pages before it were handed over; the run will ask the library for the rest itself." : ""}`);
  }
}

main().catch((e) => fail(e instanceof Error ? e.message : String(e)));
