/**
 * The Mail door's checks on a notice and the mail it makes (worker/notice.ts): what is let through,
 * what is turned away and why, and that the text can't break out of the mail's HTML.
 *
 *   npx tsx tests/mail.test.ts
 */
import assert from "node:assert/strict";
import { cleanNotice, NOTICES_A_DAY, renderNotice, SUBJECT_MAX, TEXT_MAX, type Notice } from "../worker/notice";

const good = { app: "tuan", to: "Leader@Example.com ", subject: "  新订单 · 大米团  ", text: "小明下了一单：\n牛腩 2 磅\n\n合计约 $36。", link: "https://changle.ca/tuan/o/ABCDEF", lang: "zh" } as const;

// ---- what is let through ----
{
  const n = cleanNotice(good);
  assert.ok(typeof n !== "string", "a good notice is let through");
  assert.equal(n.to, "leader@example.com", "the address is tidied and lower case, as accounts keep it");
  assert.equal(n.subject, "新订单 · 大米团", "the subject is trimmed");
  assert.equal(n.text, "小明下了一单：\n牛腩 2 磅\n\n合计约 $36。", "the text keeps its line breaks");
  assert.equal(n.link, good.link);
  assert.equal(n.lang, "zh");
}
{
  const n = cleanNotice({ ...good, link: undefined });
  assert.ok(typeof n !== "string" && !("link" in n), "no link is fine");
  const n2 = cleanNotice({ ...good, link: "" });
  assert.ok(typeof n2 !== "string" && !("link" in n2), "an empty link counts as none");
}
{
  const n = cleanNotice({ ...good, subject: "a\r\nb\tc", text: "x\r\ny\u0000z" });
  assert.ok(typeof n !== "string");
  assert.equal(n.subject, "a b c", "a subject is one line");
  assert.equal(n.text, "x\nyz", "control characters go, Windows line ends become plain ones");
}
assert.ok(NOTICES_A_DAY.tuan >= 1 && NOTICES_A_DAY.tuan <= 60, "跟一单's share leaves the sign-in codes at least 40 of Resend's 100 a day");

// ---- what is turned away, and why ----
const bad: [string, unknown, string][] = [
  ["nothing", undefined, "app"],
  ["an app we don't know", { ...good, app: "spam" }, "app"],
  ["no app", { ...good, app: undefined }, "app"],
  ["an address that isn't one", { ...good, to: "leader at example" }, "to"],
  ["two addresses", { ...good, to: "a@example.com, b@example.com" }, "to"],
  ["no subject", { ...good, subject: "   " }, "subject"],
  ["a subject too long", { ...good, subject: "x".repeat(SUBJECT_MAX + 1) }, "subject"],
  ["no text", { ...good, text: "" }, "text"],
  ["text too long", { ...good, text: "字".repeat(TEXT_MAX + 1) }, "text"],
  ["a language we don't have", { ...good, lang: "fr" }, "lang"],
  ["a link elsewhere", { ...good, link: "https://example.com/tuan" }, "link"],
  ["a link that only looks like ours", { ...good, link: "https://changle.ca.evil.com/x" }, "link"],
  ["a link with a password in it", { ...good, link: "https://user:pw@changle.ca/x" }, "link"],
  ["a plain http link", { ...good, link: "http://changle.ca/tuan" }, "link"],
  ["a javascript link", { ...good, link: "javascript:alert(1)" }, "link"],
  ["a local link outside a local run", { ...good, link: "http://127.0.0.1:5173/tuan" }, "link"],
  ["a link that isn't one", { ...good, link: "/tuan/o/ABCDEF" }, "link"],
  ["a link with a quote in it", { ...good, link: 'https://changle.ca/tuan/o/A"B' }, "link"],
];
for (const [what, raw, why] of bad) assert.equal(cleanNotice(raw), why, `${what} is turned away as "${why}"`);
assert.equal(cleanNotice({ ...good, subject: "x".repeat(SUBJECT_MAX) }) !== "subject", true, "a subject at the limit is fine");
assert.ok(typeof cleanNotice({ ...good, link: "http://127.0.0.1:5173/tuan/o/X" }, true) !== "string", "in a local run a local link is fine");
assert.equal(cleanNotice({ ...good, link: "https://example.com/" }, true), "link", "but not a link elsewhere");

// ---- the mail ----
{
  const n = cleanNotice(good) as Notice;
  const m = renderNotice(n);
  assert.equal(m.subject, "新订单 · 大米团");
  assert.ok(m.html.includes("小明下了一单：<br>牛腩 2 磅"), "a line break inside a paragraph is a <br>");
  assert.ok(m.html.includes("<p style") && m.html.includes("合计约 $36。</p>"), "a blank line starts a new paragraph");
  assert.ok(m.html.includes(`href="${good.link}"`) && m.html.includes(">打开</a>"), "the link is the button, in the notice's language");
  assert.ok(m.html.includes("代「跟一单」发出"), "the footer names the app in Chinese");
  assert.ok(m.text.startsWith(n.text) && m.text.includes(`打开: ${good.link}`) && m.text.includes("代「跟一单」发出"), "the plain-text version has the text, the link and the footer");
}
{
  const n = cleanNotice({ ...good, lang: "en", subject: "New order", text: "Ann ordered 2 lb of brisket." }) as Notice;
  const m = renderNotice(n);
  assert.ok(m.html.includes(">Open</a>") && m.html.includes("Sent by changle.ca for Count Me In."), "the frame speaks English for an English notice");
  assert.ok(m.text.includes("Open: ") && m.text.endsWith("Sent by changle.ca for Count Me In."));
}
{
  const n = cleanNotice({ ...good, text: `<script>alert("x")</script> & <b>bold</b>`, link: undefined }) as Notice;
  const m = renderNotice(n);
  assert.ok(!m.html.includes("<script>") && m.html.includes("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &lt;b&gt;bold&lt;/b&gt;"), "text can't put tags into the mail");
  assert.ok(!m.html.includes("href="), "no link, no button");
  assert.equal(m.text.split("\n\n").length, 2, "no link: the text and the footer only");
}

console.log("mail.test: all passed");
