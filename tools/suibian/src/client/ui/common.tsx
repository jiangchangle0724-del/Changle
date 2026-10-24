import qrcode from "qrcode-generator";
import type { ComponentChildren } from "preact";
import { useEffect, useState } from "preact/hooks";
import type { AllergenId, Limits } from "../../engine";
import { ALLERGENS } from "../../engine";
import type { MemberView, RoomView } from "../../room/protocol";
import { getLang, setLang, t, tx } from "../i18n";
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

/** "This table: someone doesn't eat peanuts · halal · up to $35" — no names. */
export function TableLimits({ l }: { l: Limits }) {
  const items: string[] = [];
  for (const [a, level] of Object.entries(l.allergies) as [AllergenId, string][]) items.push(t(level === "severe" ? "someoneSevere" : "someoneAvoids", { what: tx(ALLERGENS[a]) }));
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
