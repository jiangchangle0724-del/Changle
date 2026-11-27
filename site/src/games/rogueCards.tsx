import { Camera, ChevronDown, Crown, DoorOpen, Feather, Gem, Hand, MessageCircle, Wine, type LucideIcon } from "lucide-react";
import { animate, AnimatePresence, motion, useMotionValue, useReducedMotion, useTransform, type PanInfo, type Variants } from "motion/react";
import { memo, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { haptic } from "../lib/sfx";
import { useWakeLock } from "../party/sensors";
import { RULE_BY_RANK, ruleWords, SUIT_GLYPH, SUIT_RED, type Card, type Power, type Rank, type Suit } from "../data/rogue13";
import type { Lang } from "../i18n";
import { usePenaltyText, useStore } from "../store";
import { warmHi } from "./rogueSounds";
import "../styles/rogue.css";

/**
 * 流氓十三张's own deck. Every card carries its rule's name on a band in the game's color, the
 * five power cards wear their power's mark in the corner, and the rest reads like a real deck:
 * pips laid out the classic way, court cards framed. The one phone, every phone online and the
 * big screen draw the same cards (styles/rogue.css).
 */

export const POWER_ICON: Record<Power, LucideIcon> = { buddy: Wine, camera: Camera, nose: Hand, wc: DoorOpen, trouble: MessageCircle };
const COURT_ICON: Partial<Record<Rank, LucideIcon>> = { J: Feather, Q: Gem, K: Crown };

/* the face is drawn in a 200 by 280 box: the index top left, the pips in the middle, the band along the bottom */
const XL = 66;
const XC = 100;
const XR = 134;
const ROW = { top: 76, hi: 109, mid: 142, lo: 175, bot: 208 };
const ROW4 = { a: 76, b: 120, c: 164, d: 208, ab: 98, cd: 186 };

/** Where the pips of a number card sit (the lower half's pips hang upside down, as on a real card). */
function pips(rank: Rank): [number, number][] {
  const four: [number, number][] = [
    [XL, ROW.top],
    [XR, ROW.top],
    [XL, ROW.bot],
    [XR, ROW.bot],
  ];
  const six: [number, number][] = [...four, [XL, ROW.mid], [XR, ROW.mid]];
  const eight: [number, number][] = [
    [XL, ROW4.a],
    [XR, ROW4.a],
    [XL, ROW4.b],
    [XR, ROW4.b],
    [XL, ROW4.c],
    [XR, ROW4.c],
    [XL, ROW4.d],
    [XR, ROW4.d],
  ];
  switch (rank) {
    case "2":
      return [
        [XC, ROW.top],
        [XC, ROW.bot],
      ];
    case "3":
      return [
        [XC, ROW.top],
        [XC, ROW.mid],
        [XC, ROW.bot],
      ];
    case "4":
      return four;
    case "5":
      return [...four, [XC, ROW.mid]];
    case "6":
      return six;
    case "7":
      return [...six, [XC, ROW.hi]];
    case "8":
      return [...six, [XC, ROW.hi], [XC, ROW.lo]];
    case "9":
      return [...eight, [XC, ROW.mid]];
    case "10":
      return [...eight, [XC, ROW4.ab], [XC, ROW4.cd]];
    default:
      return [];
  }
}

const DISPLAY = { fontFamily: "var(--font-display)" } as const;
const ZH = { fontFamily: "var(--font-zh)" } as const;
const TEXT = { fontFamily: "var(--font-text)" } as const;

/**
 * The face of a card. `mini`: the small card in the tray of held powers, which only needs to be
 * recognized (a big rank, the band, the power's mark), not read.
 */
export const CardFace = memo(function CardFace({ rank, suit, lang, custom, mini = false }: { rank: Rank; suit?: Suit; lang: Lang; custom: boolean; mini?: boolean }) {
  const rule = RULE_BY_RANK[rank];
  const words = ruleWords(rule, custom);
  const red = suit ? SUIT_RED[suit] : false;
  const ink = red ? "var(--rg-red)" : "var(--rg-ink)";
  const glyph = suit ? SUIT_GLYPH[suit] : "";
  const Mark = rule.power ? POWER_ICON[rule.power] : null;
  const Court = COURT_ICON[rank];
  const main = lang === "zh" ? words.title.zh : words.title.en;
  const other = lang === "zh" ? words.title.en : words.title.zh;
  return (
    <svg viewBox="0 0 200 280" aria-hidden="true">
      <rect x="2" y="2" width="196" height="276" rx="14" fill="var(--rg-paper)" />
      <rect x="9" y="9" width="182" height="262" rx="10" fill="none" stroke="var(--rg-edge)" strokeWidth="1.2" />

      {mini ? (
        <>
          <text x="100" y="124" textAnchor="middle" dominantBaseline="central" fontSize={rank === "10" ? 84 : 96} fontWeight="800" fill={ink} style={DISPLAY}>
            {rank}
          </text>
          {suit && (
            <text x="100" y="198" textAnchor="middle" dominantBaseline="central" fontSize="44" fill={ink}>
              {glyph}
            </text>
          )}
        </>
      ) : (
        <>
          {/* the index */}
          <text x="20" y="38" fontSize="24" fontWeight="800" fill={ink} style={DISPLAY}>
            {rank}
          </text>
          {suit && (
            <text x="21" y="58" fontSize="18" fill={ink}>
              {glyph}
            </text>
          )}

          {/* the middle: one big pip, the classic pips, or a court frame */}
          {rank === "A" ? (
            <text x="100" y="146" textAnchor="middle" dominantBaseline="central" fontSize="118" fill={ink}>
              {glyph || "A"}
            </text>
          ) : Court ? (
            <g>
              <rect x="38" y="66" width="124" height="156" rx="10" fill={ink} opacity="0.07" />
              <rect x="38" y="66" width="124" height="156" rx="10" fill="none" stroke={ink} strokeWidth="1.5" opacity="0.6" />
              <text x="100" y="130" textAnchor="middle" dominantBaseline="central" fontSize="84" fontWeight="800" fill={ink} style={DISPLAY}>
                {rank}
              </text>
              <Court x={85} y={180} size={30} color={ink} strokeWidth={2} />
              {suit && (
                <>
                  <text x="46" y="88" fontSize="17" fill={ink}>
                    {glyph}
                  </text>
                  <text x="154" y="200" fontSize="17" fill={ink} transform="rotate(180 150 206)">
                    {glyph}
                  </text>
                </>
              )}
            </g>
          ) : (
            pips(rank).map(([x, y], i) => (
              <text key={i} x={x} y={y} textAnchor="middle" dominantBaseline="central" fontSize={rank === "10" ? 28 : 31} fill={ink} transform={y > ROW.mid ? `rotate(180 ${x} ${y})` : undefined}>
                {glyph || "•"}
              </text>
            ))
          )}
        </>
      )}

      {/* a power card wears its mark */}
      {Mark && (
        <g>
          <circle cx="172" cy="30" r="17" fill="var(--gel)" />
          <Mark x={161} y={19} size={22} color="var(--on-gel)" strokeWidth={2.4} />
        </g>
      )}

      {/* the band: the rule's name, the other language small */}
      <rect x="14" y="230" width="172" height="40" rx="8" fill="var(--gel)" />
      {!mini && (
        <>
          <text x="100" y="247" textAnchor="middle" dominantBaseline="central" fontSize={main.length > 12 ? 14 : 17} fontWeight="800" fill="var(--on-gel)" style={lang === "zh" ? ZH : DISPLAY}>
            {main}
          </text>
          <text x="100" y="262" textAnchor="middle" dominantBaseline="central" fontSize="9" fontWeight="700" fill="var(--on-gel)" opacity="0.8" style={lang === "zh" ? TEXT : ZH}>
            {other}
          </text>
        </>
      )}
    </svg>
  );
});

/** The back: a lattice in the game's color around the game's number. */
export const CardBack = memo(function CardBack() {
  return (
    <svg viewBox="0 0 200 280" aria-hidden="true">
      <defs>
        <pattern id="rg-lattice" width="20" height="20" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="20" height="20" fill="var(--gel)" />
          <rect x="2" y="2" width="16" height="16" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.2" />
        </pattern>
      </defs>
      <rect x="2" y="2" width="196" height="276" rx="14" fill="var(--rg-paper)" />
      <rect x="12" y="12" width="176" height="256" rx="8" fill="url(#rg-lattice)" />
      <rect x="18" y="18" width="164" height="244" rx="6" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="1.5" />
      <circle cx="100" cy="140" r="36" fill="var(--rg-paper)" />
      <text x="100" y="141" textAnchor="middle" dominantBaseline="central" fontSize="30" fontWeight="800" fill="var(--rg-ink)" style={DISPLAY}>
        13
      </text>
    </svg>
  );
});

/** How many cards' worth of edge shows under the top of the deck. */
const thickness = (remaining: number) => (remaining >= 30 ? 3 : remaining >= 12 ? 2 : remaining >= 1 ? 1 : 0);

/** The shuffle's spray: this many cards fly out, one every few ms from the bottom up, each its own way. */
const SPRAY_LAYERS = 9;
const SPRAY_STEP_MS = 26;
const sprayOf = (k: number) => {
  const side = k % 2 === 0 ? 1 : -1;
  return { x: side * (26 + Math.random() * 40), y: (Math.random() - 0.5) * 12, r: side * (4 + Math.random() * 7) };
};

/** Where a card goes when it leaves the table: onto the pile of played cards, or down to the tray of held powers. */
export type LeaveTo = "pile" | "tray";

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

/** What the card's flight needs to know: where it goes when it leaves, and where the pull let go of it. */
type Flight = { to: LeaveTo; fromY: number };

/** The card's flight: from where it was pulled to, up and turned over onto the deck, then off to the pile or down to the tray. */
const FLYER: Variants = {
  down: ({ fromY }: Flight) => ({ rotateY: 0, y: fromY, scale: 1, x: 0, rotate: 0, opacity: 1 }),
  up: {
    rotateY: 180,
    y: [null, -38, 0],
    scale: [1, 1.08, 1],
    x: 0,
    rotate: 0,
    opacity: 1,
    transition: { duration: 0.62, times: [0, 0.45, 1], ease: EASE_OUT, rotateY: { duration: 0.5, ease: "easeInOut" } },
  },
  gone: ({ to }: Flight) =>
    to === "tray"
      ? { y: 320, scale: 0.3, opacity: 0, transition: { duration: 0.42, ease: "easeIn" } }
      : { x: 146, y: 80, rotate: 16, scale: 0.33, opacity: 0, transition: { duration: 0.4, ease: "easeIn", opacity: { delay: 0.3, duration: 0.1 } } },
};
/** The same with reduced motion: the face simply appears and goes. */
const FLYER_STILL: Variants = {
  down: { rotateY: 180, opacity: 0 },
  up: { rotateY: 180, opacity: 1, transition: { duration: 0.2 } },
  gone: { opacity: 0, transition: { duration: 0.15 } },
};

/**
 * The table on a phone: the deck with its stack, the card lifted off it and turned over, and the
 * pile beside. `drawn` is how many cards lie on the pile; `shuffling` runs the riffle when the
 * deck has run out and the pile has come back.
 */
export function RogueTable({
  card,
  remaining,
  drawn,
  canDraw,
  onDraw,
  drawLabel,
  shuffling = false,
  leaveTo = "pile",
  onPile,
}: {
  card: Card | null;
  remaining: number;
  drawn: number;
  canDraw: boolean;
  onDraw: () => void;
  drawLabel: string;
  shuffling?: boolean;
  leaveTo?: LeaveTo;
  /** a tap on the pile opens the 牌谱 (a phone); without it the pile is only a picture (the big screen) */
  onPile?: () => void;
}) {
  const { lang } = useStore();
  const custom = usePenaltyText().isCustom;
  const still = useReducedMotion();
  // a whole deck's worth of edge while it riffles, however few are left
  const n = shuffling ? 3 : thickness(remaining);
  const empty = remaining === 0 && !card && !shuffling;
  // the table is set: her voice fetched now, so the first 2 is not a built voice
  useEffect(() => warmHi(), []);
  // the screen stays on while the table is out (a phone passed around, or left on the table, shouldn't dim)
  useWakeLock(true);
  // where the pull let go of the top card: the card up starts its turn from there
  const pull = useRef(0);
  const flight: Flight = { to: leaveTo, fromY: pull.current };
  // the shuffle: the deck's cards spray out to each side and gather back, bottom first (as deck.of.cards does it)
  const spray = useMemo(() => (shuffling ? Array.from({ length: SPRAY_LAYERS }, (_, k) => sprayOf(k)) : []), [shuffling]);
  return (
    <div className="rg-stage">
      <div className="pcard-scene">
        <motion.div
          className={`rg-deck ${shuffling ? "is-shuffling" : ""} ${empty ? "is-empty" : ""}`}
          // the deck arrives when the table is set: dropped in from above (not with reduced motion)
          initial={still ? false : { y: -260, opacity: 0, rotate: -8 }}
          animate={{ y: 0, opacity: 1, rotate: 0, transition: { type: "spring", stiffness: 260, damping: 26, mass: 0.9 } }}
        >
          {shuffling
            ? spray.map((sp, k) => (
                <span key={`s${k}`} className="rg-under" style={{ ["--i" as string]: SPRAY_LAYERS - k, ["--sx" as string]: `${sp.x}px`, ["--sy" as string]: `${sp.y}px`, ["--sr" as string]: `${sp.r}deg`, ["--sd" as string]: `${k * SPRAY_STEP_MS}ms` }} aria-hidden="true" />
              ))
            : Array.from({ length: n }, (_, i) => <span key={i} className="rg-under" style={{ ["--i" as string]: n - i }} aria-hidden="true" />)}
          {/* the top card is pulled down to draw it, off the next card's back; otherwise it is just the deck */}
          {canDraw && remaining > 1 && (
            <div className="rg-back" aria-hidden="true">
              <CardBack />
            </div>
          )}
          {canDraw ? (
            <DeckTop
              label={empty ? (lang === "zh" ? "洗牌" : "Shuffle") : drawLabel}
              lang={lang}
              tapDraws={empty}
              drawn={!!card}
              onPull={(fromY) => {
                pull.current = fromY;
                onDraw();
              }}
            />
          ) : (
            <div className="rg-back" aria-hidden="true" style={shuffling ? { ["--sx" as string]: "-18px", ["--sy" as string]: "-4px", ["--sr" as string]: "-5deg", ["--sd" as string]: `${SPRAY_LAYERS * SPRAY_STEP_MS}ms` } : undefined}>
              <CardBack />
            </div>
          )}
          {empty && <span className="rg-empty" aria-hidden="true" />}
        </motion.div>

        <AnimatePresence custom={flight}>
          {card && (
            <motion.div
              key={`${card.rank}${card.suit}-${drawn}`}
              className="rg-flyer"
              custom={flight}
              variants={still ? FLYER_STILL : FLYER}
              initial="down"
              animate="up"
              exit="gone"
            >
              <div className="rg-side rg-side-back">
                <CardBack />
              </div>
              <div className="rg-side rg-side-front">
                <CardFace rank={card.rank} suit={card.suit} lang={lang} custom={custom} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <Pile drawn={drawn} lang={lang} onTap={onPile} />
    </div>
  );
}

/** How far the top card is pulled down before it is drawn (px), and the flick that counts as the same. */
const PULL_PX = 72;
const FLICK = 650;

/**
 * The top of the deck while a draw is on: pull it down and let go, and it is drawn (Steve, 11-21:
 * 「往下滑抽牌松手后才能看到牌」). While the finger is on it the page stays put (`touch-action:
 * none`); past the mark the pill says to let go. A tap only nudges it to show the way, except on
 * an empty deck (`tapDraws`), where a tap brings the pile back. Enter or space draws for a keyboard.
 */
function DeckTop({ label, lang, tapDraws, drawn, onPull }: { label: string; lang: Lang; tapDraws: boolean; drawn: boolean; onPull: (fromY: number) => void }) {
  const still = useReducedMotion();
  const y = useMotionValue(0);
  const rotate = useTransform(y, [0, 200], [0, 5]);
  const scale = useTransform(y, [0, PULL_PX], [1, 1.04]);
  const [armed, setArmed] = useState(false);
  const pulling = useRef(false);
  const letGo = useRef<number | null>(null);
  // the card came (one phone at once, online a moment later): the pulled top is that card now, so the deck's top goes back under it
  useEffect(() => {
    if (!drawn) return;
    letGo.current = null;
    y.jump(0);
  }, [drawn, y]);
  const back = () => animate(y, 0, { type: "spring", stiffness: 520, damping: 34 });
  const draw = (fromY: number) => {
    letGo.current = fromY;
    onPull(fromY);
    // nothing came of it (not this phone's turn after all): the top goes back
    window.setTimeout(() => {
      if (letGo.current === fromY) {
        letGo.current = null;
        back();
      }
    }, 700);
  };
  const onDragEnd = (_: unknown, info: PanInfo) => {
    pulling.current = false;
    setArmed(false);
    const far = info.offset.y > PULL_PX || (info.offset.y > 28 && info.velocity.y > FLICK);
    if (far) draw(info.offset.y);
    else back();
  };
  const nudge = () => {
    haptic(8);
    if (!still) animate(y, [0, 18, 0], { duration: 0.4, ease: EASE_OUT });
  };
  return (
    <motion.div
      className={`rg-back rg-top ${armed ? "is-armed" : ""}`}
      role="button"
      tabIndex={0}
      drag="y"
      dragDirectionLock
      dragConstraints={{ top: 0, bottom: 260 }}
      dragElastic={{ top: 0, bottom: 0.4 }}
      dragMomentum={false}
      style={{ y, rotate, scale, touchAction: "none" }}
      onDragStart={() => {
        pulling.current = true;
      }}
      onDrag={(_, info) => {
        const now = info.offset.y > PULL_PX;
        if (now !== armed) {
          setArmed(now);
          if (now) haptic(12);
        }
      }}
      onDragEnd={onDragEnd}
      onTap={() => {
        if (pulling.current) return;
        if (tapDraws) draw(0);
        else nudge();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          draw(0);
        }
      }}
    >
      <CardBack />
      <span className="rg-draw">
        {armed ? (lang === "zh" ? "松手" : "Let go") : label}
        {!armed && !tapDraws && <ChevronDown className="rg-draw-arrow" size={16} aria-hidden="true" />}
      </span>
    </motion.div>
  );
}

/** The cards already played, a few backs askew; the newest lands with a little weight, and they all go back when the deck runs out. */
/**
 * The pile of cards played. On a phone it is a button: its tag says 牌谱 and the count, and a tap
 * opens the deck's log (the tag is the button's own words, so the name is what is seen).
 */
const Pile = memo(function Pile({ drawn, lang, onTap }: { drawn: number; lang: Lang; onTap?: () => void }) {
  const still = useReducedMotion();
  const show = Math.min(3, drawn);
  const tilt = [-7, 5, -3];
  const Box = onTap ? motion.button : motion.div;
  return (
    <AnimatePresence>
      {drawn > 0 && (
        <Box
          key="pile"
          className="rg-pile"
          type={onTap ? "button" : undefined}
          aria-hidden={onTap ? undefined : "true"}
          onClick={onTap}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.2 } }}
          exit={still ? { opacity: 0 } : { x: -146, y: -80, scale: 3, opacity: 0, transition: { duration: 0.35, ease: "easeIn" } }}
        >
          {Array.from({ length: show }, (_, i) => {
            const top = i === show - 1;
            return (
              <motion.span
                key={top ? `top-${drawn}` : i}
                className="rg-pile-card"
                aria-hidden="true"
                style={{ rotate: tilt[(drawn - show + i) % 3] }}
                initial={top && !still ? { scale: 1.3, y: -6 } : false}
                animate={{ scale: 1, y: 0, transition: { duration: 0.25, ease: EASE_OUT } }}
              >
                <CardBack />
              </motion.span>
            );
          })}
          <span className="rg-pile-count tabular">{onTap ? `${lang === "zh" ? "牌谱" : "Log"} ${drawn}` : drawn}</span>
        </Box>
      )}
    </AnimatePresence>
  );
});

