import qrcode from "qrcode-generator";
import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import type { AllergenId, Limits } from "../../engine";
import { ALLERGENS } from "../../engine";
import type { MemberView, RoomView } from "../../room/protocol";
import { CUSTOM_SUGGESTIONS, getLang, setLang, t, tx } from "../i18n";
import { prefs } from "../prefs";
import { getState, send, serverNow, update, useApp } from "../store";

export function Btn(p: { kind?: "primary" | "quiet" | "danger"; wide?: boolean; disabled?: boolean; onClick?: () => void; children: ComponentChildren; label?: string; pressed?: boolean; class?: string }) {
  return (
    <button
      type="button"
      class={`btn ${p.kind ?? ""} ${p.wide ? "wide" : ""} ${p.class ?? ""}`}
      disabled={p.disabled}
      aria-label={p.label}
      aria-pressed={p.pressed}
      onClick={p.onClick}
    >
      {p.children}
    </button>
  );
}

export function Qr({ text, size = 168 }: { text: string; size?: number }) {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  return <div class="qr" style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true }) }} />;
}

/** Seconds left until the server time `ends`. */
export function Countdown({ ends }: { ends: number | null }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const i = setInterval(() => tick((n) => n + 1), 500);
    return () => clearInterval(i);
  }, []);
  if (ends === null) return null;
  const s = Math.max(0, Math.ceil((ends - serverNow()) / 1000));
  return <span class="countdown num">{t("secondsLeft", { s })}</span>;
}

export function Toasts() {
  const { toasts } = useApp();
  return (
    <div class="toasts" role="status" aria-live="polite">
      {toasts.map((x) => (
        <div key={x.id} class="toast">
          {x.text}
        </div>
      ))}
    </div>
  );
}

export function LangToggle() {
  return (
    <button
      type="button"
      class="btn quiet lang"
      onClick={() => {
        const l = getLang() === "zh" ? "en" : "zh";
        setLang(l);
        prefs.lang = l;
        if (getState().view) send({ t: "lang", lang: l });
        update({});
      }}
    >
      {t("lang")}
    </button>
  );
}

export function memberName(v: RoomView, m: MemberView): string {
  if (m.name) return m.name;
  return t("friend", { n: v.members.indexOf(m) + 1 });
}

/** A one-tap suggestion reads in the reader's language, whichever language it was tapped in. */
function customName(name: string): string {
  const k = name.trim().toLowerCase();
  for (const from of ["zh", "en"] as const) {
    const i = CUSTOM_SUGGESTIONS[from].findIndex((x) => x.toLowerCase() === k);
    if (i >= 0) return CUSTOM_SUGGESTIONS[getLang()][i];
  }
  return name;
}

/** Mid-sentence in English, a list's own words go lower case ("doesn't eat dairy"); typed words stay as typed. */
const inSentence = (word: string) => (getLang() === "en" ? word.toLowerCase() : word);

/** The allergens as they read mid-sentence in English ("severely allergic to peanuts"). */
const EN_IN_SENTENCE: Record<AllergenId, string> = {
  peanut: "peanuts",
  treenut: "tree nuts",
  shellfish: "shellfish",
  fish: "fish",
  sesame: "sesame",
  soy: "soy",
  chili: "chili",
  egg: "eggs",
  dairy: "dairy",
  gluten: "gluten (wheat)",
};

/** An allergen as it reads in the middle of a sentence, in the reader's language. */
export const allergenWord = (a: AllergenId) => (getLang() === "en" ? EN_IN_SENTENCE[a] : tx(ALLERGENS[a]));

/** "This table: someone doesn't eat peanuts · halal · up to $35" — no names. */
export function TableLimits({ l }: { l: Limits }) {
  const items: string[] = [];
  for (const [a, level] of Object.entries(l.allergies) as [AllergenId, string][]) items.push(t(level === "severe" ? "someoneSevere" : "someoneAvoids", { what: allergenWord(a) }));
  const custom = new Map<string, string>();
  for (const c of l.custom) {
    const name = customName(c.name);
    const what = CUSTOM_SUGGESTIONS[getLang()].includes(name) ? inSentence(name) : name;
    // the same thing tapped in two languages is one line; a severe one wins
    if (c.level === "severe" || !custom.has(what)) custom.set(what, c.level === "severe" ? "someoneSevere" : "someoneAvoids");
  }
  for (const [what, key] of custom) items.push(t(key as "someoneSevere" | "someoneAvoids", { what }));
  if (l.halal) items.push(t("halal"));
  if (l.vegetarian) items.push(t("vegetarian"));
  if (l.budget) items.push(t("budgetUpTo", { n: l.budget }));
  return (
    <p class="tablelimits">
      <b>{t("tableLimits")}</b> {items.length ? items.join(" · ") : t("noLimits")}
    </p>
  );
}

export function DemoBanner({ demo }: { demo: boolean }) {
  return demo ? <p class="demo">{t("demo")}</p> : null;
}
