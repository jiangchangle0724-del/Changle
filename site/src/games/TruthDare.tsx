import { AnimatePresence, motion } from "motion/react";
import { Dices, Ear, PenLine, RefreshCw, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePenaltyText, useStore } from "../store";
import { pick } from "../lib/random";
import { haptic, sfx } from "../lib/sfx";
import { useSpinSound } from "../lib/useSpinSound";
import { useTurntable } from "../lib/useTurntable";
import { DARES, limitsOf, promptText, SECRETS, TRUTHS, type Heat, type Limit, type Prompt } from "../data/truthDare";
import { TRUTH_FLIP_MS, type TruthTally } from "../shared/protocol";
import { GameShell, usePenalty } from "./GameShell";
import { Resume, useKeepProgress } from "./Resume";
import { Cloche } from "../components/Cloche";
import { DareTimer } from "../components/DareTimer";
import { durationOf } from "../lib/duration";
import { reduced } from "../lib/motion";
import { UI } from "../i18n";
import { Button, Pill } from "../ui";
import { TruthBottle } from "./TruthBottle";
import { TruthLimits, readLimits, writeLimits } from "./TruthLimits";
import { TruthOwn } from "./TruthOwn";
import { TruthRecap } from "./TruthRecap";
import { WhisperCoin, WhisperNames } from "./TruthWhisper";
import { fairSeats, freshFirst, markSeen, readOwn, writeOwn, type OwnCard } from "./truthRules";
import "./TruthDare.css";

type Phase = "spin" | "choose" | "card";
/** secret: 悄悄话, a question only the one picked reads, answered out loud with a name */
type Kind = "truth" | "dare" | "secret";

/** Less than this and it was a nudge, not a spin: nobody gets picked by a nudge (as online). */
const MIN_TRAVEL = 270;
const LISTS: Record<Kind, Prompt[]> = { truth: TRUTHS, dare: DARES, secret: SECRETS };

/**
 * What a game under way keeps on the phone, to pick up after a reload: the heat, the card on the
 * table, the cards still to come, who the bottle has picked, who has used their swap, the whisper
 * in play and this game's tally.
 */
type Kept = {
  heat: Heat;
  phase: Phase;
  kind: Kind;
  prompt: Prompt | null;
  chosen: number | null;
  /** before piles (a game kept by an older version): the truths and dares to come, as places among the cards of its heat */
  truths?: number[];
  dares?: number[];
  /** the card on the table is one the table wrote */
  own?: OwnCard | null;
  rand?: boolean;
  picked?: Record<string, number>;
  /** who the bottle picked last: they spin next */
  last?: string | null;
  swapped?: string[];
  /** the table's own cards not yet dealt this game */
  ownLeft?: string[];
  /** cards still to come by kind and heat ("truth1"…), as places in their kind's list, dealt from the end */
  piles?: Record<string, number[]>;
  /** 悄悄话: read and covered, whom they named, how the coin landed */
  asked?: boolean;
  named?: string | null;
  coin?: "open" | "hidden" | null;
  tally?: Record<string, TruthTally>;
};

/** A fresh pile of a kind and heat: the cards this phone hasn't dealt in earlier games come first. */
const freshPile = (k: Kind, h: Heat) => {
  const list = LISTS[k];
  const places = list.map((_, i) => i).filter((i) => list[i].heat === h);
  return freshFirst(
    k,
    places.map((i) => list[i]),
  ).map((at) => places[at]);
};

