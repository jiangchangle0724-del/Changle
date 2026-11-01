/*
 * Runs after `vite build` (npm run build). Writes one page per game, dist/g/<slug>.html, and one
 * for the tools tab, dist/tools.html: the same app as dist/index.html, with that page's own title,
 * description, canonical address and share-card tags, so search engines and chat apps that don't
 * run JavaScript see the right page. Cloudflare Pages serves dist/g/truth-or-dare.html at
 * /g/truth-or-dare; every other address falls back to index.html. (Never add a dist/404.html:
 * Pages would stop falling back to index.html, and /t/ABCD, /me and the rest would break.)
 *
 * A share picture is used when there is one: public/og/<slug>.png, else public/og/default.png.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { GAMES } from "../src/games/registry";
import { gameTitle } from "../src/router";

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
for (const g of GAMES) {
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
console.log(`postbuild: ${n} game pages and the tools page in dist/`);
