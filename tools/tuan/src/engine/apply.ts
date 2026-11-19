// A merchant asking to open a shop, and the site's owner answering (docs/tuan.md: 申请入驻, 站长审核).
// The shop is made at once and stays `pending` until the owner lets it in: no page of its own, its
// group buys hidden, no orders; its merchant can get a first group buy ready meanwhile. Pure rules
// and the two mails; the server keeps it all (src/server/store.ts) and sends the mails through the
// rooms server's door (src/server/mail.ts).
import { SLUG_RE } from "./ids";
import { clip, SUBJECT_MAX, TEXT_MAX } from "./notice";
import { readShopWords, type ShopWords } from "./shop";
import { cleanLines } from "./text";
import type { ShopKind } from "./types";

/**
 * The wording of the declaration a merchant ticks to apply (`applyDeclare` in src/client/i18n-my.ts),
 * named by the day it was written. Its record is this name: when the wording changes, so does this,
 * and an application sent with the old one is asked to tick the new one.
 */
export const DECLARATION = "2026-11-18";
/** What a merchant may tell the site's owner, and what the owner may answer. */
export const NOTE_MAX = 600;
export const REPLY_MAX = 300;

export interface NewApplication {
  /** the shop's address: /tuan/s/<slug> */
  slug: string;
  words: ShopWords;
  /** for the site's owner alone */
  note: string;
}

export type ApplyError = "bad" | "name" | "slug" | "declare";
export type ReadApplication = { ok: true; application: NewApplication } | { ok: false; error: ApplyError };

/** Check an application as a merchant sent it: the shop's words by the same rules as ever, an address, and the declaration ticked. */
export function readApplication(input: unknown): ReadApplication {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "bad" };
  const raw = input as Record<string, unknown>;
  const read = readShopWords(raw);
  if (!read.ok) return read;
  if (typeof raw.slug !== "string" || !SLUG_RE.test(raw.slug)) return { ok: false, error: "slug" };
  if (raw.declared !== DECLARATION) return { ok: false, error: "declare" };
  return { ok: true, application: { slug: raw.slug, words: read.words, note: cleanLines(raw.note, NOTE_MAX) } };
}

/** The owner's answer: let the shop in, send the application back to be changed (saying what), or say no. */
export type Decision = { do: "accept" } | { do: "return"; reply: string } | { do: "decline"; reply: string };
export type ReadDecision = { ok: true; decision: Decision } | { ok: false; error: "bad" | "reply" };

export function readDecision(input: unknown): ReadDecision {
  if (!input || typeof input !== "object" || Array.isArray(input)) return { ok: false, error: "bad" };
  const raw = input as Record<string, unknown>;
  if (raw.do === "accept") return { ok: true, decision: { do: "accept" } };
  if (raw.do !== "return" && raw.do !== "decline") return { ok: false, error: "bad" };
  const reply = cleanLines(raw.reply, REPLY_MAX);
  // sending it back says what to change; saying no may say why
  if (raw.do === "return" && !reply) return { ok: false, error: "reply" };
  return { ok: true, decision: raw.do === "return" ? { do: "return", reply } : { do: "decline", reply } };
}

const KIND: Record<ShopKind, [zh: string, en: string]> = { leader: ["团长", "group-buy leader"], kitchen: ["私厨", "home kitchen"], farm: ["农场", "farm"] };

type Mail = { subject: string; text: string };
const mail = (subject: string, zh: string[], en: string[]): Mail => ({ subject: clip(subject, SUBJECT_MAX), text: clip([...zh, "", ...en].join("\n"), TEXT_MAX) });

/**
 * The mail to the site's owner: a shop is asking to be let in (`again`: sent again after being sent
 * back). Only its name and kind and who asked: what it says, its permit and the note to the owner
 * stay on the merchant's home, behind the owner's sign-in.
 */
export function appliedNotice(name: string, kind: ShopKind, email: string, again: boolean): Mail {
  const [zh, en] = KIND[kind];
  return mail(
    `跟一单 开店申请 · Shop application · ${name}`,
    [`${again ? "改过以后又交来的开店申请" : "新的开店申请"}：「${name}」（${zh}），申请人 ${email}。`, "在「我的团」最上面审核：通过、退回或不通过。"],
    [`${again ? "Sent again after changes" : "A new shop application"}: "${name}" (${en}), from ${email}.`, "Review it at the top of My group buys: approve it, send it back or decline it."],
  );
}

/** The mail to the merchant who asked: the owner's answer. */
export function decidedNotice(decision: Decision, name: string): Mail {
  if (decision.do === "accept") {
    return mail(
      `跟一单 「${name}」开通了 · Your shop is open`,
      [`你的店「${name}」通过了审核，开通了。现在可以开团，把开团页的链接发进群里，买家就能下单。`],
      [`"${name}" has been approved and is open. Start a group buy and share its link: buyers can order right away.`],
    );
  }
  if (decision.do === "return") {
    return mail(
      `跟一单 开店申请请改一下 · Please update your application`,
      [`站长看了「${name}」的开店申请，请照下面说的改一下，再在「我的团」里重新提交：`, "", decision.reply],
      [`The site's owner has looked at the application for "${name}". Please change what's asked above, then send it again from My group buys.`],
    );
  }
  return mail(
    `跟一单 开店申请没有通过 · Application not approved`,
    [`「${name}」的开店申请没有通过。`, ...(decision.reply ? ["", decision.reply] : [])],
    [`The application for "${name}" was not approved.`],
  );
}
