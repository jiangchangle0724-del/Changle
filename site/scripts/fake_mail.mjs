// A stand-in for Resend, for local runs and checks (no key, no network): it takes the same POST the
// rooms server sends Resend and keeps every mail instead of delivering it.
//
//   node scripts/fake_mail.mjs            # http://127.0.0.1:8791
//   PORT=8791 node scripts/fake_mail.mjs
//
// In site/worker/.dev.vars, point the rooms server at it: DEV_MAIL_URL=http://127.0.0.1:8791/emails
// (sign-in codes still show on the page with DEV_SHOW_CODES=1; this catches everything else, such as
// the notices other Workers send through the Mail door, worker/mail.ts).
//
// For checks, on the same port: GET /mails (every mail kept, newest last), GET /reset (forget them),
// GET /fail/<status> (answer the next POSTs with that status, as Resend would when it says no),
// GET /fail/0 (back to accepting).
import { createServer } from "node:http";

const PORT = Number(process.env.PORT || 8791);
const mails = [];
let failWith = 0;

createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  const reply = (status, body) => {
    res.writeHead(status, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  };
  if (req.method === "GET" && url.pathname === "/mails") return reply(200, { mails });
  if (req.method === "GET" && url.pathname === "/reset") {
    mails.length = 0;
    return reply(200, { ok: true });
  }
  const m = /^\/fail\/(\d{1,3})$/.exec(url.pathname);
  if (req.method === "GET" && m) {
    failWith = Number(m[1]);
    return reply(200, { failWith });
  }
  if (req.method !== "POST") return reply(404, { error: "not found" });
  let raw = "";
  req.on("data", (c) => (raw += c));
  req.on("end", () => {
    if (failWith) return reply(failWith, { message: "the stand-in was told to say no" });
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      return reply(400, { message: "not json" });
    }
    const id = `fake-${mails.length + 1}`;
    mails.push({ id, at: Date.now(), auth: req.headers.authorization ?? "", ua: req.headers["user-agent"] ?? "", ...body });
    console.log(`mail ${id} to ${JSON.stringify(body.to)}: ${body.subject}`);
    reply(200, { id });
  });
}).listen(PORT, "127.0.0.1", () => console.log(`fake Resend at http://127.0.0.1:${PORT}/emails`));
