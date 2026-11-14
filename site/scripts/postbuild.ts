/*
 * Runs after `vite build` (npm run build). Writes one page per game, dist/g/<slug>.html, one for
 * the tools tab, dist/tools.html, and one per tool on its page, dist/tools/<id>.html: the same app as
 * dist/index.html, with that page's own title,
 * description, canonical address and share-card tags, so search engines and chat apps that don't
 * run JavaScript see the right page. Cloudflare Pages serves dist/g/truth-or-dare.html at
 * /g/truth-or-dare; every other address falls back to index.html. (Never add a dist/404.html:
 * Pages would stop falling back to index.html, and /t/ABCD, /me and the rest would break.)
 *
 * A share picture is used when there is one: public/og/<slug>.png, else public/og/default.png.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { GAMES } from "../src/games/registry";
import { gameTitle } from "../src/router";
import { TOOLS, type ToolId } from "../src/tools/ids";

const SITE = "https://changle.ca";
const NAME = "开席 Lazy Susan";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dist = join(root, "dist");
const html = readFileSync(join(dist, "index.html"), "utf8");

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const picture = (name: string) => (existsSync(join(root, "public/og", `${name}.png`)) ? `${SITE}/og/${name}.png` : null);

if (!/<title>[^<]*<\/title>/.test(html) || !/<meta name="description" content="[^"]*"/.test(html)) {
  throw new Error("dist/index.html has no <title> or description to replace: did index.html change?");
}
const homeDescription = /<meta name="description" content="([^"]*)"/.exec(html)![1];

/** index.html with this page's head: title, description, canonical, Open Graph and Twitter card. */
function page(p: { title: string; description: string; path: string; image: string | null }) {
  const tags = [
    `<link rel="canonical" href="${SITE}${p.path}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${esc(NAME)}" />`,
    `<meta property="og:title" content="${esc(p.title)}" />`,
    `<meta property="og:description" content="${esc(p.description)}" />`,
    `<meta property="og:url" content="${SITE}${p.path}" />`,
    ...(p.image ? [`<meta property="og:image" content="${p.image}" />`, `<meta property="og:image:width" content="1200" />`, `<meta property="og:image:height" content="630" />`] : []),
    `<meta name="twitter:card" content="${p.image ? "summary_large_image" : "summary"}" />`,
  ];
  return (
    html
      // the tags index.html carries for the home page give way to this page's
      .replace(/\s*<link rel="canonical"[^>]*>/g, "")
      .replace(/\s*<meta (?:property="og:|name="twitter:)[^>]*>/g, "")
      .replace(/<title>[^<]*<\/title>/, `<title>${esc(p.title)}</title>`)
      .replace(/<meta name="description" content="[^"]*"/, `<meta name="description" content="${esc(p.description)}"`)
      .replace("</head>", `  ${tags.join("\n    ")}\n  </head>`)
  );
}

const write = (file: string, body: string) => {
  mkdirSync(dirname(join(dist, file)), { recursive: true });
  writeFileSync(join(dist, file), body);
};

// the home page keeps its own words, and gains the share picture once there is one
write("index.html", page({ title: NAME, description: homeDescription, path: "/", image: picture("default") }));

let n = 0;
for (const g of GAMES.filter((g) => !g.hidden)) {
  const players = g.minPlayers === g.maxPlayers ? `${g.minPlayers}` : `${g.minPlayers}–${g.maxPlayers}`;
  write(
    `g/${g.slug}.html`,
    page({
      title: gameTitle(g.id),
      description: `${g.how.zh}${players} 人。${g.blurb.en} ${players} players.`,
      path: `/g/${g.slug}`,
      image: picture(g.slug) ?? picture("default"),
    }),
  );
  n++;
}
write("tools.html", page({ title: `工具 Tools · ${NAME}`, description: "随便吃什么、汇率、单价、世界时钟。What to eat, currency, unit price, world clock.", path: "/tools", image: picture("default") }));
const TOOL_WORDS: Record<ToolId, string> = {
  currency: "实时汇率：加元、人民币、美元、港元一起换算。Live exchange rates: dollars, yuan and more, converted together.",
  clock: "世界时间：各地现在几点，拖一下尺子一起变。World clock: the time in every city, all moving together.",
  price: "单价换算：每斤、每磅、每公斤多少钱，两个包装哪个划算。The price per kg, lb or jin, and which pack is the better buy.",
};
const toolIds = Object.keys(TOOLS) as ToolId[];
for (const id of toolIds) {
  write(`tools/${id}.html`, page({ title: `${TOOLS[id].zh} ${TOOLS[id].en} · ${NAME}`, description: TOOL_WORDS[id], path: `/tools/${id}`, image: picture("default") }));
}
console.log(`postbuild: ${n} game pages, the tools page and ${toolIds.length} tool pages in dist/`);

const paths = ["/", "/tools", ...toolIds.map((id) => `/tools/${id}`), ...GAMES.filter((g) => g.ready && !g.hidden).map((g) => `/g/${g.slug}`), "/eat", "/trip", "/go"];
write("sitemap.xml", `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths.map((path) => `  <url><loc>${SITE}${esc(path)}</loc></url>`).join("\n")}\n</urlset>\n`);

// Include content revisions as well as names: changing only the HTML must also update the worker.
const files = (dir: string): string[] => readdirSync(join(dist, dir), { withFileTypes: true }).flatMap((entry) => {
  const path = dir ? `${dir}/${entry.name}` : entry.name;
  return entry.isDirectory() ? files(path) : path === "sw.js" ? [] : [path];
});
const revisions = files("").sort().map((path) => [path, createHash("sha256").update(readFileSync(join(dist, path))).digest("hex")]);
const version = createHash("sha256").update(JSON.stringify(revisions)).update(readFileSync(join(root, "scripts/sw.template.js"))).digest("hex").slice(0, 20);
const shell = ["/index.html", ...Array.from(html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="(\/assets\/[^\"]+\.(?:js|css))"/g), (match) => match[1])];
const worker = readFileSync(join(root, "scripts/sw.template.js"), "utf8")
  .replace("__VERSION__", JSON.stringify(version))
  .replace("__SHELL__", JSON.stringify([...new Set(shell)]));
write("sw.js", worker);
console.log(`postbuild: sitemap (${paths.length} URLs), service worker ${version} (${shell.length} shell files)`);
