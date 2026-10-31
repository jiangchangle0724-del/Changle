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
    proxy: {
      "/trip": { target: "http://127.0.0.1:8799", ws: true, changeOrigin: false },
      "/eat": { target: "http://127.0.0.1:8798", ws: true, changeOrigin: false },
    },
  },
});
