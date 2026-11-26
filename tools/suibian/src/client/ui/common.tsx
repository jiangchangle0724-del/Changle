import qrcode from "qrcode-generator";
import { Check, ChevronLeft, CircleAlert, TriangleAlert } from "lucide-preact";
import type { ComponentChildren, JSX } from "preact";
import { useEffect, useLayoutEffect, useRef } from "preact/hooks";
import { BASE } from "../../base";
import type { AllergenId, Limits } from "../../engine";
import { ALLERGENS } from "../../engine";
import type { MemberView, RoomView } from "../../room/protocol";
import { CUSTOM_SUGGESTIONS, getLang, setLang, t, tx, type Key } from "../i18n";
import { prefs } from "../prefs";
import { getState, send, update, useApp } from "../store";
import { AVATAR_GELS } from "./colors";
import { enter } from "../motion";

export function Btn(p: { kind?: "primary" | "quiet" | "danger"; wide?: boolean; disabled?: boolean; onClick?: JSX.MouseEventHandler<HTMLButtonElement>; children: ComponentChildren; label?: string; pressed?: boolean; class?: string; reveal?: boolean }) {
  return (
    <button
      type="button"
      class={`btn press ${p.kind ?? ""} ${p.wide ? "wide" : ""} ${p.class ?? ""}`}
      disabled={p.disabled}
      aria-label={p.label}
      aria-pressed={p.pressed}
      data-reveal-move={p.reveal ? "tail" : undefined}
      onClick={p.onClick}
    >
      {p.children}
    </button>
  );
}

/** A phase (or a menu path) enters once. Fixed chrome is never part of the stagger. */
export function MotionScreen({ scene, children }: { scene: string; children: ComponentChildren }) {
  const content = useRef<HTMLDivElement>(null);
  const previous = useRef<string>();
  useLayoutEffect(() => {
    if (!content.current || previous.current === scene) return;
    previous.current = scene;
    if (scene === "result") return; // The reveal has its own, single sequence.
    const clean = Array.from(content.current.children)
      .filter((el): el is HTMLElement => el instanceof HTMLElement && !el.matches(".dock, .motion-screen, .places, .result-reveal"))
      .map((el, i) => enter(el, i));
    return () => clean.forEach((stop) => stop());
  }, [scene]);
  return <div class="motion-screen" ref={content}>{children}</div>;
}

/** The page title stays the reader's language; its companion line has its own language. */
export function TopBar({ title, vars = {}, home, back, tools, noBack, right }: {
  title: Key; vars?: Record<string, string | number>; home?: () => void;
  /** One step back inside the page (a table's rounds), instead of leaving it. */
  back?: () => void;
  tools?: boolean; noBack?: boolean; right?: ComponentChildren;
}) {
  const lang = getLang();
  const other = lang === "zh" ? "en" : "zh";
  // Translate in the other language without changing the page's language or preferences.
  const subtitle = t(title, vars, other);
  return (
    <header class="topbar">
      <div class="topbar-back">
        {!noBack && back && <button type="button" class="btn quiet press back" aria-label={t("stepBack")} onClick={back}>
          <ChevronLeft aria-hidden="true" />
        </button>}
        {!noBack && !back && <a class="btn quiet press back" href={tools ? "/tools" : `${BASE}/`} aria-label={t(tools ? "toTools" : "home")} onClick={home ? (e) => { e.preventDefault(); home(); } : undefined}>
          <ChevronLeft aria-hidden="true" />
        </a>}
      </div>
      <div class="topbar-title">
        <h1 lang={lang === "zh" ? "zh-CN" : "en"}>{t(title, vars)}</h1>
        <small lang={other === "zh" ? "zh-CN" : "en"}>{subtitle}</small>
      </div>
      <div class="topbar-action">{right ?? <LangToggle />}</div>
    </header>
  );
}

/** Reserve exactly the space the fixed dock needs, including wrapped English status lines. */
export function Dock({ children, status }: { children: ComponentChildren; status?: ComponentChildren }) {
  const dock = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = dock.current;
    const page = el?.closest<HTMLElement>("main");
    if (!el || !page) return;
    const measure = () => page.style.setProperty("--dock-space", `${el.getBoundingClientRect().height}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => { observer.disconnect(); page.style.removeProperty("--dock-space"); };
  }, []);
  return <footer class="dock" ref={dock}>
    <div class="dock-content">
      {status && <div class="dock-status">{status}</div>}
      <div class="dock-actions">{children}</div>
    </div>
  </footer>;
}

export function Message({ children, error = false, class: extra = "" }: { children: ComponentChildren; error?: boolean; class?: string }) {
  const Icon = error ? CircleAlert : TriangleAlert;
  return <p class={`${error ? "error" : "warn"} ${extra}`} role={error ? "alert" : undefined}>
    <Icon aria-hidden="true" /><span>{children}</span>
  </p>;
}

export function Avatar({ v, m }: { v: RoomView; m: MemberView }) {
  return <span class={`avatar${m.host ? " host" : ""}`} style={{ background: AVATAR_GELS[v.members.indexOf(m) % AVATAR_GELS.length] }}>
    <span aria-hidden="true">{Array.from(memberName(v, m))[0]}</span>
    {m.ready && <span class="ready-badge" role="img" aria-label={t("ready")}><Check aria-hidden="true" /></span>}
  </span>;
}

export function Qr({ text, size = 168 }: { text: string; size?: number }) {
  const qr = qrcode(0, "M");
  qr.addData(text);
  qr.make();
  return <div class="qr" style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true }) }} />;
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
      class="btn quiet press lang"
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

/**
 * While `open`, the phone's back button (or a swipe back) closes it instead of leaving the table:
 * opening adds a history entry with the same address, closing another way takes it off again.
 */
export function useBackCloses(open: boolean, close: () => void) {
  const latest = useRef(close);
  latest.current = close;
  // A layout effect, so the history entry is there as soon as the sheet is: a quick back press
  // right after opening closes the sheet instead of leaving the table.
  useLayoutEffect(() => {
    if (!open) return;
    history.pushState({ suibianSheet: true }, "");
    let popped = false;
    const onPop = () => {
      popped = true;
      latest.current();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (!popped && history.state?.suibianSheet) history.back();
    };
  }, [open]);
}
