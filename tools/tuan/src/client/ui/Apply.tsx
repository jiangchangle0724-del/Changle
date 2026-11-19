// Asking to open a shop, on a merchant's home (/tuan/my): the form an account without a shop sees,
// and, once it's sent, where the asking stands in that shop's panel (waiting, sent back to be
// changed, turned down). The shop is made at once and waits for the site's owner: no page, its
// group buys hidden from buyers, no orders; its merchant can get a first group buy ready meanwhile.
// The rules are the server's (src/engine/apply.ts); the form checks the same before it sends.
import { useEffect, useState } from "preact/hooks";
import type { Application } from "../../api";
import { DECLARATION } from "../../engine/apply";
import { SLUG_RE } from "../../engine/ids";
import type { ShopKind } from "../../engine/types";
import { ApiFail, applyForShop, dropApply, saveApply, savedApply } from "../api";
import { t } from "../i18n";
import { IconCheck, Lines } from "./common";

interface Typed {
  name: string;
  kind: ShopKind;
  slug: string;
  about: string;
  contact: string;
  pay: string;
  permit: string;
  note: string;
}
const EMPTY: Typed = { name: "", kind: "leader", slug: "", about: "", contact: "", pay: "", permit: "", note: "" };
const typedOf = (application: Application): Typed => {
  const { slug, ...words } = application.shop;
  return { ...words, slug, note: application.note };
};
/** What a shop's address may be, from what was typed: lower case, no spaces. */
const slugOf = (typed: string): string => typed.trim().toLowerCase().replace(/\s+/g, "-");

/**
 * The form. `start`: the asking as it was sent, to change it (`again`: it was sent back); without
 * one, a new application, kept on this phone as it's typed until it's sent.
 */
