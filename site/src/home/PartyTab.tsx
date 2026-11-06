import { Dices, KeyRound, RadioTower, UserPlus, Users } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { PlayersSheet } from "../components/PlayersSheet";
import { GAME_BY_ID, GAMES, isNewGame, SOON, type GameId, type GameMeta, type SoonMeta } from "../games/registry";
import { Sheet } from "../components/Sheet";
import type { T } from "../i18n";
import { LIGHTS, reduced, setLight } from "../lib/motion";
import { haptic, sfx } from "../lib/sfx";
import { OnlineSheet } from "../online/OnlineSheet";
import { usePenaltyText, useStore } from "../store";
import { Pill } from "../ui/Pill";
import { Tile } from "../ui/Tile";
import "../ui/base.css";
import { GameSheet } from "./GameSheet";
import { runSweep } from "../lib/sweep";

const ENTERED = "changle.entered";
/** the last few games played on this phone, newest first: 现在玩这个 suggests something else */
const PLAYED = "changle.played";

/*
 * The party tab, top to bottom (UI plan A4): tonight's people, 现在玩这个 (one game picked for this
 * many people, not the one just played), the filters, every game colored by its kind, coming soon.
 */
type Filter = "all" | "drink" | "dry" | "body" | "online";
const FILTERS: { key: Filter; label: T; drinkWord?: boolean }[] = [
  { key: "all", label: { zh: "全部", en: "All" } },
  { key: "drink", label: { zh: "喝酒局", en: "Drinking" }, drinkWord: true },
  { key: "dry", label: { zh: "不喝酒", en: "No drinking" }, drinkWord: true },
  { key: "body", label: { zh: "动身体", en: "On your feet" } },
  { key: "online", label: { zh: "线上", en: "Online" } },
];
const passes = (g: GameMeta, f: Filter) => f === "all" || (f === "drink" ? !!g.drinking : f === "dry" ? !g.drinking : g.category === f);
/** playable on one phone by this many people */
const fits = (g: GameMeta, n: number) => n >= (g.solo?.min ?? g.minPlayers) && n <= g.maxPlayers;
/** the order 现在玩这个 suggests in: easy to start, fun at any size */
const STARTERS: GameId[] = ["truth", "undercover", "king", "superlatives", "prompts", "draw", "rogue", "postit", "wheel", "dice", "tune", "drama", "punchline", "limbo", "freeze", "euchre", "trip"];

function readPlayed(): GameId[] {
  try {
    const list = JSON.parse(localStorage.getItem(PLAYED) ?? "[]");
    return Array.isArray(list) ? list.filter((id): id is GameId => typeof id === "string" && id in GAME_BY_ID) : [];
  } catch {
    return [];
  }
}
function rememberPlayed(id: GameId) {
  try {
    localStorage.setItem(PLAYED, JSON.stringify([id, ...readPlayed().filter((x) => x !== id)].slice(0, 5)));
  } catch {
    /* private window: nothing to remember with */
  }
}
/** Games to suggest for this many people (0: nobody added yet), freshest first. */
function suggestions(n: number, played: GameId[]): GameMeta[] {
  const pool = STARTERS.map((id) => GAME_BY_ID[id]).filter((g) => g && g.ready && !g.hidden && !g.speaker && !g.stage && (n < 2 || fits(g, n)));
  const recent = played.slice(0, 2);
  return [...pool.filter((g) => !recent.includes(g.id)), ...pool.filter((g) => recent.includes(g.id))];
}

/** elastic.out(1, 0.45) as CSS: the landed tile's little bounce */
const BOUNCE =
  typeof CSS !== "undefined" && CSS.supports("animation-timing-function", "linear(0, 1)")
    ? "linear(0, 0.53 7%, 1.07 14%, 1.18 19%, 1.09 26%, 0.97 33%, 0.96 39%, 1.01 50%, 1.005 62%, 1)"
    : "cubic-bezier(0.34, 1.56, 0.64, 1)";

