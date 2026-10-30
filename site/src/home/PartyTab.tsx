import { Dices, KeyRound, RadioTower, UserPlus, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PlayersSheet } from "../components/PlayersSheet";
import { GAMES, type GameId, type GameMeta } from "../games/registry";
import { gsap, LIGHTS, reduced, setLight, useGSAP } from "../lib/anim";
import { haptic, sfx } from "../lib/sfx";
import { OnlineSheet } from "../online/OnlineSheet";
import { useStore } from "../store";
import { GameSheet } from "./GameSheet";
import { Tile } from "./Tile";
import { runSweep } from "../lib/sweep";

const ENTERED = "changle.entered";

export function PartyTab({ onOpenGame, onWishlist }: { onOpenGame: (id: GameId) => void; onWishlist: () => void }) {
  const { players, ui, lang } = useStore();
  const [playersOpen, setPlayersOpen] = useState(false);
  const [online, setOnline] = useState<{ open: boolean; game?: GameId; join?: boolean }>({ open: false });
  const [sheet, setSheet] = useState<GameMeta | null>(null);
  const [spinning, setSpinning] = useState(false);
  const [lit, setLit] = useState<number | null>(null);
  const grid = useRef<HTMLDivElement>(null);
  const tl = useRef<gsap.core.Timeline | null>(null);

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
  useGSAP(
    () => {
      if (!entrance || reduced()) return;
      gsap.fromTo(".tile", { y: 26, opacity: 0, scale: 0.94 }, { y: 0, opacity: 1, scale: 1, stagger: { each: 0.035, from: "start" }, duration: 0.6, delay: 0.25, clearProps: "transform,opacity" });
    },
    { scope: grid },
  );

  const ready = GAMES.map((g, i) => (g.ready ? i : -1)).filter((i) => i >= 0);
  const soon = GAMES.map((g, i) => (g.ready ? -1 : i)).filter((i) => i >= 0);

  const spin = () => {
    if (spinning) return;
    const target = ready[Math.floor(Math.random() * ready.length)];
    if (reduced()) {
      setLit(target);
      setSheet(GAMES[target]);
      setLight(GAMES[target].gel);
      return;
    }
    setSpinning(true);
    haptic(6);
    // walk the light across the whole board twice, slowing into the target
    const from = Math.max(0, ready.indexOf(lit ?? ready[0]));
    tl.current = runSweep(ready.length, from, ready.indexOf(target), {
      onStep: (k, p) => {
        const idx = ready[k];
        setLit(idx);
        setLight(GAMES[idx].gel, 0.18);
        sfx.tick(1.1 - p * 0.6);
      },
      onDone: () => {
        setSpinning(false);
        sfx.settle();
        haptic([10, 40, 18]);
        gsap.fromTo(`[data-tile="${target}"]`, { scale: 1.08 }, { scale: 1, duration: 0.7, ease: "elastic.out(1, 0.45)" });
        window.setTimeout(() => setSheet(GAMES[target]), 420);
      },
    });
  };

  const open = (g: GameMeta, i: number) => {
    if (spinning) return;
    setLit(i);
    setLight(g.gel, 0.4);
    sfx.tap();
    setSheet(g);
  };

  const need = sheet ? Math.max(0, (sheet.solo?.min ?? sheet.minPlayers) - players.length) : 0;

  return (
    <div className="party">
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
          <button type="button" className="roster" onClick={() => setPlayersOpen(true)} aria-label={ui("players")}>
            {players.slice(0, 8).map((p, i) => (
              <span key={p.id} className="roster-face" style={{ ["--i" as string]: i }}>
                {initials(p.name)}
              </span>
            ))}
            {players.length > 8 && <span className="roster-face roster-more">+{players.length - 8}</span>}
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

      <div className="board-head">
        <h2 className="section-title">{ui("allGames", { n: ready.length })}</h2>
        <button type="button" className="spin-btn" onClick={spin} disabled={spinning} aria-label={ui("spin")}>
          <Dices size={18} />
          {spinning ? ui("spinning") : ui("spin")}
        </button>
      </div>

      <div className={`board ${spinning ? "is-spinning" : ""}`} ref={grid}>
        {ready.map((i) => (
          <Tile key={GAMES[i].id} g={GAMES[i]} i={i} lit={lit === i} lang={lang} onOpen={() => open(GAMES[i], i)} onPress={() => !spinning && setLight(GAMES[i].gel, 0.35)} />
        ))}
      </div>

      {soon.length > 0 && (
        <>
          <div className="board-head board-head-soon">
            <h2 className="section-title">{ui("soon")}</h2>
            <button type="button" className="link-btn" onClick={onWishlist}>
              {ui("toWishlist")}
            </button>
          </div>
          <div className="board board-soon">
            {soon.map((i) => (
              <Tile key={GAMES[i].id} g={GAMES[i]} i={i} lit={lit === i} lang={lang} compact onOpen={() => open(GAMES[i], i)} />
            ))}
          </div>
        </>
      )}

      <p className="board-foot hint">
        <Users size={14} /> {ui("adultsOnly")}
        {lang === "zh" ? "。" : ". "}
        {ui("responsible")}
      </p>

      <GameSheet
        game={sheet}
        need={need}
        onClose={() => setSheet(null)}
        onPlay={(id) => {
          setSheet(null);
          onOpenGame(id);
        }}
        onAddPeople={() => setPlayersOpen(true)}
        onOnline={(id) => {
          setSheet(null);
          setOnline({ open: true, game: id });
        }}
        onWishlist={() => {
          setSheet(null);
          onWishlist();
        }}
      />
      <PlayersSheet open={playersOpen} onClose={() => setPlayersOpen(false)} />
      <OnlineSheet open={online.open} game={online.game} focusCode={online.join} onClose={() => setOnline({ open: false })} />
    </div>
  );
}

export function initials(name: string) {
  const s = name.trim();
  if (!s) return "?";
  // CJK names: the first character; latin names: first letters of two words
  if (/[㐀-鿿]/.test(s[0])) return s.slice(0, 1);
  return s.slice(0, 1).toUpperCase();
}