/** A game kept before the piles: its truths and dares were places among the cards of its heat. */
const pilesFrom = (saved: Kept | null): Record<string, number[]> => {
  if (!saved) return {};
  if (saved.piles) return saved.piles;
  const out: Record<string, number[]> = {};
  for (const [k, kept] of [
    ["truth", saved.truths],
    ["dare", saved.dares],
  ] as const) {
    const list = LISTS[k];
    const places = list.map((_, i) => i).filter((i) => list[i].heat === saved.heat);
    if (kept?.length) out[`${k}${saved.heat}`] = kept.map((at) => places[at]).filter((i) => i !== undefined);
  }
  return out;
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
  const [limits, setLimits] = useState<Record<string, Limit[]>>(readLimits);
  const [limitsOpen, setLimitsOpen] = useState(false);
  const [asked, setAsked] = useState(saved?.asked ?? false);
  const [named, setNamed] = useState<string | null>(saved?.named ?? null);
  const [coin, setCoin] = useState<"open" | "hidden" | null>(saved?.coin ?? null);
  const [flipping, setFlipping] = useState(false);
  const [tally, setTally] = useState<Record<string, TruthTally>>(saved?.tally ?? {});
  const [nudged, setNudged] = useState(0);
  /** each card drawn gets a fresh countdown and a fresh lid */
  const [drawn, setDrawn] = useState(0);
  const penalty = usePenalty();
  const custom = usePenaltyText().isCustom;

  const [firstPiles] = useState(() => pilesFrom(saved));
  const piles = useRef(firstPiles);
  // kept from the first spin on (the game has no end: leaving from the tally drops it)
  const [played, setPlayed] = useState(!!saved);
  useKeepProgress<Kept>({ heat, phase, kind, prompt, chosen, own, rand, picked, last, swapped, ownLeft, piles: piles.current, asked, named, coin, tally }, played);

  const count = (id: string | undefined, key: keyof TruthTally) => {
    if (id) setTally((t) => ({ ...t, [id]: { ...t[id], [key]: (t[id]?.[key] ?? 0) + 1 } }));
  };

  useEffect(() => {
    if (!nudged) return;
    const id = window.setTimeout(() => setNudged(0), 1800);
    return () => window.clearTimeout(id);
  }, [nudged]);

  // where the bottle landed: the name and the other choices come into sight above the buttons on a short phone
  const chooseBox = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (phase !== "choose") return;
    const id = window.setTimeout(() => chooseBox.current?.scrollIntoView({ block: "nearest", behavior: reduced() ? "auto" : "smooth" }), 300);
    return () => window.clearTimeout(id);
  }, [phase]);

  // once the lid is off (or a whisper moves on), what comes next comes into sight above the buttons
  const side = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!lidOpen && !asked) return;
    const id = window.setTimeout(() => side.current?.scrollIntoView({ block: "nearest", behavior: reduced() ? "auto" : "smooth" }), 450);
    return () => window.clearTimeout(id);
  }, [lidOpen, asked, named, flipping, drawn]);

  // the coin in the air, then how it landed; heads opens the lid for everyone
  useEffect(() => {
    if (!flipping) return;
    const id = window.setTimeout(() => setFlipping(false), reduced() ? 300 : TRUTH_FLIP_MS);
    return () => window.clearTimeout(id);
  }, [flipping]);
  useEffect(() => {
    if (kind === "secret" && coin === "open" && !flipping) setLidOpen(true);
  }, [kind, coin, flipping]);

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

  const who = chosen !== null ? players[chosen] : null;

  /**
   * The next card of a kind for whoever the bottle picked: the table's own first, then the pile. Their
   * limits skip what they'd rather not get, and 只要温和 deals them mild cards at a spicy table; when
   * nothing at all fits, the limits give way rather than the game stopping.
   */
  const deal = (k: Kind) => {
    const mine = (who && limits[who.id]) || [];
    const clear = (text: string) => !limitsOf(text, k).some((l) => mine.includes(l));
    const owned = k === "secret" ? [] : ownList.filter((c) => c.k === k && ownLeft.includes(c.id) && clear(c.text));
    if (owned.length) {
      const card = pick(owned);
      setOwnLeft((left) => left.filter((id) => id !== card.id));
      setOwn(card);
      setPrompt(null);
    } else {
      const list = LISTS[k];
      const take = (h: Heat, fresh: boolean) => {
        const key = `${k}${h}`;
        if (fresh || !piles.current[key]?.length) piles.current[key] = freshPile(k, h);
        const pile = piles.current[key];
        for (let at = pile.length - 1; at >= 0; at--) if (clear(list[pile[at]].zh)) return pile.splice(at, 1)[0];
        return null;
      };
      const h: Heat = mine.includes("mild") ? 1 : heat;
      let i = take(h, false) ?? take(h, true) ?? (h === 2 ? (take(1, false) ?? take(1, true)) : null);
      if (i === null) i = piles.current[`${k}${h}`].pop() ?? 0;
      markSeen(k, list[i]);
      setOwn(null);
      setPrompt(list[i]);
    }
    setKind(k);
    setDrawn((n) => n + 1);
    setLidOpen(false);
    setAsked(false);
    setNamed(null);
    setCoin(null);
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
    setAsked(false);
    setNamed(null);
    setCoin(null);
  };

  const addOwn = (k: "truth" | "dare", text: string) => {
    if (ownList.some((c) => c.k === k && c.text === text)) return;
    const card: OwnCard = { id: Math.random().toString(36).slice(2, 9), k, text };
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
  const setLimitsOf = (id: string, list: Limit[]) => {
    const next = { ...limits, [id]: list };
    setLimits(next);
    writeLimits(next);
  };

  const canSwap = !!who && !swapped.includes(who.id) && !asked;
  const card = own ? { zh: own.text, en: own.text } : prompt ? promptText(prompt, custom) : null;
  // a dare that names a time ("对视 20 秒") gets a countdown once the lid is off
  const seconds = card && kind !== "secret" ? durationOf(card) : null;
  const kindName = (k: Kind) => (k === "truth" ? (zh ? "真心话" : "Truth") : k === "dare" ? (zh ? "大冒险" : "Dare") : zh ? "悄悄话" : "Whisper");
  const namedName = named ? (players.find((p) => p.id === named)?.name ?? "") : "";
  const swap = () => {
    if (!who) return;
    setSwapped((s) => [...s, who.id]);
    deal(kind);
  };
  const pass = () => {
    if (!who) return;
    count(who.id, "p");
    penalty.show({ who: [who.name], kind: "sip" }, nextRound);
  };

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
    ) : phase === "card" && who && kind === "secret" ? (
      named ? (
        flipping ? undefined : (
          <>
            {coin === "hidden" && (
              <button
                type="button"
                className="btn btn-penalty btn-lg"
                onClick={() => {
                  count(named, "p");
                  penalty.show({ who: [namedName], kind: "sip" }, () => setCoin("open"));
                }}
              >
                {zh ? `${namedName} 认罚看题` : `${namedName} pays to see it`}
              </button>
            )}
            <button type="button" className="btn btn-jade btn-lg" onClick={nextRound}>
              {zh ? "下一轮" : "Next round"}
            </button>
          </>
        )
      ) : lidOpen && !asked ? (
        <>
          <button type="button" className="btn btn-penalty btn-lg" onClick={pass}>
            {ui("pass")}
          </button>
          <button
            type="button"
            className="btn btn-jade btn-lg"
            onClick={() => {
              setAsked(true);
              setLidOpen(false);
            }}
          >
            {zh ? "盖上，说名字" : "Cover it, say a name"}
          </button>
        </>
      ) : undefined
    ) : phase === "card" && lidOpen && who ? (
      <>
        <button type="button" className="btn btn-penalty btn-lg" onClick={pass}>
          {ui("pass")}
        </button>
        <button
          type="button"
          className="btn btn-jade btn-lg"
          onClick={() => {
            count(who.id, kind === "truth" ? "t" : "d");
            nextRound();
          }}
        >
          {kind === "truth" ? (zh ? "答完了" : "Answered") : zh ? "做完了" : "Done it"}
        </button>
      </>
    ) : undefined;

  const rules = (
    <>
      <p>
        {zh
          ? "把手机放桌子中间，拨一下瓶子。瓶口指到谁，谁选真心话或大冒险，也可以听天由命，让手机替你选。揭开盖子念出来，不做就认罚。每人每局可以换一次题。瓶子不会连着两次指同一个人，也不会老指着那几个人。可以自己出题，自己出的先抽。"
          : "Put the phone in the middle of the table and flick the bottle. Whoever it points at picks truth or dare, or leaves it to chance, then lifts the lid and reads it out. Refuse and take the penalty. Everyone can swap one card a game. The bottle never picks the same person twice in a row, and won't keep picking the same few. Cards you write yourselves come up first."}
      </p>
      <p>
        {zh
          ? "悄悄话：被指到的人拿起手机，自己看一个关于在座的人的问题，盖上，然后大声说出一个名字。再抛硬币：正面，问题公开；反面，问题保密，被点名的人认罚就能看。"
          : "Whisper: whoever's picked takes the phone, reads a question about the people here to themselves, covers it and says one name out loud. Then a coin: heads, everyone hears the question; tails, it stays secret unless the one named takes a penalty to see it."}
      </p>
      <p>
        {zh
          ? "每人底线（右上角菜单里）：谁不想被碰、不想动手机、不想聊感情，或者只要温和的题，替 TA 选上，抽到 TA 时就跳过这些题。离开时的这局小结里，能看到谁被瓶子指到最多、谁答的真心话最多。"
          : "Limits (in the menu at the top right): if someone would rather skip touching, their phone, their love life, or anything spicy, switch it on for them and their cards will steer clear. When you leave, the recap shows who the bottle picked most, who answered the most truths and more."}
      </p>
    </>
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
      right={{ icon: ShieldCheck, label: zh ? "每人底线" : "Limits", onClick: () => setLimitsOpen(true) }}
      recap={<TruthRecap lang={lang} people={players} picked={picked} tally={tally} />}
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
                  <div className="choose-more">
                    <Button tone="quiet" size="sm" icon={Ear} onClick={() => choose("secret")}>
                      {zh ? "悄悄话" : "Whisper"}
                    </Button>
                    <Button tone="quiet" size="sm" icon={Dices} onClick={() => choose("random")}>
                      {zh ? "听天由命" : "Surprise me"}
                    </Button>
                  </div>
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
            {kind === "secret" && !named && (
              <p className="whisper-hint">
                {asked
                  ? zh
                    ? `${who.name} 大声说出了一个名字？点一下是谁。`
                    : `Did ${who.name} say a name out loud? Tap who.`
                  : lidOpen
                    ? zh
                      ? "只有你看。记住问题，盖上，然后大声说出一个在座的名字。"
                      : "Just you. Remember it, cover it, then say one name out loud."
                    : zh
                      ? `把手机给 ${who.name}，只让 TA 看。`
                      : `Hand the phone to ${who.name}. Eyes only for them.`}
              </p>
            )}
            {/* a whisper, once covered, opens again only by the coin or by paying to see it (a fresh
                lid then, so the cover drops back on however fast it was closed) */}
            <Cloche
              key={kind === "secret" && asked ? "covered" : "reading"}
              open={lidOpen}
              onOpen={() => (kind !== "secret" || !asked) && setLidOpen(true)}
              label={kind !== "secret" ? undefined : asked ? (zh ? "问题保密中" : "Kept secret") : zh ? `只给 ${who.name} 看` : `Eyes only: ${who.name}`}
            >
              <div className="prompt-card">
                <p className="prompt-text">{own ? own.text : tr(card)}</p>
              </div>
            </Cloche>
            <div className="truth-side" ref={side}>
              {kind === "secret" && asked && !named && (
                <WhisperNames
                  people={players}
                  lang={lang}
                  ask={zh ? `${who.name} 说的是谁？` : `Whom did ${who.name} name?`}
                  onPick={(id) => {
                    setNamed(id);
                    setCoin(Math.random() < 0.5 ? "open" : "hidden");
                    setFlipping(true);
                    count(who.id, "s");
                    count(id, "n");
                  }}
                />
              )}
              {kind === "secret" && named && (
                <>
                  <p className="whisper-named">{zh ? `${who.name} 说的是 ${namedName}` : `${who.name} named ${namedName}`}</p>
                  <WhisperCoin landed={flipping ? null : coin} lang={lang} />
                </>
              )}
              <AnimatePresence>
                {lidOpen && seconds !== null && (
                  <motion.div key="timer" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
                    <DareTimer seconds={seconds} lang={lang} resetKey={drawn} />
                  </motion.div>
                )}
                {lidOpen && canSwap && (
                  <motion.div key="swap" className="swap-row" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.4 }}>
                    <Button tone="quiet" size="sm" icon={RefreshCw} onClick={swap}>
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
      <TruthLimits open={limitsOpen} onClose={() => setLimitsOpen(false)} lang={lang} people={players} limits={limits} onChange={setLimitsOf} />
    </GameShell>
  );
}
