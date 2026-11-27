import { AnimatePresence, motion } from "motion/react";
import { Dices, PenLine, RefreshCw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePenaltyText, useStore } from "../store";
import { Deck, pick } from "../lib/random";
import { haptic, sfx } from "../lib/sfx";
import { useSpinSound } from "../lib/useSpinSound";
import { useTurntable } from "../lib/useTurntable";
import { DARES, promptText, TRUTHS, type Heat, type Prompt } from "../data/truthDare";
import { GameShell, usePenalty } from "./GameShell";
import { Resume, useKeepProgress } from "./Resume";
import { Cloche } from "../components/Cloche";
import { DareTimer } from "../components/DareTimer";
import { durationOf } from "../lib/duration";
import { reduced } from "../lib/motion";
import { UI } from "../i18n";
import { Button, Pill } from "../ui";
import { TruthBottle } from "./TruthBottle";
import { TruthOwn } from "./TruthOwn";
import { fairSeats, freshFirst, markSeen, readOwn, writeOwn, type OwnCard } from "./truthRules";
import "./TruthDare.css";

type Phase = "spin" | "choose" | "card";
type Kind = "truth" | "dare";

/** Less than this and it was a nudge, not a spin: nobody gets picked by a nudge (as online). */
const MIN_TRAVEL = 270;

/**
 * What a game under way keeps on the phone, to pick up after a reload: the heat, the card on the
 * table, the cards still to come, who the bottle has picked, who has used their swap.
 */
type Kept = {
  heat: Heat;
  phase: Phase;
  kind: Kind;
  prompt: Prompt | null;
  chosen: number | null;
  truths: number[];
  dares: number[];
  /** the card on the table is one the table wrote */
  own?: OwnCard | null;
  rand?: boolean;
  picked?: Record<string, number>;
  /** who the bottle picked last: they spin next */
  last?: string | null;
  swapped?: string[];
  /** the table's own cards not yet dealt this game */
  ownLeft?: string[];
};

/** Mild deals only the mild cards, spicy only the spicy ones; cards from earlier games come last. */
const deckOf = (kind: Kind, heat: Heat, kept?: number[]) => {
  const cards = (kind === "truth" ? TRUTHS : DARES).filter((p) => p.heat === heat);
  const deck = new Deck(cards);
  deck.restore(kept?.length ? kept : freshFirst(kind, cards));
  return deck;
};

export function TruthDare({ onBack }: { onBack: () => void }) {
  return (
    <Resume<Kept> game="truth" version={1}>
      {(saved) => <TruthDareGame onBack={onBack} saved={saved} />}
    </Resume>
  );
}

