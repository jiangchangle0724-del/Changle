// 约时间 is one of changle.ca's tools: it lives at changle.ca/when. Every page, file, API call and
// gathering link sits under BASE. The server (src/server) strips BASE off incoming paths; the phone
// pages (src/client) add it to theirs. On a computer by itself (npm run dev, the browser tests) it
// is http://localhost:8787/when/.

export const BASE = "/when";
