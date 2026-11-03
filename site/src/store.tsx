import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { UI, fill, t, type Lang, type T, type UIKey } from "./i18n";

export type Player = { id: string; name: string };

type Settings = {
  lang: Lang;
  sound: boolean;
  music: boolean;
  customPenalty: string;
  players: Player[];
};

const KEY = "lazysusan.settings.v1";

/**
 * A first visit opens in the phone's own language, the first one in its list (Steve's call,
 * 2026-11-02): Chinese if that is Chinese, English otherwise. 到此一游, 随便 and 一起跳 decide
 * the same way. After that, the reader's own choice (中 / EN) is kept.
 */
function phoneLang(): Lang {
  try {
    const first = navigator.languages?.[0] ?? navigator.language;
    return first ? (/^zh\b/i.test(first) ? "zh" : "en") : "zh";
  } catch {
    return "zh";
  }
}

function load(): Settings {
  const fallback: Settings = { lang: phoneLang(), sound: true, music: false, customPenalty: "", players: [] };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return {
      lang: parsed.lang === "en" || parsed.lang === "zh" ? parsed.lang : fallback.lang,
      sound: parsed.sound !== false,
      music: parsed.music === true,
      customPenalty: typeof parsed.customPenalty === "string" ? parsed.customPenalty : "",
      players: Array.isArray(parsed.players) ? parsed.players.filter((p) => p && typeof p.name === "string") : [],
    };
  } catch {
    return fallback;
  }
}

function save(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage can be unavailable in private windows; the night goes on */
  }
}

type Store = Settings & {
  setLang: (l: Lang) => void;
  setSound: (on: boolean) => void;
  setMusic: (on: boolean) => void;
  setCustomPenalty: (s: string) => void;
  addPlayer: (name: string) => void;
  removePlayer: (id: string) => void;
  renamePlayer: (id: string, name: string) => void;
  setQuickSeats: (n: number) => void;
  clearPlayers: () => void;
  /** Translate a UI key with optional variables. */
  ui: (key: UIKey, vars?: Record<string, string | number>) => string;
  /** Translate a bilingual string. */
  tr: (s: T) => string;
};

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<Settings>(load);

  useEffect(() => {
    save(state);
    document.documentElement.lang = state.lang === "zh" ? "zh-CN" : "en";
  }, [state]);

  const ui = useCallback(
    (key: UIKey, vars?: Record<string, string | number>) => {
      const s = t(state.lang, UI[key]);
      return vars ? fill(s, vars) : s;
    },
    [state.lang],
  );
  const tr = useCallback((s: T) => t(state.lang, s), [state.lang]);

  const value = useMemo<Store>(
    () => ({
      ...state,
      setLang: (lang) => setState((s) => ({ ...s, lang })),
      setSound: (sound) => setState((s) => ({ ...s, sound })),
      setMusic: (music) => setState((s) => ({ ...s, music })),
      setCustomPenalty: (customPenalty) => setState((s) => ({ ...s, customPenalty })),
      addPlayer: (name) =>
        setState((s) => {
          const trimmed = name.trim();
          if (!trimmed || s.players.length >= 15) return s;
          return { ...s, players: [...s.players, { id: Math.random().toString(36).slice(2, 9), name: trimmed }] };
        }),
      removePlayer: (id) => setState((s) => ({ ...s, players: s.players.filter((p) => p.id !== id) })),
      renamePlayer: (id, name) =>
        setState((s) => ({ ...s, players: s.players.map((p) => (p.id === id ? { ...p, name } : p)) })),
      setQuickSeats: (n) =>
        setState((s) => ({
          ...s,
          players: Array.from({ length: Math.min(15, Math.max(2, n)) }, (_, i) => ({
            id: `seat-${i + 1}`,
            name: fill(t(s.lang, UI.seatN), { n: i + 1 }),
          })),
        })),
      clearPlayers: () => setState((s) => ({ ...s, players: [] })),
      ui,
      tr,
    }),
    [state, ui, tr],
  );

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore() {
  const ctx = useContext(StoreContext);
  if (!ctx) throw new Error("useStore outside StoreProvider");
  return ctx;
}

/** Online: the table's penalty, which the host sets for every phone at the table ("" is drinking). */
const TablePenaltyContext = createContext<string | null>(null);

export function TablePenalty({ value, children }: { value: string; children: ReactNode }) {
  return <TablePenaltyContext.Provider value={value}>{children}</TablePenaltyContext.Provider>;
}

/**
 * The penalty every game ends on: this phone's own setting, or online the table's. With a custom
 * penalty no line may tell anyone to drink, so `line` picks the words that fit: the drinking line
 * by default, the other one when the host has set their own penalty.
 */
export function usePenaltyText() {
  const { customPenalty, ui, lang } = useStore();
  const table = useContext(TablePenaltyContext);
  const text = (table ?? customPenalty).trim();
  const isCustom = !!text;
  return useMemo(
    () => ({
      sip: isCustom ? text : ui("sip"),
      full: isCustom ? text : ui("finish"),
      isCustom,
      /** the custom penalty itself, "" when it's drinking */
      text,
      line: (drink: T, custom: T) => t(lang, isCustom ? custom : drink),
    }),
    [isCustom, text, ui, lang],
  );
}