function TruthDareGame({ onBack, saved }: { onBack: () => void; saved: Kept | null }) {
  const { players, ui, tr, lang, sound } = useStore();
  const zh = lang === "zh";
  const [heat, setHeat] = useState<Heat>(saved?.heat ?? 1);
  const [phase, setPhase] = useState<Phase>(saved?.phase ?? "spin");
  const [kind, setKind] = useState<Kind>(saved?.kind ?? "truth");
  const [prompt, setPrompt] = useState<Prompt | null>(saved?.prompt ?? null);
  const [own, setOwn] = useState<OwnCard | null>(saved?.own ?? null);
  const [rand, setRand] = useState(saved?.rand ?? false);
  const [lidOpen, setLidOpen] = useState(false);
  const [chosen, setChosen] = useState<number | null>(saved?.chosen ?? null);
  const [picked, setPicked] = useState<Record<string, number>>(saved?.picked ?? {});
  const [last, setLast] = useState<string | null>(saved?.last ?? null);
  const [swapped, setSwapped] = useState<string[]>(saved?.swapped ?? []);
  const [ownList, setOwnList] = useState<OwnCard[]>(readOwn);
  const [ownLeft, setOwnLeft] = useState<string[]>(() => saved?.ownLeft ?? ownList.map((c) => c.id));
  const [ownOpen, setOwnOpen] = useState(false);
  const [nudged, setNudged] = useState(0);
  /** each card drawn gets a fresh countdown and a fresh lid */
  const [drawn, setDrawn] = useState(0);
  const penalty = usePenalty();
  const custom = usePenaltyText().isCustom;

  const [firstDecks] = useState(() => [deckOf("truth", heat, saved?.truths), deckOf("dare", heat, saved?.dares)] as const);
  const truthDeck = useRef(firstDecks[0]);
  const dareDeck = useRef(firstDecks[1]);
  // a new heat, new decks (the first ones already fit, kept ones included)
  const decksHeat = useRef(heat);
  useEffect(() => {
    if (decksHeat.current === heat) return;
    decksHeat.current = heat;
    truthDeck.current = deckOf("truth", heat);
    dareDeck.current = deckOf("dare", heat);
  }, [heat]);
  // kept from the first spin on (the game has no end: leaving from the tally drops it)
  const [played, setPlayed] = useState(!!saved);
  useKeepProgress<Kept>(
    {
      heat,
      phase,
      kind,
      prompt,
      chosen,
      truths: truthDeck.current.keep(),
      dares: dareDeck.current.keep(),
      own,
      rand,
      picked,
      last,
      swapped,
      ownLeft,
    },
    played,
  );

  useEffect(() => {
    if (!nudged) return;
    const id = window.setTimeout(() => setNudged(0), 1800);
    return () => window.clearTimeout(id);
  }, [nudged]);

  // where the bottle landed: the name and 听天由命 come into sight above the buttons on a short phone
  const chooseBox = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (phase !== "choose") return;
    const id = window.setTimeout(() => chooseBox.current?.scrollIntoView({ block: "nearest", behavior: reduced() ? "auto" : "smooth" }), 300);
    return () => window.clearTimeout(id);
  }, [phase]);

  // once the lid is off, the countdown and the swap come into sight above the buttons (a small phone,
  // a phone on its side)
  const side = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!lidOpen) return;
    const id = window.setTimeout(
      () =>
        side.current?.scrollIntoView({
          block: "nearest",
          behavior: reduced() ? "auto" : "smooth",
        }),
      450,
    );
    return () => window.clearTimeout(id);
  }, [lidOpen, drawn]);

  // a fair bottle: never back to whoever spins, and nobody picked far more often than the rest
  const fair = useMemo(
    () =>
      new Set(
        fairSeats(
          players.map((p) => p.id),
          { spinner: last, picked },
        ),
      ),
    [players, last, picked],
  );
  /** how far this phone's last push sent the bottle (a tap or a nudge doesn't pick anyone) */
  const travel = useRef(0);
  const table = useTurntable({
    count: players.length,
    friction: 1.1,
    disabled: phase !== "spin",
    allow: (i) => fair.has(players[i]?.id ?? ""),
    onPlan: (p) => {
      travel.current = Math.abs(p.delta);
    },
    onTick: () => {
      if (sound) sfx.tick(0.55);
      haptic(5);
    },
    onSettle: (i) => {
      const travelled = travel.current;
      travel.current = 0;
      if (travelled < MIN_TRAVEL) {
        setNudged(Date.now());
        return;
      }
      const id = players[i]?.id;
      setPlayed(true);
      setChosen(i);
      setPhase("choose");
      if (id) {
        setPicked((p) => ({ ...p, [id]: (p[id] ?? 0) + 1 }));
        setLast(id);
      }
      if (sound) {
        sfx.settle();
        window.setTimeout(() => sfx.yourTurn(), 220);
      }
      haptic([12, 40, 18]);
    },
  });
  useSpinSound(table.rotation);

  /** The next card of a kind: the table's own first, then the deck. */
  const deal = (k: Kind) => {
    const mine = ownList.filter((c) => c.k === k && ownLeft.includes(c.id));
    if (mine.length) {
      const card = pick(mine);
      setOwnLeft((left) => left.filter((id) => id !== card.id));
      setOwn(card);
      setPrompt(null);
    } else {
      const card = (k === "truth" ? truthDeck : dareDeck).current.draw().card;
      markSeen(k, card);
      setOwn(null);
      setPrompt(card);
    }
    setKind(k);
    setDrawn((n) => n + 1);
    setLidOpen(false);
    setPhase("card");
  };

  const choose = (choice: Kind | "random") => {
    setRand(choice === "random");
    deal(choice === "random" ? (Math.random() < 0.5 ? "truth" : "dare") : choice);
  };

  const nextRound = () => {
    setPhase("spin");
    setPrompt(null);
    setOwn(null);
    setRand(false);
    setChosen(null);
  };

  const addOwn = (k: Kind, text: string) => {
    if (ownList.some((c) => c.k === k && c.text === text)) return;
    const card: OwnCard = {
      id: Math.random().toString(36).slice(2, 9),
      k,
      text,
    };
    const next = [...ownList, card];
    setOwnList(next);
    writeOwn(next);
    setOwnLeft((left) => [...left, card.id]);
  };
  const removeOwn = (id: string) => {
    const next = ownList.filter((c) => c.id !== id);
    setOwnList(next);
    writeOwn(next);
    setOwnLeft((left) => left.filter((x) => x !== id));
  };

  const who = chosen !== null ? players[chosen] : null;
  const canSwap = !!who && !swapped.includes(who.id);
  const card = own ? { zh: own.text, en: own.text } : prompt ? promptText(prompt, custom) : null;
  // a dare that names a time ("对视 20 秒") gets a countdown once the lid is off
  const seconds = card ? durationOf(card) : null;
  const kindName = (k: Kind) => (k === "truth" ? (zh ? "真心话" : "Truth") : zh ? "大冒险" : "Dare");

  // each moment's buttons, at the bottom by the thumb (the main one on the right)
  const actions =
    phase === "spin" ? (
      <button type="button" className="btn btn-primary btn-lg" onClick={() => table.flick()} disabled={table.spinning || players.length < 2}>
        {table.spinning ? ui("spinning") : zh ? "转瓶子" : "Spin the bottle"}
      </button>
    ) : phase === "choose" && who ? (
      <>
        <button type="button" className="btn btn-porcelain btn-lg" onClick={() => choose("truth")}>
          {kindName("truth")}
        </button>
        <button type="button" className="btn btn-gold btn-lg" onClick={() => choose("dare")}>
          {kindName("dare")}
        </button>
      </>
    ) : phase === "card" && lidOpen && who ? (
      <>
        <button type="button" className="btn btn-penalty btn-lg" onClick={() => penalty.show({ who: [who.name], kind: "sip" }, nextRound)}>
          {ui("pass")}
        </button>
        <button type="button" className="btn btn-jade btn-lg" onClick={nextRound}>
          {kind === "truth" ? (zh ? "答完了" : "Answered") : zh ? "做完了" : "Done it"}
        </button>
      </>
    ) : undefined;

  const rules = (
    <p>
      {zh
        ? "把手机放桌子中间，拨一下瓶子。瓶口指到谁，谁选真心话或大冒险，也可以听天由命，让手机替你选。揭开盖子念出来，不做就认罚。每人每局可以换一次题。瓶子不会连着两次指同一个人，也不会老指着那几个人。可以自己出题，自己出的先抽。"
        : "Put the phone in the middle of the table and flick the bottle. Whoever it points at picks truth or dare, or leaves it to chance, then lifts the lid and reads it out. Refuse and take the penalty. Everyone can swap one card a game. The bottle never picks the same person twice in a row, and won't keep picking the same few. Cards you write yourselves come up first."}
    </p>
  );

  return (
    <GameShell
      title={UI.gameTruth}
      rules={rules}
      onBack={onBack}
      penalty={penalty.call}
      onPenaltyDone={penalty.done}
      roster={{ turn: phase !== "spin" ? who?.id : undefined }}
      actions={actions}
    >
      <AnimatePresence mode="wait">
        {phase !== "card" && (
          <motion.div key="bottle" className="bottle-stage" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, scale: 0.96 }}>
            <div className="segmented-row truth-top">
              <span className="heat-group">
                <span className="hint">{ui("heat")}</span>
                <span className="lang-tab heat-tab" role="group" aria-label={ui("heat")}>
                  <button aria-pressed={heat === 1} onClick={() => setHeat(1)}>
                    {ui("mild")}
                  </button>
                  <button aria-pressed={heat === 2} onClick={() => setHeat(2)} className="heat-spicy">
                    {ui("spicy")}
                  </button>
                </span>
              </span>
              <button
                type="button"
                className="btn btn-quiet btn-sm own-open"
                onClick={() => setOwnOpen(true)}
                aria-label={(zh ? "自己出题" : "Your cards") + (ownList.length > 0 ? ` (${ownList.length})` : "")}
              >
                <PenLine aria-hidden="true" />
                <span className="own-open-label">{zh ? "自己出题" : "Your cards"}</span>
                {ownList.length > 0 && <span className="own-badge">{ownList.length}</span>}
              </button>
            </div>
            <TruthBottle
              seats={players}
              count={players.length}
              rotation={table.rotation}
              lit={(id) => phase === "choose" && who?.id === id}
              grab={phase === "spin"}
              handlers={table.handlers}
            />

            <div className="bottle-actions">
              {phase === "spin" && (
                <p className="hint" aria-live="polite">
                  {nudged ? (zh ? "再用力一点" : "Harder than that") : zh ? "也可以直接用手拨" : "Or flick it with a finger"}
                </p>
              )}
              {phase === "choose" && who && (
                <motion.div ref={chooseBox} className="choose-box" initial={{ y: 12, opacity: 0 }} animate={{ y: 0, opacity: 1 }}>
                  <p className="choose-who">
                    <span className="turn-name">{who.name}</span>
                  </p>
                  <Button tone="quiet" size="sm" icon={Dices} onClick={() => choose("random")}>
                    {zh ? "听天由命" : "Surprise me"}
                  </Button>
                </motion.div>
              )}
            </div>
          </motion.div>
        )}

        {phase === "card" && card && who && (
          <motion.div key={`card-${drawn}`} className="card-flow truth-flow" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <p className="turn-line">
              <span className="turn-name">{who.name}</span>
              <span className={`kind-tag ${kind}`}>{kindName(kind)}</span>
              {rand && (
                <Pill icon={Dices} tone="neutral">
                  {zh ? "听天由命" : "Left to chance"}
                </Pill>
              )}
              {own && <Pill tone="warning">{zh ? "你们出的" : "Your own"}</Pill>}
            </p>
            <Cloche open={lidOpen} onOpen={() => setLidOpen(true)}>
              <div className="prompt-card">
                <p className="prompt-text">{own ? own.text : tr(card)}</p>
              </div>
            </Cloche>
            <div className="truth-side" ref={side}>
              <AnimatePresence>
                {lidOpen && seconds !== null && (
                  <motion.div key="timer" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
                    <DareTimer seconds={seconds} lang={lang} resetKey={drawn} />
                  </motion.div>
                )}
                {lidOpen && canSwap && (
                  <motion.div key="swap" className="swap-row" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>
                    <Button
                      tone="quiet"
                      size="sm"
                      icon={RefreshCw}
                      onClick={() => {
                        setSwapped((s) => [...s, who.id]);
                        deal(kind);
                      }}
                    >
                      {zh ? "换一张（每局一次）" : "Swap it (once a game)"}
                    </Button>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <TruthOwn open={ownOpen} onClose={() => setOwnOpen(false)} lang={lang} list={ownList} onAdd={addOwn} onRemove={removeOwn} />
    </GameShell>
  );
}
