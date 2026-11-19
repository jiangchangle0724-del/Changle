import { Camera, Crown, DoorOpen, Feather, Gem, Hand, MessageCircle, Wine, type LucideIcon } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion, type Variants } from "motion/react";
import type { ReactNode } from "react";
import { RULE_BY_RANK, ruleWords, SUIT_GLYPH, SUIT_RED, type Card, type Power, type Rank, type Suit } from "../data/rogue13";
import type { Lang } from "../i18n";
import { usePenaltyText, useStore } from "../store";
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
export function CardFace({ rank, suit, lang, custom, mini = false }: { rank: Rank; suit?: Suit; lang: Lang; custom: boolean; mini?: boolean }) {
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
}

/** The back: a lattice in the game's color around the game's number. */
export function CardBack() {
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
}

/** How many cards' worth of edge shows under the top of the deck. */
const thickness = (remaining: number) => (remaining >= 30 ? 3 : remaining >= 12 ? 2 : remaining >= 1 ? 1 : 0);

/** Where a card goes when it leaves the table: onto the pile of played cards, or down to the tray of held powers. */
export type LeaveTo = "pile" | "tray";

const EASE_OUT = [0.16, 1, 0.3, 1] as const;

/** The card's flight: lifted off the deck and turned over, then off to the pile or down to the tray. */
const FLYER: Variants = {
  down: { rotateY: 0, y: 0, scale: 1, x: 0, rotate: 0, opacity: 1 },
  up: {
    rotateY: 180,
    y: [0, -38, 0],
    scale: [1, 1.08, 1],
    x: 0,
    rotate: 0,
    opacity: 1,
    transition: { duration: 0.62, times: [0, 0.45, 1], ease: EASE_OUT, rotateY: { duration: 0.5, ease: "easeInOut" } },
  },
  gone: (to: LeaveTo) =>
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
}: {
  card: Card | null;
  remaining: number;
  drawn: number;
  canDraw: boolean;
  onDraw: () => void;
  drawLabel: string;
  shuffling?: boolean;
  leaveTo?: LeaveTo;
}) {
  const { lang } = useStore();
  const custom = usePenaltyText().isCustom;
  const still = useReducedMotion();
  // a whole deck's worth of edge while it riffles, however few are left
  const n = shuffling ? 3 : thickness(remaining);
  const empty = remaining === 0 && !card && !shuffling;
  return (
    <div className="rg-stage">
      <div className="pcard-scene">
        <div className={`rg-deck ${shuffling ? "is-shuffling" : ""} ${empty ? "is-empty" : ""}`}>
          {Array.from({ length: n }, (_, i) => (
            <span key={i} className="rg-under" style={{ ["--i" as string]: n - i }} aria-hidden="true" />
          ))}
          {/* a button only when it can be drawn from, named by the word on its pill; otherwise just the deck */}
          {canDraw ? (
            <button type="button" className="rg-back" onClick={onDraw}>
              <CardBack />
              <span className="rg-draw">{drawLabel}</span>
            </button>
          ) : (
            <div className="rg-back" aria-hidden="true">
              <CardBack />
            </div>
          )}
          {empty && <span className="rg-empty" aria-hidden="true" />}
        </div>

        <AnimatePresence custom={leaveTo}>
          {card && (
            <motion.div
              key={`${card.rank}${card.suit}-${drawn}`}
              className="rg-flyer"
              custom={leaveTo}
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

      <Pile drawn={drawn} />
    </div>
  );
}

/** The cards already played, a few backs askew; the newest lands with a little weight, and they all go back when the deck runs out. */
function Pile({ drawn }: { drawn: number }) {
  const still = useReducedMotion();
  const show = Math.min(3, drawn);
  const tilt = [-7, 5, -3];
  return (
    <AnimatePresence>
      {drawn > 0 && (
        <motion.div
          key="pile"
          className="rg-pile"
          aria-hidden="true"
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
                style={{ rotate: tilt[(drawn - show + i) % 3] }}
                initial={top && !still ? { scale: 1.3, y: -6 } : false}
                animate={{ scale: 1, y: 0, transition: { duration: 0.25, ease: EASE_OUT } }}
              >
                <CardBack />
              </motion.span>
            );
          })}
          <span className="rg-pile-count tabular">{drawn}</span>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * A power out on the table: its card small, who holds it, and what a tap does (when the phone's
 * holder may do it). `used`: this card's one go has gone.
 */
export function HeldCard({
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
}

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
