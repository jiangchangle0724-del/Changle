import { Camera, DoorOpen, Hand, MessageCircle } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useMemo, useRef, useState } from "react";
import { usePenaltyText, useStore, type Player } from "../store";
import { Deck } from "../lib/random";
import { haptic, sfx } from "../lib/sfx";
import { fullDeck, ROGUE_MS, ROGUE_NOTES, RULES, RULE_BY_RANK, ruleWords, SUIT_GLYPH, SUIT_RED, type Card, type Power, type Rank } from "../data/rogue13";
import { GameShell, usePenalty, useTurnOrder } from "./GameShell";
import { Resume, useKeepProgress } from "./Resume";
import { playPower } from "./rogueSounds";
import { PlayerPicker } from "../components/PlayerPicker";
import { TimerArc } from "../components/TimerArc";
import type { PenaltyCall } from "../components/PenaltyStamp";
import { UI } from "../i18n";
import { useBackCloses } from "../router";

type Phase = "idle" | "revealed" | "pick" | "group-loser";

/** How long the bottom button ignores taps after it changed what it does (a quick double tap is ~120–250ms apart). */
const SETTLE_MS = 450;

/**
 * A power being used on the one phone: the camera's freeze and then its judgement, the nose's
 * judgement, the bathroom question (and the pass being used), the troublemaker's question.
 */
type Using =
  | { power: "camera"; step: "freeze" | "judge" }
  | { power: "nose" }
  | { power: "wc"; went?: Player }
  | { power: "trouble" };

type Kept = {
  cards: number[];
  card: Card | null;
  phase: Phase;
  holders: Partial<Record<Rank, Player>>;
  /** the bathroom pass has been used once this deck (older saves: not yet) */
  wcUsed?: boolean;
  /** the camera and the nose go once per card: which ones their current holder has used (older saves: not yet) */
  used?: { camera?: boolean; nose?: boolean };
  reshuffled: boolean;
  turn: number;
};

export function Rogue13({ onBack }: { onBack: () => void }) {
  return (
    <Resume<Kept> game="rogue" version={1}>
      {(saved) => <RogueGame onBack={onBack} saved={saved} />}
    </Resume>
  );
}

