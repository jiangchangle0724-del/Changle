/**
 * Notices other changle.ca Workers send through the rooms server, whose Resend key is the only one
 * (跟一单's new-order notice to a merchant is the first). What a Worker hands in, what it gets back,
 * and the mail itself. The door is `Mail` in mail.ts, reached through a service binding only; the
 * hub does the sending (hub.ts, `notice`). Nothing here touches Cloudflare, so tests/mail.test.ts
 * can run it on its own.
 */

/**
 * How many notices each app may send a day (UTC), all its recipients together. Resend's free plan
 * is 100 a day for everything, sign-in codes included: the codes keep what's left. An app not in
 * this list is turned away.
 */
export const NOTICES_A_DAY: Record<string, number> = { tuan: 60 };

/** How the footer names the app the notice is for. */
const APP_NAMES: Record<string, { zh: string; en: string }> = { tuan: { zh: "跟一单", en: "Count Me In" } };

/** What an app hands the door. */
export type Notice = {
  /** which app is asking: one of NOTICES_A_DAY's keys */
  app: string;
  /** the recipient: the sign-in email of a changle.ca account (nobody else gets mail from here) */
  to: string;
  /** one line, up to 120 characters */
  subject: string;
  /** plain text, up to 2,000 characters; line breaks are kept, nothing is formatted */
  text: string;
  /** optional: a page on changle.ca to open (the order), shown as the button */
  link?: string;
  /** the language of the frame around the text (the footer, the button) */
  lang: "zh" | "en";
};

/** Why a notice was turned away or didn't go out. */
export type Why = "app" | "to" | "subject" | "text" | "link" | "lang" | "no-mail" | "mail" | "down";

/**
 * The door's three answers: it went out; this app's allowance for today is used up (don't try
 * again today); it didn't go out (`why` says what was wrong, for the caller's logs).
 */
export type Sent = { status: "sent" } | { status: "full" } | { status: "failed"; why: Why };

export const SUBJECT_MAX = 120;
export const TEXT_MAX = 2000;
const LINK_MAX = 500;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$/;
// eslint-disable-next-line no-control-regex
const CONTROL_RE = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g;

/**
 * A notice as handed in, checked and tidied, or why it can't be sent. `dev`: a local run, where the
 * link may point at a local site instead of changle.ca.
 */
export function cleanNotice(raw: unknown, dev = false): Notice | Why {
  if (!raw || typeof raw !== "object") return "app";
  const r = raw as Record<string, unknown>;
  const app = typeof r.app === "string" ? r.app : "";
  if (!(app in NOTICES_A_DAY)) return "app";
  const to = typeof r.to === "string" ? r.to.trim().toLowerCase() : "";
  if (!EMAIL_RE.test(to)) return "to";
  const subject = typeof r.subject === "string" ? r.subject.replace(CONTROL_RE, "").replace(/\s+/g, " ").trim() : "";
  if (!subject || subject.length > SUBJECT_MAX) return "subject";
  const text = typeof r.text === "string" ? r.text.replace(CONTROL_RE, "").replace(/\r\n?/g, "\n").trim() : "";
  if (!text || text.length > TEXT_MAX) return "text";
  const lang = r.lang === "zh" || r.lang === "en" ? r.lang : null;
  if (!lang) return "lang";
  let link: string | undefined;
  if (r.link !== undefined && r.link !== null && r.link !== "") {
    if (typeof r.link !== "string" || r.link.length > LINK_MAX || !linkOk(r.link, dev)) return "link";
    link = r.link;
  }
  return { app, to, subject, text, lang, ...(link ? { link } : {}) };
}

/** The link may only lead to changle.ca (or, in a local run, to a local site). */
function linkOk(s: string, dev: boolean) {
  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return false;
  }
  if (/[\s<>"']/.test(s)) return false;
  if (u.username || u.password) return false;
  if (u.protocol === "https:" && (u.hostname === "changle.ca" || u.hostname === "www.changle.ca")) return true;
  return dev && /^https?:$/.test(u.protocol) && /^(localhost|127\.0\.0\.1)$/.test(u.hostname);
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/** The mail, in the same frame as the sign-in code's: the text, the button, and a line saying who sent it for whom. */
export function renderNotice(n: Notice): { subject: string; html: string; text: string } {
  const app = APP_NAMES[n.app] ?? { zh: n.app, en: n.app };
  const open = n.lang === "zh" ? "打开" : "Open";
  const foot = n.lang === "zh" ? `由 changle.ca 代「${app.zh}」发出。` : `Sent by changle.ca for ${app.en}.`;
  const body = n.text
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px;line-height:1.65">${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
  const button = n.link
    ? `<p style="margin:6px 0 22px"><a href="${esc(n.link)}" style="display:inline-block;background:#b072ff;color:#0e0c22;font-weight:800;text-decoration:none;padding:12px 22px;border-radius:999px">${open}</a></p>
<p style="margin:0 0 18px;color:#7f7c9d;font-size:12px;word-break:break-all">${esc(n.link)}</p>`
    : "";
  const html = `<div style="font-family:-apple-system,Segoe UI,sans-serif;background:#0e0c22;color:#f5f4fd;padding:32px;border-radius:20px;max-width:440px">
<p style="font-size:22px;font-weight:800;margin:0 0 18px">changle<span style="color:#b072ff">.</span></p>
${body}${button}<p style="margin:0;color:#7f7c9d;font-size:13px">${esc(foot)}</p></div>`;
  const text = `${n.text}\n\n${n.link ? `${open}: ${n.link}\n\n` : ""}${foot}`;
  return { subject: n.subject, html, text };
}
