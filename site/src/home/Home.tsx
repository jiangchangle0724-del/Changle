import { SlidersHorizontal } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { LangTab } from "../components/TopBar";
import { SettingsSheet } from "../components/SettingsSheet";
import type { GameId } from "../games/registry";
import { gsap, LIGHTS, reduced, setLight, useGSAP } from "../lib/anim";
import { useStore } from "../store";
import { PartyTab } from "./PartyTab";
import { TipButton } from "./Tip";
import { ToolsTab } from "../tools/ToolsTab";
import { WishlistTab } from "./WishlistTab";
import { AccountButton } from "../account/AccountButton";

export type HomeTab = "party" | "tools" | "wish";
const ORDER: HomeTab[] = ["party", "tools", "wish"];

/** The front door: the wordmark, three tabs, and the tip jar in the corner. */
export function Home({ tab, onTab, onOpenGame }: { tab: HomeTab; onTab: (t: HomeTab) => void; onOpenGame: (id: GameId) => void }) {
  const { ui } = useStore();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const prev = useRef(tab);
  const dir = ORDER.indexOf(tab) - ORDER.indexOf(prev.current);
  useEffect(() => {
    prev.current = tab;
  }, [tab]);

  useEffect(() => {
    if (tab === "tools") setLight(LIGHTS.tools);
    else if (tab === "wish") setLight(LIGHTS.wish);
  }, [tab]);

  return (
    <div className="screen home">
      <header className="home-head">
        <Wordmark />
        <div className="home-head-right">
          <LangTab />
          <button type="button" className="icon-btn" onClick={() => setSettingsOpen(true)} aria-label={ui("settings")}>
            <SlidersHorizontal size={20} />
          </button>
          <AccountButton />
        </div>
      </header>
      <Tabs value={tab} onChange={onTab} />
      <Panel key={tab} dir={dir}>
        {tab === "party" && <PartyTab onOpenGame={onOpenGame} onWishlist={() => onTab("wish")} />}
        {tab === "tools" && <ToolsTab />}
        {tab === "wish" && <WishlistTab />}
      </Panel>
      <TipButton />
      <SettingsSheet open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  );
}

function Wordmark() {
  const ref = useRef<HTMLHeadingElement>(null);
  useGSAP(
    () => {
      if (reduced()) return;
      gsap.fromTo(".wordmark-char", { y: 18, opacity: 0 }, { y: 0, opacity: 1, stagger: 0.035, duration: 0.6, delay: 0.1, clearProps: "transform,opacity" });
      gsap.fromTo(".wordmark-dot", { scale: 0, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.7, delay: 0.45, ease: "back.out(3)", clearProps: "transform,opacity" });
    },
    { scope: ref },
  );
  return (
    <h1 className="wordmark" ref={ref} aria-label="changle">
      {"changle".split("").map((ch, i) => (
        <span key={i} className="wordmark-char" aria-hidden="true">
          {ch}
        </span>
      ))}
      <span className="wordmark-dot" aria-hidden="true">
        .
      </span>
    </h1>
  );
}

function Tabs({ value, onChange }: { value: HomeTab; onChange: (t: HomeTab) => void }) {
  const { lang } = useStore();
  const ref = useRef<HTMLDivElement>(null);
  const ind = useRef<HTMLSpanElement>(null);
  const first = useRef(true);

  const place = (animate: boolean) => {
    const btn = ref.current?.querySelector<HTMLButtonElement>(`[data-tab="${value}"]`);
    if (!btn || !ind.current) return;
    gsap.to(ind.current, { x: btn.offsetLeft, width: btn.offsetWidth, duration: animate && !reduced() ? 0.5 : 0, ease: "settle" });
  };

  useLayoutEffect(() => {
    place(!first.current);
    first.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, lang]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => place(false));
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const labels: Record<HomeTab, { zh: string; en: string }> = {
    party: { zh: "聚会", en: "Party" },
    tools: { zh: "工具", en: "Tools" },
    wish: { zh: "心愿单", en: "Wishlist" },
  };
  return (
    <div className="tabs" role="tablist" ref={ref}>
      <span className="tabs-indicator" ref={ind} aria-hidden="true" />
      {ORDER.map((t) => (
        <button key={t} type="button" role="tab" data-tab={t} aria-selected={value === t} className="tab" onClick={() => onChange(t)}>
          <span className="tab-main">{lang === "zh" ? labels[t].zh : labels[t].en}</span>
          <span className="tab-sub">{lang === "zh" ? labels[t].en : labels[t].zh}</span>
        </button>
      ))}
    </div>
  );
}

function Panel({ children, dir }: { children: React.ReactNode; dir: number }) {
  const ref = useRef<HTMLDivElement>(null);
  useGSAP(
    () => {
      if (reduced() || dir === 0) return;
      gsap.fromTo(ref.current, { x: dir > 0 ? 28 : -28, opacity: 0 }, { x: 0, opacity: 1, duration: 0.42, clearProps: "transform,opacity" });
    },
    { scope: ref },
  );
  return (
    <div className="home-panel" ref={ref} role="tabpanel">
      {children}
    </div>
  );
}