function RogueGame({ onBack, saved }: { onBack: () => void; saved: Kept | null }) {
  const { players, ui, tr, lang, sound } = useStore();
  const zh = lang === "zh";
  const [firstDeck] = useState(() => {
    const deck = new Deck<Card>(fullDeck());
    if (saved) deck.restore(saved.cards);
    return deck;
  });
  const deck = useRef(firstDeck);
  const [card, setCard] = useState<Card | null>(saved?.card ?? null);
  const [phase, setPhase] = useState<Phase>(saved?.phase ?? "idle");
  const [holders, setHolders] = useState<Partial<Record<Rank, Player>>>(saved?.holders ?? {});
  const [wcUsed, setWcUsed] = useState(saved?.wcUsed ?? false);
  const [used, setUsed] = useState<{ camera?: boolean; nose?: boolean }>(saved?.used ?? {});
  const [remaining, setRemaining] = useState(deck.current.remaining);
  const [reshuffled, setReshuffled] = useState(saved?.reshuffled ?? false);
  const turn = useTurnOrder(saved?.turn ?? 0);
  const penalty = usePenalty();
  // the stamp on screen ends the turn (a card's penalty), or not (a power's: the card stays)
  const [turnStamp, setTurnStamp] = useState(false);
  const custom = usePenaltyText().isCustom;
  const [played, setPlayed] = useState(!!saved);
  // A stamp that ends the turn has already counted: pick up at the next draw without paying twice.
  const ending = !!penalty.call && turnStamp;
  useKeepProgress<Kept>({
    cards: deck.current.keep(),
    card: ending ? null : card,
    phase: ending ? "idle" : phase,
    holders,
    wcUsed,
    used,
    reshuffled,
    turn: ending ? (turn.index + 1) % Math.max(1, players.length) : turn.index,
  }, played);

  const rule = card ? RULE_BY_RANK[card.rank] : null;
  // the card's words: drinking, or the penalty set in settings
  const words = rule ? ruleWords(rule, custom) : null;

  // The bottom button changes what it does as the screen moves on (抽牌 → 记住了 → 抽牌) without
  // moving from under the thumb, so the second half of a quick double tap lands on the new button.
  // A tap in the first moments after the change is that same tap, not the next step.
  const changedAt = useRef(0);
  const moveOn = () => {
    changedAt.current = performance.now();
  };
  const tooSoon = () => performance.now() - changedAt.current < SETTLE_MS;

  const draw = () => {
    // one card at a time: a double tap on the deck lands on the card still turning over
    if (card || tooSoon()) return;
    moveOn();
    setPlayed(true);
    const { card: c, reshuffled: r } = deck.current.draw();
    setReshuffled(r);
    if (r) {
      setHolders({});
      setWcUsed(false);
      setUsed({});
    }
    setRemaining(deck.current.remaining);
    setCard(c);
    setPhase("revealed");
    if (sound) {
      if (r) sfx.shuffle();
      window.setTimeout(() => sfx.cardSlide(), r ? 520 : 0);
      window.setTimeout(() => sfx.flip(), r ? 700 : 180);
      // a power's card: its own sound once the card has turned over
      const power = RULE_BY_RANK[c.rank].power;
      if (power) window.setTimeout(() => playPower(power), r ? 1050 : 520);
    }
    haptic(10);
  };

  const endTurn = () => {
    moveOn();
    setCard(null);
    setPhase("idle");
    turn.next();
  };

  /** The powers out on the table: the card's rank, its holder, the power. */
  const held = useMemo(
    () =>
      (Object.entries(holders) as [Rank, Player][])
        .filter(([, p]) => p)
        .map(([rank, p]) => [rank, p, RULE_BY_RANK[rank].power!] as [Rank, Player, Power]),
    [holders],
  );

  /** The holder of a power, if the card is out. */
  const holderOf = (power: Power) => held.find(([, , p]) => p === power)?.[1];
  const buddy = holderOf("buddy");

  /**
   * The stamp. With a drinking buddy at the table it carries the call: whoever is penalized can
   * shout for the buddy, who drinks too (on one phone that is said out loud, not tapped).
   */
  const punish = (call: PenaltyCall, endsTurn: boolean) => {
    const withBuddy = buddy && call.kind !== "safe" && !call.who.includes(buddy.name);
    const line = !withBuddy
      ? undefined
      : custom
        ? zh
          ? `喊一声“陪罚”，${buddy.name} 陪着受罚`
          : `Shout “buddy!” and ${buddy.name} takes it too`
        : zh
          ? `喊一声“陪酒”，${buddy.name} 陪着喝`
          : `Shout “buddy!” and ${buddy.name} drinks too`;
    setTurnStamp(endsTurn);
    penalty.show(line ? { ...call, note: call.note ? `${call.note} · ${line}` : line } : call, endsTurn ? endTurn : undefined);
    // the buddy's toast, once the stamp has landed
    if (line && sound) window.setTimeout(() => playPower("buddy", 0.9), 1400);
  };

  const resolve = () => {
    if (!rule || !card || !words || tooSoon()) return;
    moveOn();
    const me = turn.current;
    switch (rule.kind) {
      case "pick":
        setPhase("pick");
        return;
      case "self-sip":
        punish({ who: [me.name], kind: "sip", note: tr(words.title) }, true);
        return;
      case "self-full":
        punish({ who: [me.name], kind: "full", note: tr(words.title) }, true);
        return;
      case "left":
        punish({ who: [turn.left.name], kind: "sip", note: tr(words.title) }, true);
        return;
      case "right":
        punish({ who: [turn.right.name], kind: "sip", note: tr(words.title) }, true);
        return;
      case "group":
        setPhase("group-loser");
        return;
      case "hold":
        setHolders((h) => ({ ...h, [card.rank]: me }));
        // a new pass is good for one more visit; a new camera or nose for one more call
        if (rule.power === "wc") setWcUsed(false);
        if (rule.power === "camera" || rule.power === "nose") setUsed((u) => ({ ...u, [rule.power!]: undefined }));
        endTurn();
        return;
    }
  };

  /* ---------------- the powers, used from the one phone ---------------- */

  const [using, setUsing] = useState<Using | null>(null);
  const [flash, setFlash] = useState(0);
  // the phone's back button puts a power's screen away, like a sheet
  useBackCloses(!!using, () => setUsing(null));

  const camera = holderOf("camera");
  const nose = holderOf("nose");
  const wcHolder = holderOf("wc");
  const trouble = holderOf("trouble");
  // the power on screen, by its card (none if its card has gone back into the deck)
  const usingCard = using ? held.find(([, , p]) => p === using.power) : undefined;

  // the pass is good for one visit, the camera and the nose for one call each, until the next card of theirs
  const spent = (p: Power) => (p === "wc" ? wcUsed : p === "camera" || p === "nose" ? !!used[p] : false);
  const usedWord = zh ? "已用" : "used";

  const useCamera = () => {
    if (!camera || using || used.camera) return;
    setUsed((u) => ({ ...u, camera: true }));
    setUsing({ power: "camera", step: "freeze" });
    setFlash(Date.now());
    if (sound) playPower("camera");
    haptic(30);
  };
  const useNose = () => {
    if (!nose || using || used.nose) return;
    setUsed((u) => ({ ...u, nose: true }));
    setUsing({ power: "nose" });
    if (sound) playPower("nose");
    haptic([20, 40, 20]);
  };
  const askWc = () => {
    if (!wcHolder || using) return;
    setUsing({ power: "wc" });
  };
  const askTrouble = () => {
    if (!trouble || using) return;
    setUsing({ power: "trouble" });
  };
  /** Someone picked on a power's screen: the screen goes, the stamp lands. */
  const powerPenalty = (p: Player, note: { zh: string; en: string }) => {
    setUsing(null);
    punish({ who: [p.name], kind: "sip", note: tr(note) }, false);
  };
  const wentToWc = (p: Player) => {
    if (wcHolder && p.id === wcHolder.id && !wcUsed) {
      setWcUsed(true);
      setUsing({ power: "wc", went: p });
      if (sound) playPower("wc");
      return;
    }
    powerPenalty(p, custom ? ROGUE_NOTES.wcCustom : ROGUE_NOTES.wc);
  };

  const actions =
    phase === "idle" ? (
      <button type="button" className="btn btn-primary btn-lg" onClick={draw}>
        {zh ? "抽牌" : "Draw"}
      </button>
    ) : phase === "revealed" && card && rule && words ? (
      <button type="button" className={`btn btn-lg ${rule.kind === "hold" ? "btn-primary" : "btn-penalty"}`} onClick={resolve}>
        {rule.kind === "pick"
          ? ui("pickOne")
          : rule.kind === "group"
            ? zh
              ? "玩完了，谁输了"
              : "Played it. Who lost?"
            : rule.kind === "hold"
              ? zh
                ? "记住了"
                : "Got it"
              : rule.kind === "self-sip" || rule.kind === "self-full"
                ? custom
                  ? ui("iTakeIt")
                  : zh
                    ? "我喝"
                    : "I drink"
                : rule.kind === "left" || rule.kind === "right"
                  ? zh
                    ? "罚"
                    : "Penalty"
                  : custom
                    ? ui("whoPenalty")
                    : ui("whoDrinks")}
      </button>
    ) : phase === "group-loser" ? (
      <button type="button" className="btn btn-lg btn-ghost" style={{ color: "var(--haze)" }} onClick={endTurn}>
        {zh ? "没人输，下一位" : "No one lost. Next."}
      </button>
    ) : undefined;

  const rules = (
    <ul className="rule-list">
      {RULES.map((r) => (
        <li key={r.rank}>
          <span className="rule-rank en-display">{r.rank}</span>
          <span>
            <strong>{tr(ruleWords(r, custom).title)}</strong>
            <br />
            {tr(ruleWords(r, custom).rule)}
            {howOnOnePhone(r) && (
              <>
                <br />
                <span style={{ color: "var(--lamp)" }}>{tr(howOnOnePhone(r)!)}</span>
              </>
            )}
          </span>
        </li>
      ))}
    </ul>
  );

  return (
    <GameShell title={UI.gameRogue} rules={rules} onBack={onBack} penalty={penalty.call} onPenaltyDone={penalty.done} roster={{ turn: turn.current?.id }} actions={actions}>
      <div className="turn-line">
        <span className="hint">{ui("yourTurn")}</span>
        <span className="turn-name">{turn.current?.name}</span>
        <span className="hint tabular">{ui("remaining", { n: remaining })}</span>
      </div>

      <div className="card-stage">
        <PlayingCard card={card} onDraw={draw} canDraw={!card} drawLabel={zh ? "抽牌" : "Draw"} />
      </div>

      <AnimatePresence mode="wait">
        {card && rule && words && phase === "revealed" && (
          <motion.div
            key={card.rank + card.suit}
            className="porcelain rule-card"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ delay: 0.35, duration: 0.3 }}
          >
            <h2 className={`rule-title ${zh ? "zh-display" : "en-display"}`}>{tr(words.title)}</h2>
            <p className="rule-body">{tr(words.rule)}</p>
            {howOnOnePhone(rule) && <p className="hint-ink rule-online">{tr(howOnOnePhone(rule)!)}</p>}
            {reshuffled && <p className="hint-ink">{ui("deckReshuffled")}</p>}
          </motion.div>
        )}

        {card && rule && words && (phase === "pick" || phase === "group-loser") && (
          <motion.div key="pick" className="porcelain rule-card" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <p className="hint-ink" style={{ marginBottom: 10 }}>
              {phase === "pick" ? ui("chooseTarget") : zh ? "点一下输的人。没人输就跳过。" : "Tap whoever lost. Nobody? Skip."}
            </p>
            <PlayerPicker players={players} tone="lacquer" onPick={(p) => punish({ who: [p.name], kind: "sip", note: tr(words.title) }, true)} />
          </motion.div>
        )}
      </AnimatePresence>

      {held.length > 0 && (
        <div className="stack" style={{ gap: 10 }}>
          <div className="held">
            {held.map(([rank, p, power]) => (
              <span key={rank} className="chip">
                <span className="en-display held-rank">{rank}</span>
                {tr(ruleWords(RULE_BY_RANK[rank], custom).badge!)} · {p.name}
                {spent(power) && <span className="hint" style={{ fontSize: 12 }}>{usedWord}</span>}
              </span>
            ))}
          </div>
          {/* the powers in play, for whoever holds the phone: the holder calls it, the table taps it */}
          {(camera || nose || wcHolder || trouble) && (
            <div className="power-dock">
              {camera && (
                <button type="button" className="power-btn" disabled={!!used.camera} onClick={useCamera}>
                  <Camera size={18} />
                  {zh ? "照相机" : "Camera"}
                  {used.camera && <span className="power-used">{usedWord}</span>}
                </button>
              )}
              {nose && (
                <button type="button" className="power-btn" disabled={!!used.nose} onClick={useNose}>
                  <Hand size={18} />
                  {zh ? "摸鼻子" : "Nose"}
                  {used.nose && <span className="power-used">{usedWord}</span>}
                </button>
              )}
              {trouble && (
                <button type="button" className="power-btn" onClick={askTrouble}>
                  <MessageCircle size={18} />
                  {zh ? "谁接话了" : "Who answered?"}
                </button>
              )}
              {wcHolder && (
                <button type="button" className="power-btn power-quiet" onClick={askWc}>
                  <DoorOpen size={18} />
                  {zh ? "上厕所" : "Bathroom"}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      <AnimatePresence>
        {flash > 0 && (
          <motion.div key={flash} className="camera-flash" initial={{ opacity: 0.95 }} animate={{ opacity: 0 }} transition={{ duration: 0.7, ease: "easeOut" }} onAnimationComplete={() => setFlash(0)} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {using && usingCard && (
          <motion.div
            key={using.power + ("step" in using ? using.step : "")}
            className="interrupt-layer"
            role="dialog"
            aria-modal="true"
            aria-label={tr(RULE_BY_RANK[usingCard[0]].title)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {using.power === "camera" && camera ? (
              using.step === "freeze" ? (
                <div className="interrupt-stage">
                  <Camera size={44} />
                  <p className={`interrupt-big ${zh ? "zh-display" : "en-display"}`}>{zh ? "定格" : "Freeze"}</p>
                  <p className="interrupt-sub">{zh ? `${camera.name} 拍照了，别动` : `${camera.name} took a photo. Don't move.`}</p>
                  <TimerArc seconds={ROGUE_MS.freeze / 1000} running size={72} ticking={false} onEnd={() => setUsing((u) => (u?.power === "camera" ? { power: "camera", step: "judge" } : u))} />
                </div>
              ) : (
                <div className="interrupt-stage">
                  <Camera size={36} />
                  <p className="interrupt-sub">{zh ? `${camera.name} 看照片：谁动了？` : `${camera.name} checks the photo: who moved?`}</p>
                  <PlayerPicker players={players} exclude={[camera.id]} onPick={(p) => powerPenalty(p, ROGUE_NOTES.camera)} />
                  <button type="button" className="btn btn-ghost" onClick={() => setUsing(null)}>
                    {zh ? "没人动" : "Nobody moved"}
                  </button>
                </div>
              )
            ) : using.power === "nose" && nose ? (
              <div className="interrupt-stage">
                <Hand size={44} />
                <p className={`interrupt-big ${zh ? "zh-display" : "en-display"}`}>{zh ? "摸鼻子" : "Nose"}</p>
                <p className="interrupt-sub">{zh ? `${nose.name} 喊摸鼻子。最后一个摸到的是谁？` : `${nose.name} says: nose! Who was last?`}</p>
                <PlayerPicker players={players} exclude={[nose.id]} onPick={(p) => powerPenalty(p, ROGUE_NOTES.noseSlow)} />
                <button type="button" className="btn btn-ghost" onClick={() => setUsing(null)}>
                  {zh ? "都挺快，算了" : "All quick enough"}
                </button>
              </div>
            ) : using.power === "wc" && wcHolder ? (
              using.went ? (
                <div className="interrupt-stage">
                  <DoorOpen size={44} />
                  <p className="interrupt-sub">{zh ? `${using.went.name} 用掉了 WC 票，去吧` : `${using.went.name} used the pass. Go ahead.`}</p>
                  <p className="hint">{zh ? "票用过一次就作废，下一张 8 再发一张。" : "The pass is good once. The next 8 deals a new one."}</p>
                  <button type="button" className="btn btn-primary btn-lg" onClick={() => setUsing(null)}>
                    {zh ? "好" : "OK"}
                  </button>
                </div>
              ) : (
                <div className="interrupt-stage">
                  <DoorOpen size={44} />
                  <p className="interrupt-sub">{zh ? "谁要去厕所？" : "Who needs the bathroom?"}</p>
                  <p className="hint">
                    {wcUsed
                      ? zh
                        ? `${wcHolder.name} 的 WC 票用过了，谁去都${custom ? "先受罚" : "先喝一口"}`
                        : `${wcHolder.name}'s pass is used up. Anyone who goes ${custom ? "takes the penalty" : "drinks"} first.`
                      : zh
                        ? `WC 票在 ${wcHolder.name} 手上，其他人${custom ? "先受罚" : "先喝一口"}再去`
                        : `${wcHolder.name} holds the pass. Anyone else ${custom ? "takes the penalty" : "drinks"} first.`}
                  </p>
                  <PlayerPicker players={players} onPick={wentToWc} />
                  <button type="button" className="btn btn-ghost" onClick={() => setUsing(null)}>
                    {zh ? "不去了" : "Never mind"}
                  </button>
                </div>
              )
            ) : using.power === "trouble" && trouble ? (
              <div className="interrupt-stage">
                <MessageCircle size={44} />
                <p className="interrupt-sub">{zh ? `谁接了 ${trouble.name} 的话？` : `Who answered ${trouble.name}?`}</p>
                <PlayerPicker
                  players={players}
                  exclude={[trouble.id]}
                  onPick={(p) => {
                    if (sound) playPower("trouble");
                    powerPenalty(p, ROGUE_NOTES.trouble);
                  }}
                />
                <button type="button" className="btn btn-ghost" onClick={() => setUsing(null)}>
                  {zh ? "没人接" : "Nobody did"}
                </button>
              </div>
            ) : null}
          </motion.div>
        )}
      </AnimatePresence>
    </GameShell>
  );
}

const howOnOnePhone = (r: { power?: Power }) => (r.power ? ONE_PHONE_HOW[r.power] : undefined);

/** How each power is used when the table shares one phone (under the card, and in the rules). */
const ONE_PHONE_HOW: Partial<Record<Power, { zh: string; en: string }>> = {
  buddy: { zh: "以后谁被罚，罚单上会提醒喊陪酒。", en: "From now on every penalty reminds the table to call the buddy." },
  camera: { zh: "下面多了一个照相机按钮，只能按一次。你喊照相机，谁拿着手机谁按，定格几秒后点出动了的人。", en: "A camera button sits below, good for one press. Shout it, whoever holds the phone taps it, and after the freeze tap whoever moved." },
  nose: { zh: "下面多了一个摸鼻子按钮，只能按一次。你喊摸鼻子，按一下，点出最后一个摸到的。", en: "A nose button sits below, good for one press. Shout it, tap it, then tap whoever touched theirs last." },
  wc: { zh: "下面多了一个上厕所按钮。谁要去，按一下点自己。", en: "A bathroom button sits below. Whoever needs to go taps it and picks their name." },
  trouble: { zh: "下面多了一个谁接话了按钮。谁接了你的话，按一下点他。", en: "A “who answered?” button sits below. Tap it and pick whoever answered you." },
};

/** A playing card: face down shows a lattice in the game color, tap to flip. */
export function PlayingCard({ card, onDraw, drawLabel, canDraw = true }: { card: Card | null; onDraw: () => void; drawLabel: string; canDraw?: boolean }) {
  const flipped = !!card;
  return (
    <div className="pcard-scene">
      <motion.div
        className="pcard"
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ type: "spring", stiffness: 260, damping: 24 }}
        style={{ transformStyle: "preserve-3d" }}
      >
        <button type="button" className="pcard-face pcard-back" onClick={onDraw} aria-label={canDraw ? undefined : drawLabel} disabled={!canDraw} style={canDraw ? undefined : { cursor: "default" }}>
          <svg viewBox="0 0 200 280" aria-hidden="true">
            <defs>
              <pattern id="lattice" width="20" height="20" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <rect width="20" height="20" fill="var(--gel)" />
                <rect x="2" y="2" width="16" height="16" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="1.2" />
              </pattern>
            </defs>
            <rect x="4" y="4" width="192" height="272" rx="14" fill="#ffffff" />
            <rect x="14" y="14" width="172" height="252" rx="8" fill="url(#lattice)" />
            <rect x="20" y="20" width="160" height="240" rx="6" fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth="1.5" />
            <circle cx="100" cy="140" r="36" fill="#ffffff" />
            <text x="100" y="141" textAnchor="middle" dominantBaseline="central" fontSize="30" fontWeight="800" fill="#0e0c22" style={{ fontFamily: "var(--font-display)" }}>
              13
            </text>
          </svg>
          {canDraw && <span className="pcard-draw">{drawLabel}</span>}
        </button>
        <div className="pcard-face pcard-front" aria-hidden={!flipped}>
          {card && (
            <svg viewBox="0 0 200 280" aria-hidden="true">
              <rect x="4" y="4" width="192" height="272" rx="14" fill="#ffffff" />
              <rect x="12" y="12" width="176" height="256" rx="9" fill="none" stroke="rgba(14,12,34,0.1)" strokeWidth="1.2" />
              <text x="26" y="44" fontSize="30" fontWeight="800" fill={SUIT_RED[card.suit] ? "#e8364f" : "#0e0c22"} style={{ fontFamily: "var(--font-display)" }}>
                {card.rank}
              </text>
              <text x="26" y="72" fontSize="26" fill={SUIT_RED[card.suit] ? "#e8364f" : "#0e0c22"}>
                {SUIT_GLYPH[card.suit]}
              </text>
              <text x="100" y="148" textAnchor="middle" dominantBaseline="central" fontSize="92" fill={SUIT_RED[card.suit] ? "#e8364f" : "#0e0c22"}>
                {SUIT_GLYPH[card.suit]}
              </text>
              <g transform="rotate(180 100 140)">
                <text x="26" y="44" fontSize="30" fontWeight="800" fill={SUIT_RED[card.suit] ? "#e8364f" : "#0e0c22"} style={{ fontFamily: "var(--font-display)" }}>
                  {card.rank}
                </text>
                <text x="26" y="72" fontSize="26" fill={SUIT_RED[card.suit] ? "#e8364f" : "#0e0c22"}>
                  {SUIT_GLYPH[card.suit]}
                </text>
              </g>
            </svg>
          )}
        </div>
      </motion.div>
    </div>
  );
}
