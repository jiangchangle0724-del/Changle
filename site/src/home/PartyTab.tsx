import { Dices, KeyRound, RadioTower, UserPlus, Users } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PlayersSheet } from "../components/PlayersSheet";
import { GAME_BY_ID, GAMES, SOON, type GameId, type GameMeta, type SoonMeta } from "../games/registry";
import { Sheet } from "../components/Sheet";
import { gsap, LIGHTS, reduced, setLight, useGSAP } from "../lib/anim";
import { haptic, sfx } from "../lib/sfx";
import { OnlineSheet } from "../online/OnlineSheet";
import { useStore } from "../store";
import { GameSheet } from "./GameSheet";
import { Tile } from "./Tile";
import { runSweep } from "../lib/sweep";

const ENTERED = "changle.entered";

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

  // (a hidden game has only its own address, not a tile, even as coming soon)
  const ready = GAMES.map((g, i) => (g.ready && !g.hidden ? i : -1)).filter((i) => i >= 0);
  const soon = GAMES.map((g, i) => (g.ready || g.hidden ? -1 : i)).filter((i) => i >= 0);

  const spin = () => {
    if (spinning) return;
    const target = ready[Math.floor(Math.random() * ready.length)];
    if (reduced()) {
      setLit(target);
      setLight(GAMES[target].gel);
      onCard(GAMES[target].id);
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
              <Tile key={GAMES[i].id} g={GAMES[i]} i={i} lit={lit === i} lang={lang} compact onOpen={() => open(GAMES[i], i)} />
            ))}
            {SOON.map((s, k) => (
              <Tile
                key={s.key}
                g={s}
                i={GAMES.length + k}
                lit={false}
                lang={lang}
                compact
                onOpen={() => {
                  setLight(s.gel, 0.4);
                  sfx.tap();
                  setSoonCard(s);
                }}
              />
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

      {/* the card steps aside while its online sheet is up; back closes that sheet and shows the card again */}
      <GameSheet
        game={online.open ? null : sheet}
        need={need}
        onClose={() => onCard(null)}
        onPlay={onPlay}
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