function ApplyForm({ start, again = false, onSent }: { start?: Application; again?: boolean; onSent: () => void }) {
  const [typed, setTyped] = useState<Typed>(() => (start ? typedOf(start) : { ...EMPTY, ...savedApply<Partial<Typed>>() }));
  // the declaration is ticked anew each time the asking is sent
  const [declared, setDeclared] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  useEffect(() => {
    if (!start) saveApply(typed);
  }, [typed]);

  const set = (more: Partial<Typed>) => {
    setTyped({ ...typed, ...more });
    setProblem(null);
  };

  async function send() {
    const slug = slugOf(typed.slug);
    if (!typed.name.trim()) return setProblem(t("editErrName"));
    if (!SLUG_RE.test(slug)) return setProblem(t("applyErrSlug"));
    if (!declared) return setProblem(t("applyErrDeclare"));
    setBusy(true);
    setProblem(null);
    try {
      await applyForShop({ ...typed, slug, declared: DECLARATION });
      if (!start) dropApply();
      onSent();
    } catch (e) {
      const code = e instanceof ApiFail ? e.code : "failed";
      setProblem(
        t(
          code === "name"
            ? "editErrName"
            : code === "slug"
              ? "applyErrSlug"
              : code === "taken"
                ? "applyErrTaken"
                : code === "declare"
                  ? "applyErrDeclare"
                  : code === "applied"
                    ? "applyErrApplied"
                    : code === "limit"
                      ? "limit"
                      : code === "network"
                        ? "netDown"
                        : code === "signin" || code === "down"
                          ? "signInStale"
                          : "editErrFailed",
        ),
      );
    }
    setBusy(false);
  }

  const url = `changle.ca/tuan/s/${slugOf(typed.slug) || "damituan"}`;
  return (
    <form
      class="stack"
      onSubmit={(event) => {
        event.preventDefault();
        void send();
      }}
    >
      <label class="field">
        <span class="field-label">{t("ownerName")}</span>
        <input type="text" name="shopname" maxLength={40} autocomplete="organization" value={typed.name} onInput={(event) => set({ name: event.currentTarget.value })} />
      </label>
      <label class="field">
        <span class="field-label">{t("ownerKind")}</span>
        <select name="kind" value={typed.kind} onChange={(event) => set({ kind: event.currentTarget.value as ShopKind })}>
          <option value="leader">{t("kindLeader")}</option>
          <option value="kitchen">{t("kindKitchen")}</option>
          <option value="farm">{t("kindFarm")}</option>
        </select>
      </label>
      <label class="field">
        <span class="field-label">{t("applySlug")}</span>
        <input
          type="text"
          name="slug"
          maxLength={40}
          autocomplete="off"
          autocapitalize="none"
          spellcheck={false}
          inputMode="url"
          placeholder="damituan"
          value={typed.slug}
          onInput={(event) => set({ slug: event.currentTarget.value })}
        />
        <span class="hint">{t("applySlugHint", { url })}</span>
      </label>
      <label class="field">
        <span class="field-label">{t("ownerAbout")}</span>
        <textarea name="about" rows={3} maxLength={600} value={typed.about} onInput={(event) => set({ about: event.currentTarget.value })} />
      </label>
      <label class="field">
        <span class="field-label">{t("ownerContact")}</span>
        <textarea name="contact" rows={2} maxLength={300} value={typed.contact} onInput={(event) => set({ contact: event.currentTarget.value })} />
      </label>
      <label class="field">
        <span class="field-label">{t("ownerPay")}</span>
        <textarea name="pay" rows={3} maxLength={600} value={typed.pay} onInput={(event) => set({ pay: event.currentTarget.value })} />
      </label>
      <label class="field">
        <span class="field-label">{t("shopPermitField")}</span>
        <input type="text" name="permit" maxLength={200} autocomplete="off" value={typed.permit} onInput={(event) => set({ permit: event.currentTarget.value })} />
        <span class="hint">{t("shopPermitHint")}</span>
      </label>
      <label class="field">
        <span class="field-label">{t("applyNote")}</span>
        <textarea name="note" rows={3} maxLength={600} value={typed.note} onInput={(event) => set({ note: event.currentTarget.value })} />
        <span class="hint">{t("applyNoteHint")}</span>
      </label>
      <label class="choice choice-tick">
        <input
          type="checkbox"
          name="declared"
          checked={declared}
          onChange={(event) => {
            setDeclared(event.currentTarget.checked);
            setProblem(null);
          }}
        />
        <span class="tick" aria-hidden="true">
          <IconCheck size={14} />
        </span>
        <span class="choice-what">{t("applyDeclare")}</span>
      </label>
      {problem && (
        <p class="problem" role="alert">
          {problem}
        </p>
      )}
      <button type="submit" class="btn btn-primary btn-block" disabled={busy}>
        {t(!start ? "applySend" : again ? "applySendAgain" : "applySave")}
      </button>
    </form>
  );
}

/** For an account that runs no shop: what opening one takes, and the form. */
export function ApplyPanel({ onSent }: { onSent: () => void }) {
  return (
    <section class="panel" aria-labelledby="apply-title">
      <h2 class="panel-title" id="apply-title">
        {t("applyTitle")}
      </h2>
      <p>{t("applyLead")}</p>
      <ApplyForm onSent={onSent} />
    </section>
  );
}

/** Where a shop's asking stands, in its panel on the merchant's home: waiting, sent back (the form, open), or turned down. */
export function Asked({ application, email, onSent }: { application: Application; email: string; onSent: () => void }) {
  const [changing, setChanging] = useState(false);
  if (application.state === "declined") {
    return (
      <div class="stack">
        <p class="problem">{t("applyDeclined")}</p>
        {application.reply && <Lines class="hint" text={application.reply} />}
      </div>
    );
  }
  if (application.state === "returned") {
    return (
      <div class="stack">
        <p class="problem">{t("applyReturned")}</p>
        <Lines class="said-back" text={application.reply} />
        <ApplyForm start={application} again onSent={onSent} />
      </div>
    );
  }
  return (
    <div class="stack">
      <p>{t("applyWaiting", { email })}</p>
      <p class="hint">{t("applyWaitingMore")}</p>
      {changing ? (
        <ApplyForm
          start={application}
          onSent={() => {
            setChanging(false);
            onSent();
          }}
        />
      ) : (
        <button type="button" class="btn btn-quiet btn-block" onClick={() => setChanging(true)}>
          {t("applyChange")}
        </button>
      )}
    </div>
  );
}
