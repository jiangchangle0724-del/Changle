// 随便 is one of changle.ca's tools: it lives at changle.ca/eat. Every page, file, API call, sign-in
// address, room link and QR code sits under BASE, and so does the session cookie (its Path). The
// server (src/server) strips BASE off incoming paths; the phone pages (src/client) add it to theirs.
// Running on a computer by itself (npm run dev, the browser tests) it is http://localhost:8787/eat/.

export const BASE = "/eat";