export function PartyTab({
  card,
  onCard,
  onPlay,
  onWishlist,
}: {
  /** the game whose card is open: the address says so (/g/<slug>) */
  card?: GameId;
  onCard: (id: GameId | null) => void;
  onPlay: (id: GameId) => void;
  onWishlist: () => void;
}) {
  const { players, ui, lang } = useStore();
  const custom = usePenaltyText().isCustom;
  const zh = lang === "zh";
  const n = players.length;
  const [playersOpen, setPlayersOpen] = useState(false);
  const [soonCard, setSoonCard] = useState<SoonMeta | null>(null);
  const [online, setOnline] = useState<{ open: boolean; game?: GameId; join?: boolean }>({ open: false });
  const sheet: GameMeta | null = card ? GAME_BY_ID[card] : null;
  const [spinning, setSpinning] = useState(false);
  const [lit, setLit] = useState<number | null>(null);
  // a card opened by its address (a shared link, the back button): its tile under the light
  useEffect(() => {
    const i = card ? GAMES.findIndex((g) => g.id === card) : -1;
    if (i < 0) return;
    setLit(i);
    setLight(GAMES[i].gel, 0.4);
  }, [card]);
  // the card that opens after the light lands: not if this tab has gone by then
  const landing = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(landing.current), []);
  const grid = useRef<HTMLDivElement>(null);
  const tl = useRef<ReturnType<typeof runSweep> | null>(null);

  const [entrance] = useState(() => {
    try {
      return !sessionStorage.getItem(ENTERED);
    } catch {
      return true;
    }
  });
  useEffect(() => {
    try {
      sessionStorage.setItem(ENTERED, "1");
    } catch {
      /* fine */
    }
    setLight(LIGHTS.party);
    return () => {
      tl.current?.kill();
    };
  }, []);

  // first visit of the session: the lights come up across the board
  useEffect(() => {
    if (!entrance || reduced() || !grid.current) return;
    grid.current.querySelectorAll<HTMLElement>(".ui-tile").forEach((el, k) =>
      el.animate([{ transform: "translateY(26px) scale(0.94)", opacity: 0 }, { transform: "none", opacity: 1 }], {
        duration: 600,
        delay: 250 + k * 35,
        easing: "cubic-bezier(0.16, 1, 0.3, 1)",
        fill: "backwards",
      }),
    );
  }, [entrance]);

  // the filters; drinking ones step aside when this phone plays for its own penalty
  const [filter, setFilter] = useState<Filter>("all");
  const [fit, setFit] = useState(false);
  const filters = FILTERS.filter((f) => !(custom && f.drinkWord));
  const activeFilter: Filter = filters.some((f) => f.key === filter) ? filter : "all";
  const useFit = fit && n >= 2;

  // (a hidden game has only its own address, not a tile, even as coming soon)
  const ready = GAMES.map((g, i) => (g.ready && !g.hidden ? i : -1)).filter((i) => i >= 0);
  const shown = ready.filter((i) => passes(GAMES[i], activeFilter) && (!useFit || fits(GAMES[i], n)));
  const soon = GAMES.map((g, i) => (g.ready || g.hidden ? -1 : i)).filter((i) => i >= 0);

  // 现在玩这个: one game for this many people, and another on request
  const [played, setPlayed] = useState(readPlayed);
  const picks = useMemo(() => suggestions(n, played), [n, played]);
  const [pickAt, setPickAt] = useState(0);
  useEffect(() => setPickAt(0), [n]);
  const pick = picks.length ? picks[pickAt % picks.length] : null;
  const play = (id: GameId) => {
    rememberPlayed(id);
    setPlayed(readPlayed());
    onPlay(id);
  };

  // 转一个 picks among the games on show (all of them, or the filtered ones)
  const spin = () => {
    if (spinning || !shown.length) return;
    const pool = shown;
    const target = pool[Math.floor(Math.random() * pool.length)];
    if (reduced()) {
      setLit(target);
      setLight(GAMES[target].gel);
      onCard(GAMES[target].id);
      return;
    }
    setSpinning(true);
    haptic(6);
    // walk the light across the board twice, slowing into the target
    const from = Math.max(0, pool.indexOf(lit ?? pool[0]));
    tl.current = runSweep(pool.length, from, pool.indexOf(target), {
      onStep: (k, p) => {
        const idx = pool[k];
        setLit(idx);
        setLight(GAMES[idx].gel, 0.18);
        sfx.tick(1.1 - p * 0.6);
      },
      onDone: () => {
        setSpinning(false);
        sfx.settle();
        haptic([10, 40, 18]);
        document.querySelector<HTMLElement>(`[data-tile="${target}"] .ui-tile`)?.animate([{ transform: "scale(1.08)" }, { transform: "scale(1)" }], { duration: 700, easing: BOUNCE });
        landing.current = window.setTimeout(() => onCard(GAMES[target].id), 420);
      },
    });
  };

  const open = (g: GameMeta, i: number) => {
    if (spinning) return;
    setLit(i);
    setLight(g.gel, 0.4);
    sfx.tap();
    onCard(g.id);
  };

  const need = sheet ? Math.max(0, (sheet.solo?.min ?? sheet.minPlayers) - players.length) : 0;

  const tile = (i: number, size?: "hero") => {
    const g = GAMES[i];
    return (
      <Tile
        name={g.name}
        lang={lang}
        icon={g.icon}
        category={g.category}
        players={{ min: g.minPlayers, max: g.maxPlayers }}
        minutes={g.minutes}
        drinking={g.drinking && !custom}
        isNew={isNewGame(g)}
        soon={!g.ready}
        lit={size ? false : lit === i}
        size={size}
        onOpen={() => open(g, i)}
      />
    );
  };

  return (
    <div className="party">
      <div className="party-side">
        <section className="tonight" aria-label={ui("tonight")}>
          <div className="tonight-head">
            <h2 className="section-title">{ui("tonight")}</h2>
            {players.length > 0 && (
              <button type="button" className="link-btn" onClick={() => setPlayersOpen(true)}>
                {ui("editPlayers")}
              </button>
            )}
          </div>
          {players.length ? (
            // named by what it shows: a screen reader hears the names, then the count
            <button type="button" className="roster" onClick={() => setPlayersOpen(true)}>
              {players.slice(0, 8).map((p, i) => (
                <span key={p.id} className="roster-face" style={{ ["--i" as string]: i }} aria-hidden="true">
                  {initials(p.name)}
                </span>
              ))}
              {players.length > 8 && (
                <span className="roster-face roster-more" aria-hidden="true">
                  +{players.length - 8}
                </span>
              )}
              <span className="ui-visually-hidden">
                {ui("players")}: {players.map((p) => p.name).join(lang === "zh" ? "、" : ", ")}.{" "}
              </span>
              <span className="roster-count">{ui("playersCount", { n: players.length })}</span>
            </button>
          ) : (
            <button type="button" className="btn btn-quiet btn-block roster-empty" onClick={() => setPlayersOpen(true)}>
              <UserPlus size={18} />
              {ui("addPeople")}
            </button>
          )}
          <div className="online-row">
            <button type="button" className="online-btn" onClick={() => setOnline({ open: true })}>
              <RadioTower size={18} />
              <span>
                <strong>{ui("playOnline")}</strong>
                <small>{ui("onlineStrip")}</small>
              </span>
            </button>
            <button type="button" className="icon-btn online-code" onClick={() => setOnline({ open: true, join: true })} aria-label={ui("joinWithCode")}>
              <KeyRound size={19} />
            </button>
          </div>
        </section>

        {pick && (
          <section className="now" aria-labelledby="now-title">
            <div className="board-head">
              <h2 className="section-title" id="now-title">
                {zh ? "现在玩这个" : "Play this now"}
              </h2>
              {picks.length > 1 && (
                <button type="button" className="link-btn" onClick={() => setPickAt((k) => k + 1)}>
                  {zh ? "换一个" : "Another"}
                </button>
              )}
            </div>
            <p className="hint now-why">
              {n >= 2
                ? zh
                  ? `${n} 个人，先来一局${pick.name.zh}`
                  : `${n} of you: start with ${pick.name.en}`
                : zh
                  ? `先来一局${pick.name.zh}`
                  : `Start with ${pick.name.en}`}
            </p>
            {tile(GAMES.indexOf(pick), "hero")}
          </section>
        )}
      </div>

      <div className="party-main">
        <div className="filters" role="group" aria-label={zh ? "筛选游戏" : "Filter games"}>
          {filters.map((f) => (
            <Pill
              key={f.key}
              kind="toggle"
              selected={activeFilter === f.key}
              tone={f.key === "drink" || f.key === "body" || f.key === "online" ? f.key : undefined}
              onToggle={(on) => setFilter(on ? f.key : "all")}
            >
              {f.label[lang]}
            </Pill>
          ))}
          {n >= 2 && (
            <Pill kind="toggle" selected={useFit} icon={Users} onToggle={setFit}>
              {zh ? `适合 ${n} 人` : `Fits ${n}`}
            </Pill>
          )}
        </div>

        <div className="board-head">
          <h2 className="section-title">{ui("allGames", { n: shown.length })}</h2>
          <button type="button" className="spin-btn" onClick={spin} disabled={spinning || !shown.length} aria-label={ui("spin")}>
            <Dices size={18} />
            {spinning ? ui("spinning") : ui("spin")}
          </button>
        </div>

        {shown.length ? (
          <div className={`board ${spinning ? "is-spinning" : ""}`} ref={grid}>
            {shown.map((i) => (
              <div key={GAMES[i].id} className="board-cell" data-tile={i}>
                {tile(i)}
              </div>
            ))}
          </div>
        ) : (
          <p className="hint board-empty">{zh ? "没有合适的游戏，换个筛选试试。" : "Nothing fits. Try another filter."}</p>
        )}

        {soon.length + SOON.length > 0 && (
          <>
            <div className="board-head board-head-soon">
              <h2 className="section-title">{ui("soon")}</h2>
              <button type="button" className="link-btn" onClick={onWishlist}>
                {ui("toWishlist")}
              </button>
            </div>
            <div className="board board-soon">
              {soon.map((i) => (
                <div key={GAMES[i].id} className="board-cell" data-tile={i}>
                  {tile(i)}
                </div>
              ))}
              {/* still being built, with no table game yet (一起跳): its card only says what it is */}
              {SOON.map((s) => (
                <div key={s.key} className="board-cell">
                  <Tile
                    name={s.name}
                    lang={lang}
                    icon={s.icon}
                    category={s.category}
                    players={{ min: s.minPlayers, max: s.maxPlayers }}
                    minutes={s.minutes}
                    soon
                    onOpen={() => {
                      setLight(s.gel, 0.4);
                      sfx.tap();
                      setSoonCard(s);
                    }}
                  />
                </div>
              ))}
            </div>
          </>
        )}
        <SoonCard item={soonCard} onClose={() => setSoonCard(null)} />

        <p className="board-foot hint">
          <Users size={14} /> {ui("adultsOnly")}
          {lang === "zh" ? "。" : ". "}
          {ui("responsible")}
        </p>
      </div>

      {/* the card steps aside while its online sheet is up; back closes that sheet and shows the card again */}
      <GameSheet
        game={online.open ? null : sheet}
        need={need}
        onClose={() => onCard(null)}
        onPlay={play}
        onAddPeople={() => setPlayersOpen(true)}
        onOnline={(id) => setOnline({ open: true, game: id })}
        onWishlist={onWishlist}
      />
      <PlayersSheet open={playersOpen} onClose={() => setPlayersOpen(false)} />
      <OnlineSheet open={online.open} game={online.game} focusCode={online.join} onClose={() => setOnline({ open: false })} />
    </div>
  );
}

