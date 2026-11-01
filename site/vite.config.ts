import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { PAGE_GAMES, SLUG } from "./src/routes";

const SITE = "https://changle.ca";
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** What a link to a page shows in a chat (WeChat, iMessage) or a search result. */
type Card = { path: string; title: string; description: string; image: string };

const SHARE_START = "<!-- share card: written by vite.config.ts -->";
const SHARE_END = "<!-- /share card -->";

function shareTags(c: Card) {
  const url = `${SITE}${c.path}`;
  const image = `${SITE}/og/${c.image}.png`;
  return [
    SHARE_START,
    `<link rel="canonical" href="${url}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="开席 Lazy Susan" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:title" content="${esc(c.title)}" />`,
    `<meta property="og:description" content="${esc(c.description)}" />`,
    `<meta property="og:image" content="${image}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:image" content="${image}" />`,
    SHARE_END,
  ].join("\n    ");
}

const titleOf = (html: string) => /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? "";
const descriptionOf = (html: string) => /<meta name="description" content="([^"]*)"/.exec(html)?.[1] ?? "";

/**
 * Every playable game has its own address (src/routes.ts). The site is one page, so each game's
 * address gets a copy of it whose head names that game: its title, description and share card, for
 * a link sent in a chat and for search engines. Written as g/<game>.html, which Cloudflare Pages
 * serves at /g/<game> (an index.html in a folder would add a slash). The home page's head gets its
 * share card here too, from its own title and description.
 */
function gamePages(): Plugin {
  let outDir = "dist";
  return {
    name: "changle-game-pages",
    configResolved(c) {
      outDir = resolve(c.root, c.build.outDir);
    },
    transformIndexHtml(html) {
      const home: Card = { path: "/", title: titleOf(html), description: descriptionOf(html).replace(/&quot;/g, '"'), image: "default" };
      return html.replace("</head>", `  ${shareTags(home)}\n  </head>`);
    },
    closeBundle() {
      const index = readFileSync(join(outDir, "index.html"), "utf8");
      const block = new RegExp(`${SHARE_START}[\\s\\S]*?${SHARE_END}`);
      for (const g of PAGE_GAMES) {
        const card: Card = {
          path: `/g/${SLUG[g.id]}`,
          title: `${g.name.zh} ${g.name.en} | 开席 Lazy Susan`,
          // both languages: a Chinese chat and an English one read the same card
          description: `${g.blurb.zh}${/[。！？…]$/.test(g.blurb.zh) ? "" : /[吗呢]$/.test(g.blurb.zh) ? "？" : "。"}${g.blurb.en}`,
          image: SLUG[g.id],
        };
        const html = index
          .replace(/<title>[^<]*<\/title>/, `<title>${esc(card.title)}</title>`)
          .replace(/<meta name="description" content="[^"]*"/, `<meta name="description" content="${esc(card.description)}"`)
          .replace(block, shareTags(card));
        const file = join(outDir, "g", `${SLUG[g.id]}.html`);
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, html);
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), gamePages()],
  build: {
    target: "es2020",
    assetsInlineLimit: 0,
  },
  server: {
    // 到此一游 lives at changle.ca/trip (games/been-there in the changle-ca repository). Run it
    // locally with `npx wrangler dev --port 8799` there and the site's /trip reaches it here too.
    // 随便 lives at changle.ca/eat the same way (tools/suibian): `npx wrangler dev --port 8798` there.
    proxy: {
      "/trip": { target: "http://127.0.0.1:8799", ws: true, changeOrigin: false },
      "/eat": { target: "http://127.0.0.1:8798", ws: true, changeOrigin: false },
    },
  },
});