/**
 * A power out on the table: its card small, who holds it, and what a tap does (when the phone's
 * holder may do it). `used`: this card's one go has gone.
 */
export const HeldCard = memo(function HeldCard({
  rank,
  who,
  mine = false,
  action,
  quiet = false,
  used = false,
  disabled = false,
  onTap,
}: {
  rank: Rank;
  who: ReactNode;
  mine?: boolean;
  /** the words under the holder's name, when a tap does something */
  action?: ReactNode;
  /** a quieter action (the bathroom, which anyone may ask for) */
  quiet?: boolean;
  used?: boolean;
  disabled?: boolean;
  onTap?: () => void;
}) {
  const { lang } = useStore();
  const custom = usePenaltyText().isCustom;
  const power = RULE_BY_RANK[rank].power;
  const Icon = power ? POWER_ICON[power] : null;
  const body = (
    <>
      <span className={`rg-mini ${used ? "is-used" : ""}`}>
        <CardFace rank={rank} lang={lang} custom={custom} mini />
        {used && <span className="rg-used">{lang === "zh" ? "已用" : "used"}</span>}
      </span>
      <span className="rg-held-who">{who}</span>
      {action && (
        <span className="rg-held-do">
          {Icon && <Icon aria-hidden="true" />}
          {action}
        </span>
      )}
    </>
  );
  const cls = `rg-held ${mine ? "is-mine" : ""} ${quiet ? "is-quiet" : ""}`;
  if (onTap)
    return (
      <motion.button type="button" className={cls} disabled={disabled} onClick={onTap} layout initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 420, damping: 24 }}>
        {body}
      </motion.button>
    );
  return (
    <motion.div className={cls} layout initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 420, damping: 24 }}>
      {body}
    </motion.div>
  );
});

/**
 * One card, face up or face down, in a `.pcard-scene`: the big screen's card (TvRogue.tsx). The
 * phones use RogueTable, which also has the stack, the turn and the pile.
 */
export function PlayingCard({ card, onDraw, drawLabel, canDraw = true }: { card: Card | null; onDraw: () => void; drawLabel: string; canDraw?: boolean }) {
  const { lang } = useStore();
  const custom = usePenaltyText().isCustom;
  return (
    <div className="pcard-scene">
      {card ? (
        <div className="rg-face">
          <CardFace rank={card.rank} suit={card.suit} lang={lang} custom={custom} />
        </div>
      ) : (
        <div className="rg-deck">
          <span className="rg-under" style={{ ["--i" as string]: 2 }} aria-hidden="true" />
          <span className="rg-under" style={{ ["--i" as string]: 1 }} aria-hidden="true" />
          {canDraw && drawLabel ? (
            <button type="button" className="rg-back" onClick={onDraw}>
              <CardBack />
              <span className="rg-draw">{drawLabel}</span>
            </button>
          ) : (
            <div className="rg-back" aria-hidden="true">
              <CardBack />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