/** A game still being built (一起跳): what it is, and that it can't be played yet. */
function SoonCard({ item, onClose }: { item: SoonMeta | null; onClose: () => void }) {
  const { ui, tr, lang } = useStore();
  const zh = lang === "zh";
  const Icon = item?.icon;
  return (
    <Sheet open={!!item} onClose={onClose} gel={item?.gel} label={item ? tr(item.name) : undefined}>
      {item && Icon && (
        <div className="game-card" style={{ ["--gel" as string]: item.gel }}>
          <div className="game-card-head">
            <span className="game-card-icon" aria-hidden="true">
              <Icon size={34} strokeWidth={1.8} />
            </span>
            <div className="game-card-names">
              <h2 className={`game-card-title ${zh ? "is-zh" : ""}`}>{zh ? item.name.zh : item.name.en}</h2>
              <p className="game-card-sub">{zh ? item.name.en : item.name.zh}</p>
            </div>
          </div>
          <p className="game-card-how">{tr(item.how)}</p>
          <p className="game-card-meta">{ui("playersRange", { min: item.minPlayers, max: item.maxPlayers })}</p>
          <div className="game-card-soon">
            <p>{zh ? "还在做，做好了就能在这里开玩。" : "Still being built. Once it's ready, you'll start it right here."}</p>
            <button type="button" className="btn btn-ghost btn-block" onClick={onClose}>
              {ui("close")}
            </button>
          </div>
        </div>
      )}
    </Sheet>
  );
}

export function initials(name: string) {
  const s = name.trim();
  if (!s) return "?";
  // CJK names: the first character; latin names: first letters of two words
  if (/[㐀-鿿]/.test(s[0])) return s.slice(0, 1);
  return s.slice(0, 1).toUpperCase();
}
