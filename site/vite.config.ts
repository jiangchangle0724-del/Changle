import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    target: "es2020",
    assetsInlineLimit: 0,
  },
  server: {
    // 到此一游 lives at changle.ca/trip (games/been-there in the changle-ca repository). Run it
    // locally with `npx wrangler dev --port 8799` there and the site's /trip reaches it here too.
    // 随便 lives at changle.ca/eat the same way (tools/suibian): `npx wrangler dev --port 8798` there.
    // 藏在人群里 lives at changle.ca/hide (games/hide-crowd): `npx wrangler dev --port 8797` there
    // (HIDE_DEV_PORT picks another port).
    // 约时间 lives at changle.ca/when (tools/when): `npx wrangler dev --port 8796` there.
    // 两清 keeps its ledgers on a server at changle.ca/split/api (tools/split): `npm run dev` there
    // (port 8794). Its pages at /split are this site's own, so only /split/api goes across.
    proxy: {
      "/trip": { target: "http://127.0.0.1:8799", ws: true, changeOrigin: false },
      "/eat": { target: "http://127.0.0.1:8798", ws: true, changeOrigin: false },
      "/when": { target: "http://127.0.0.1:8796", ws: true, changeOrigin: false },
      "/split/api": { target: "http://127.0.0.1:8794", ws: true, changeOrigin: false },
      "/hide": { target: `http://127.0.0.1:${process.env.HIDE_DEV_PORT ?? 8797}`, ws: true, changeOrigin: false },
    },
  },
});
