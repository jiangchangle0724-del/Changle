import { Minus, Plus } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import "./Undercover.css";
import { useMemo, useRef, useState } from "react";
import { usePenaltyText, useStore, type Player } from "../store";
import { pick, shuffle } from "../lib/random";
import { ADULT_PAIRS, WORD_PAIRS, type WordPair } from "../data/undercover";
import { defaultUc, maxSide, maxUc } from "../shared/engine/games/undercover";
import { sfx } from "../lib/sfx";
import { GameShell, usePenalty } from "./GameShell";
import { Resume, useKeepProgress } from "./Resume";
import { Cloche } from "../components/Cloche";
import { TimerArc } from "../components/TimerArc";
import { PlayerPicker } from "../components/PlayerPicker";
import { Sheet } from "../ui/Sheet";
import { UI } from "../i18n";

type Role = "civilian" | "undercover" | "blank";
type Seat = { player: Player; role: Role; alive: boolean };
/** guess: the blank was voted out and has one try at the civilians' word */
type Phase = "setup" | "deal" | "talk" | "vote" | "guess" | "reveal" | "end";
type Winner = "civilians" | "undercovers" | "blank";
/** 换一组词 at most this many times a game, as online */
const MAX_REDEALS = 3;

/**
 * The pairs this phone has dealt tonight (a night ends after 12 hours without a deal), kept on the
 * phone so that 重开一局, or coming back to the game later in the evening, doesn't repeat one.
 */
const NIGHT_KEY = "changle.undercover.night";
const NIGHT_MS = 12 * 3600_000;
function dealtTonight(): string[] {
  try {
    const raw = localStorage.getItem(NIGHT_KEY);
    const night = raw ? (JSON.parse(raw) as { at?: unknown; used?: unknown }) : null;
    if (!night || typeof night.at !== "number" || !(Date.now() - night.at < NIGHT_MS) || !Array.isArray(night.used)) return [];
    return night.used.filter((k): k is string => typeof k === "string");
  } catch {
    return [];
  }
}
function keepTonight(used: string[]) {
  try {
    localStorage.setItem(NIGHT_KEY, JSON.stringify({ at: Date.now(), used }));
  } catch {
    // private browsing, or full: the words still deal, they just may come round sooner
  }
}

/** A pair this phone hasn't dealt tonight; once every pair has been, the bank starts over. */
function dealPair(adult: boolean): WordPair {
  const bank = adult ? ADULT_PAIRS : WORD_PAIRS;
  const keyOf = (p: WordPair) => `${p.a.zh}|${p.b.zh}`;
  const used = dealtTonight();
  const fresh = bank.filter((p) => !used.includes(keyOf(p)));
  const pair = pick(fresh.length ? fresh : bank);
  // a bank dealt all the way through starts over; the other bank's memory stays
  const mine = new Set(bank.map(keyOf));
  keepTonight([...(fresh.length ? used : used.filter((k) => !mine.has(k))), keyOf(pair)]);
  return pair;
}

/** What a game under way keeps on the phone, to pick up after a reload: the words and who has which. */
type Kept = {
  /** the number of undercovers the host set by hand; null follows the table's size */
  undercovers: number | null;
  withBlank: boolean;
  /** 成人档: the grown-ups' words (off whenever the game is opened fresh) */
  adult?: boolean;
  phase: Phase;
  pair: WordPair | null;
  /** which of the pair's two words the undercover holds, decided at each deal, so the word itself gives nothing away */
  flip: boolean;
  seats: Seat[];
  dealIndex: number;
  round: number;
  eliminated: Seat | null;
  winner: Winner | null;
  firstSpeaker: Player | null;
  /** 平票加赛: the tied players describe again and the rest vote between them */
  runoff?: boolean;
  /** the blank's last guess: right, wrong, or not yet made */
  guessed?: boolean | null;
  redeals?: number;
};

export function Undercover({ onBack }: { onBack: () => void }) {
  return (
    <Resume<Kept> game="undercover" version={2}>
      {(saved) => <UndercoverGame onBack={onBack} saved={saved} />}
    </Resume>
  );
}

function UndercoverGame({ onBack, saved }: { onBack: () => void; saved: Kept | null }) {
  const { players, ui, tr, lang } = useStore();
  const [chosen, setChosen] = useState<number | null>(saved?.undercovers ?? null);
  const [withBlank, setWithBlank] = useState(saved?.withBlank ?? false);
  const [adult, setAdult] = useState(saved?.adult ?? false);
  const [phase, setPhase] = useState<Phase>(saved?.phase ?? "setup");
  const [pair, setPair] = useState<WordPair | null>(saved?.pair ?? null);
  const [flip, setFlip] = useState(saved?.flip ?? false);
  const [seats, setSeats] = useState<Seat[]>(saved?.seats ?? []);
  const [dealIndex, setDealIndex] = useState(saved?.dealIndex ?? 0);
  const [lidOpen, setLidOpen] = useState(false);
  const [round, setRound] = useState(saved?.round ?? 1);
  const [timerOn, setTimerOn] = useState(false);
  const [timerKey, setTimerKey] = useState(0);
  const [eliminated, setEliminated] = useState<Seat | null>(saved?.eliminated ?? null);
  const [winner, setWinner] = useState<Winner | null>(saved?.winner ?? null);
  const [firstSpeaker, setFirstSpeaker] = useState<Player | null>(saved?.firstSpeaker ?? null);
  const [runoff, setRunoff] = useState(saved?.runoff ?? false);
  const [guessed, setGuessed] = useState<boolean | null>(saved?.guessed ?? null);
  const [guessLid, setGuessLid] = useState(false);
  const [redeals, setRedeals] = useState(saved?.redeals ?? 0);
  // 忘了词: someone who has forgotten their word takes the phone, taps their own name and lifts the lid again
  const [peekOpen, setPeekOpen] = useState(false);
  const [peekId, setPeekId] = useState<string | null>(null);
  const [peekLid, setPeekLid] = useState(false);
  const closePeek = () => {
    setPeekOpen(false);
    setPeekId(null);
    setPeekLid(false);
  };
  const penalty = usePenalty();
  // kept from the deal to the end (a word half-read comes back with its lid closed again)
  useKeepProgress<Kept>({ undercovers: chosen, withBlank, adult, phase, pair, flip, seats, dealIndex, round, eliminated, winner, firstSpeaker, runoff, guessed, redeals }, phase !== "setup" && phase !== "end");

  // the same table math as online: how many undercovers a table this size takes, and how many unless set by hand
  const maxUndercovers = maxUc(players.length);
  const undercovers = Math.min(chosen ?? defaultUc(players.length), maxUndercovers);
  // the blank sits on the undercover's side, so it needs the room a side that size has online
  const blankFits = undercovers + 1 <= maxSide(players.length);
  const blankNeeds = 3 * (undercovers + 1) + 1;
  const dealt = useRef(-1);
  const revealed = useRef(-1);

  // 换一组词 keeps its count; a fresh game starts it again
  const start = (redeal = false) => {
    setRedeals(redeal ? (r) => r + 1 : 0);
    const p = dealPair(adult);
    const order = shuffle(players);
    const uc = undercovers;
    const roles: Role[] = [];
    for (let i = 0; i < players.length; i++) roles.push(i < uc ? "undercover" : i === uc && withBlank && blankFits ? "blank" : "civilian");
    const byId = new Map(order.map((pl, i) => [pl.id, roles[i]]));
    setPair(p);
    // heads or tails for which word is the undercover's: with it always the pair's second word, a
    // regular would know their side from the word alone
    setFlip(Math.random() < 0.5);
    setSeats(players.map((pl) => ({ player: pl, role: byId.get(pl.id)!, alive: true })));
    dealt.current = -1;
    revealed.current = -1;
    setDealIndex(0);
    setLidOpen(false);
    setRound(1);
    setWinner(null);
    setEliminated(null);
    setRunoff(false);
    setGuessed(null);
    setGuessLid(false);
    setPhase("deal");
  };

  const alive = useMemo(() => seats.filter((s) => s.alive), [seats]);

  const startTalk = () => {
    // anyone may open the round but the blank, who has no word to start from (the Undercover app's rule)
    const still = seats.filter((s) => s.alive);
    const can = still.filter((s) => s.role !== "blank");
    setFirstSpeaker(pick(can.length ? can : still).player);
    setTimerOn(false);
    setTimerKey((k) => k + 1);
    setPhase("talk");
  };

  // the blank plays on the undercover's side, as at an online table: civilians win only once the
  // undercovers and the blank are all out
  const decide = (list: Seat[]) => {
    const still = list.filter((s) => s.alive);
    const side = still.filter((s) => s.role !== "civilian").length;
    const civ = still.length - side;
    if (side === 0) setWinner("civilians");
    else if (side >= civ) setWinner("undercovers");
  };

  const eliminate = (p: Player) => {
    const next = seats.map((s) => (s.player.id === p.id ? { ...s, alive: false } : s));
    const out = next.find((s) => s.player.id === p.id)!;
    setSeats(next);
    setEliminated(out);
    setRunoff(false);
    setGuessed(null);
    setGuessLid(false);
    sfx.reveal();
    // the blank's one last chance before the game goes on: guess the civilians' word
    if (out.role === "blank") {
      setPhase("guess");
      return;
    }
    decide(next);
    setPhase("reveal");
  };

  // the blank says a guess out loud, lifts the lid alone and says how it went (the end shows both words, so nobody can fib)
  const guessDone = (right: boolean) => {
    if (phase !== "guess") return;
    setGuessed(right);
    if (right) setWinner("blank");
    else decide(seats);
    if (right) sfx.win();
    setPhase("reveal");
  };

  // a tie, as at an online table: first a run-off (the tied describe again, the rest vote between
  // them); a second tie and nobody is out, and the next round starts with a new first speaker
  const tie = () => {
    if (!runoff) {
      setRunoff(true);
      setTimerOn(false);
      setTimerKey((k) => k + 1);
      setPhase("talk");
      return;
    }
    setRunoff(false);
    setRound((r) => r + 1);
    startTalk();
  };

  const afterReveal = () => {
    // once per reveal: a double tap must not skip a round
    if (revealed.current === round) return;
    revealed.current = round;
    if (winner) {
      setPhase("end");
      sfx.win();
      // a blank who guessed the word wins alone: everyone else loses, the undercovers too
      const lost = (s: Seat) => (winner === "civilians" ? s.role !== "civilian" : winner === "blank" ? s.role !== "blank" : s.role === "civilian");
      const losers = seats.filter(lost).map((s) => s.player.name);
      const note =
        winner === "civilians"
          ? lang === "zh"
            ? "卧底被揪出来了"
            : "The undercover got caught"
          : winner === "blank"
            ? lang === "zh"
              ? "白板猜中了平民的词"
              : "The blank guessed the civilians' word"
            : lang === "zh"
              ? "卧底赢了"
              : "The undercover wins";
      penalty.show({ who: losers, kind: "sip", note });
    } else {
      setRound((r) => r + 1);
      startTalk();
    }
  };

  // the pair's two words, as dealt this game
  const civWord = pair ? (flip ? pair.b : pair.a) : null;
  const ucWord = pair ? (flip ? pair.a : pair.b) : null;
  const wordOf = (s: Seat) => (s.role === "undercover" ? ucWord! : civWord!);
  const word = (s: Seat) => (s.role === "blank" ? (lang === "zh" ? "白板：你没有词，靠听" : "Blank: no word. Listen and bluff.") : tr(wordOf(s)));

  const roleName = (r: Role) => (r === "civilian" ? (lang === "zh" ? "平民" : "Civilian") : r === "undercover" ? (lang === "zh" ? "卧底" : "Undercover") : lang === "zh" ? "白板" : "Blank");
  const custom = usePenaltyText().isCustom;

  const gotIt = () => {
    // once per player: a quick double tap on this button must not skip the next player's word
    if (dealt.current === dealIndex) return;
    dealt.current = dealIndex;
    setLidOpen(false);
    if (dealIndex + 1 >= seats.length) startTalk();
    else setDealIndex(dealIndex + 1);
  };

  // tonight's people under the top bar: who holds the phone or speaks first, and who is out (the
  // last game's seats linger until the next deal, so nobody is out at the setup)
  const roster = {
    turn: phase === "deal" ? seats[dealIndex]?.player.id : phase === "talk" ? firstSpeaker?.id : undefined,
    out: phase === "setup" ? [] : seats.filter((s) => !s.alive).map((s) => s.player.id),
  };
  const status = phase === "talk" || phase === "vote" || phase === "guess" || phase === "reveal" ? ({ kind: "round", current: round } as const) : undefined;

  // each moment's button, at the bottom by the thumb
  const actions =
    phase === "setup" ? (
      <button type="button" className="btn btn-primary btn-lg" onClick={() => start()}>
        {lang === "zh" ? "发词" : "Deal the words"}
      </button>
    ) : phase === "deal" && lidOpen ? (
      // shows a moment after the lid lifts, so the word is read before the phone moves on
      <motion.button key={dealIndex} type="button" className="btn btn-primary btn-lg" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }} onClick={gotIt}>
        {ui("gotIt")}
      </motion.button>
    ) : phase === "talk" ? (
      <button type="button" className="btn btn-primary btn-lg" onClick={() => setPhase("vote")}>
        {lang === "zh" ? "投票" : "Vote"}
      </button>
    ) : phase === "vote" ? (
      // the main move is a tap on a player above; these two are for a table that can't agree
      <>
        <button type="button" className="btn btn-ghost btn-lg" onClick={() => setPhase("talk")}>
          {lang === "zh" ? "再聊一会儿" : "Talk more"}
        </button>
        <button type="button" className="btn btn-ghost btn-lg" onClick={tie}>
          {runoff ? (lang === "zh" ? "又平了" : "Tied again") : lang === "zh" ? "平票，加赛" : "Tie: run-off"}
        </button>
      </>
    ) : phase === "guess" && guessLid ? (
      <>
        <button type="button" className="btn btn-ghost btn-lg" onClick={() => guessDone(false)}>
          {lang === "zh" ? "没猜中" : "Wrong"}
        </button>
        <button type="button" className="btn btn-primary btn-lg" onClick={() => guessDone(true)}>
          {lang === "zh" ? "猜中了" : "Got it right"}
        </button>
      </>
    ) : phase === "reveal" && eliminated ? (
      <button type="button" className="btn btn-primary btn-lg" onClick={afterReveal}>
        {winner ? (lang === "zh" ? "看结果" : "See the result") : lang === "zh" ? "下一轮" : "Next round"}
      </button>
    ) : phase === "end" ? (
      <button type="button" className="btn btn-primary btn-lg" onClick={() => setPhase("setup")}>
        {ui("restart")}
      </button>
    ) : undefined;

  const rules = (
    <p>
      {lang === "zh"
        ? `每人点开看自己的词，大多数人拿同一个词，卧底拿一个相近的词。轮流用一句话描述自己的词，不能说出词里的字。每轮讨论后投票淘汰一个人；平票的几个人加赛再说一句，其他人只在他们中间投，又平了这轮就没人出局。卧底全部出局，平民赢；卧底人数追平平民，卧底赢。输的一方${custom ? "受罚" : "喝"}。`
        : `Everyone lifts the lid to see their word. Most players share one word; the undercover gets a similar one. Take turns describing your word in a sentence without saying it. After each round, vote someone out. A tie: the tied players describe once more and the rest vote between them; tied again and nobody goes this round. All undercovers out: civilians win. Undercovers match civilians: undercovers win. The losing side ${custom ? "takes the penalty" : "drinks"}.`}
      {lang === "zh" ? "" : " "}
      {lang === "zh" ? "加了白板的话：白板没有词，跟卧底一伙，白板也出局平民才赢。白板被投出去时可以猜一次平民的词，猜中白板一个人赢。" : "With a blank: it gets no word and plays on the undercover's side, so civilians also have to vote it out. A blank voted out gets one guess at the civilians' word, and wins alone if it's right."}
    </p>
  );

  return (
    <GameShell
      title={UI.gameUndercover}
      rules={rules}
      onBack={onBack}
      penalty={penalty.call}
      onPenaltyDone={penalty.done}
      status={status}
      roster={roster}
      actions={actions}
    >
      <AnimatePresence mode="wait">
        {phase === "setup" && (
          <motion.div key="setup" className="stack" style={{ gap: 16 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <div className="porcelain setup-card">
              <div className="settings-row ink">
                <span>{lang === "zh" ? "卧底人数" : "Undercovers"}</span>
                <div className="row" style={{ gap: 10 }}>
                  <button type="button" className="icon-btn ink" onClick={() => setChosen(Math.max(1, undercovers - 1))} disabled={undercovers <= 1} aria-label={lang === "zh" ? "少一个卧底" : "One undercover fewer"}>
                    <Minus size={18} />
                  </button>
                  <span className="tabular" style={{ minWidth: 24, textAlign: "center", fontWeight: 700, fontSize: 20 }}>
                    {undercovers}
                  </span>
                  <button type="button" className="icon-btn ink" onClick={() => setChosen(Math.min(maxUndercovers, undercovers + 1))} disabled={undercovers >= maxUndercovers} aria-label={lang === "zh" ? "多一个卧底" : "One undercover more"}>
                    <Plus size={18} />
                  </button>
                </div>
              </div>
              <div className="settings-row ink">
                <span>{lang === "zh" ? "加一个白板" : "Add a blank"}</span>
                <button type="button" className={`btn btn-sm ${withBlank && blankFits ? "btn-jade" : "btn-ghost ink"}`} aria-pressed={withBlank && blankFits} disabled={!blankFits} onClick={() => setWithBlank((v) => !v)}>
                  {withBlank && blankFits ? (lang === "zh" ? "有" : "Yes") : lang === "zh" ? "无" : "No"}
                </button>
              </div>
              <div className="settings-row ink">
                <span>{lang === "zh" ? "成人档" : "Adults-only words"}</span>
                <button type="button" className={`btn btn-sm ${adult ? "btn-jade" : "btn-ghost ink"}`} aria-pressed={adult} onClick={() => setAdult((v) => !v)}>
                  {adult ? (lang === "zh" ? "开" : "On") : lang === "zh" ? "关" : "Off"}
                </button>
              </div>
              {adult && <p className="hint-ink" style={{ marginTop: "var(--space-3)" }}>{lang === "zh" ? "成人档：性、约会、夜生活和喝酒，尺度大，只给成年人玩。" : "Adults-only words: sex, dating, nights out and drinking. Strictly for grown-ups."}</p>}
              <p className="hint-ink">
                {lang === "zh" ? `${players.length} 人在座。白板没有词，跟卧底一伙：白板也出局，平民才赢。白板被投出去时能猜一次平民的词，猜中就赢。` : `${players.length} at the table. A blank gets no word and plays on the undercover's side: civilians win only when the blank is out too. A blank voted out gets one guess at the civilians' word and wins if it's right.`}
                {!blankFits && (lang === "zh" ? `${undercovers} 个卧底时，${blankNeeds} 人以上才能加白板。` : ` With ${undercovers} undercover${undercovers > 1 ? "s" : ""}, a blank needs ${blankNeeds} or more players.`)}
              </p>
            </div>
          </motion.div>
        )}

        {phase === "deal" && seats[dealIndex] && (
          // a fresh pair (换一组词) is a fresh card: the lid can't be caught half-lifted
          <motion.div key={`deal-${redeals}-${dealIndex}`} className="card-flow" initial={{ opacity: 0, x: 24 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -24 }}>
            <p className="turn-line">
              <span className="hint">{ui("passPhone")}</span>
              <span className="turn-name">{seats[dealIndex].player.name}</span>
              <span className="hint tabular">
                {dealIndex + 1} / {seats.length}
              </span>
            </p>
            <Cloche open={lidOpen} onOpen={() => setLidOpen(true)} label={lidOpen ? undefined : `${seats[dealIndex].player.name} · ${ui("liftLid")}`}>
              <div className="prompt-card">
                <p className={`word-big ${lang === "zh" ? "zh-display" : "en-display"}`}>{word(seats[dealIndex])}</p>
                {seats[dealIndex].role !== "blank" && <p className="hint-ink">{lang === "zh" ? wordOf(seats[dealIndex]).en : wordOf(seats[dealIndex]).zh}</p>}
              </div>
            </Cloche>
            {/* 换一组词: someone doesn't know the word (or the table had it lately); everyone looks again */}
            {lidOpen && seats[dealIndex].role !== "blank" && redeals < MAX_REDEALS && (
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => start(true)}>
                {lang === "zh" ? "不认识这个词？换一组，大家重看" : "Don't know this word? New pair, everyone looks again"}
              </button>
            )}
            {redeals > 0 && dealIndex === 0 && !lidOpen && <p className="hint">{lang === "zh" ? "换了一组新词，从头再看一次" : "A fresh pair: everyone looks again from the start"}</p>}
          </motion.div>
        )}

        {phase === "talk" && (
          <motion.div key={`talk-${round}`} className="stack" style={{ gap: 16, alignItems: "center" }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <p className="turn-line">
              {runoff ? (
                <span className="hint">{lang === "zh" ? "平票加赛：平票的几位再各说一句，其他人听" : "Tie run-off: the tied players say one more line each; everyone else listens"}</span>
              ) : (
                <span className="hint">
                  {lang === "zh" ? "从" : "Start with"} <strong style={{ color: "var(--cream)" }}>{firstSpeaker?.name}</strong> {lang === "zh" ? "开始描述" : ""}
                </span>
              )}
            </p>
            <TimerArc seconds={90} running={timerOn} onEnd={() => setTimerOn(false)} resetKey={timerKey} />
            <div className="row" style={{ gap: 10 }}>
              <button type="button" className="btn btn-ghost" onClick={() => setTimerOn((v) => !v)}>
                {timerOn ? ui("stop") : ui("start")}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setTimerOn(false);
                  setTimerKey((k) => k + 1);
                }}
              >
                {ui("reset")}
              </button>
            </div>
            <button type="button" className="btn btn-ghost btn-sm" onClick={() => setPeekOpen(true)}>
              {lang === "zh" ? "忘了自己的词？" : "Forgot your word?"}
            </button>
          </motion.div>
        )}

        {phase === "vote" && (
          <motion.div key="vote" className="stack" style={{ gap: 16 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <p className="hint">
              {runoff
                ? lang === "zh"
                  ? "加赛：平票的人不投，其他人只在他们中间指认，点票数最多的人。又平了，这轮就没人出局。"
                  : "Run-off: the tied don't vote; everyone else points at one of them. Tap the one with the most fingers. Tied again, and nobody goes this round."
                : lang === "zh"
                  ? "大家指认，点一下票数最多的人。"
                  : "Everyone points. Tap the one with the most fingers."}
            </p>
            <PlayerPicker players={alive.map((s) => s.player)} onPick={eliminate} />
          </motion.div>
        )}

        {phase === "guess" && eliminated && civWord && (
          <motion.div key="guess" className="card-flow" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
            <div className="porcelain reveal-card">
              <p className="hint-ink">{lang === "zh" ? "出局" : "Out"}</p>
              <p className="turn-name ink" style={{ fontSize: 28 }}>
                {eliminated.player.name}
              </p>
              <p className="reveal-role blank">{roleName("blank")}</p>
            </div>
            <p className="hint" style={{ textAlign: "center" }}>
              {lang === "zh" ? "最后一搏：先大声说出你猜的平民的词，再拿过手机自己掀开看答案，别人别看。" : "One last shot: say your guess at the civilians' word out loud, then take the phone and lift the lid yourself. Everyone else, look away."}
            </p>
            <Cloche open={guessLid} onOpen={() => setGuessLid(true)} label={guessLid ? undefined : `${eliminated.player.name} · ${lang === "zh" ? "看答案" : "See the answer"}`}>
              <div className="prompt-card">
                <p className="hint-ink">{lang === "zh" ? "平民的词" : "The civilians' word"}</p>
                <p className={`word-big ${lang === "zh" ? "zh-display" : "en-display"}`}>{tr(civWord)}</p>
                <p className="hint-ink">{lang === "zh" ? civWord.en : civWord.zh}</p>
              </div>
            </Cloche>
          </motion.div>
        )}

        {phase === "reveal" && eliminated && (
          <motion.div key="reveal" className="stack" style={{ gap: 16, alignItems: "center" }} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }}>
            <div className="porcelain reveal-card">
              <p className="hint-ink">{lang === "zh" ? "出局" : "Out"}</p>
              <p className="turn-name ink" style={{ fontSize: 28 }}>
                {eliminated.player.name}
              </p>
              <p className={`reveal-role ${eliminated.role}`}>{roleName(eliminated.role)}</p>
              {eliminated.role === "blank" && guessed !== null && (
                <p className={`uc-guess ${guessed ? "is-right" : ""}`}>{guessed ? (lang === "zh" ? "猜中了平民的词，白板赢！" : "Guessed the civilians' word: the blank wins!") : lang === "zh" ? "没猜中，游戏接着玩" : "Wrong guess. The game goes on."}</p>
              )}
            </div>
          </motion.div>
        )}

        {phase === "end" && civWord && ucWord && (
          <motion.div key="end" className="stack" style={{ gap: 14 }} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <div className="porcelain reveal-card">
              <p className={`turn-name ink ${lang === "zh" ? "zh-display" : "en-display"}`} style={{ fontSize: 26 }}>
                {winner === "civilians" ? (lang === "zh" ? "平民赢了" : "Civilians win") : winner === "blank" ? (lang === "zh" ? "白板赢了" : "The blank wins") : lang === "zh" ? "卧底赢了" : "Undercovers win"}
              </p>
              {winner === "blank" && <p className="hint-ink">{lang === "zh" ? "白板猜中了平民的词，一个人赢" : "The blank guessed the civilians' word and wins alone"}</p>}
              <p className="hint-ink" style={{ marginTop: 8 }}>
                {lang === "zh" ? "平民" : "Civilians"}: <strong>{tr(civWord)}</strong> · {lang === "zh" ? "卧底" : "Undercover"}: <strong>{tr(ucWord)}</strong>
              </p>
              <ul className="role-list">
                {seats.map((s) => (
                  <li key={s.player.id}>
                    <span>{s.player.name}</span>
                    <span className={`reveal-role small ${s.role}`}>{roleName(s.role)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <PeekSheet
        open={peekOpen}
        onClose={closePeek}
        seats={alive}
        picked={alive.find((s) => s.player.id === peekId) ?? null}
        onPick={(id) => setPeekId(id)}
        lid={peekLid}
        onLid={() => setPeekLid(true)}
        word={word}
        other={(s) => (s.role === "blank" ? null : lang === "zh" ? wordOf(s).en : wordOf(s).zh)}
      />
    </GameShell>
  );
}

/**
 * 忘了词: the phone goes to whoever forgot, they tap their own name and lift the lid once more,
 * the way the words were dealt. The phone's back button closes it.
 */
function PeekSheet({
  open,
  onClose,
  seats,
  picked,
  onPick,
  lid,
  onLid,
  word,
  other,
}: {
  open: boolean;
  onClose: () => void;
  seats: Seat[];
  picked: Seat | null;
  onPick: (id: string) => void;
  lid: boolean;
  onLid: () => void;
  word: (s: Seat) => string;
  other: (s: Seat) => string | null;
}) {
  const { lang, ui } = useStore();
  const zh = lang === "zh";
  return (
    <Sheet open={open} onClose={onClose} lang={lang} title={zh ? "看自己的词" : "Check your word"}>
      {!picked ? (
        <div className="stack" style={{ gap: "var(--space-4)" }}>
          <p className="hint">{zh ? "谁忘了？拿着手机点自己的名字，别人别看。" : "Who forgot? Take the phone and tap your own name. Everyone else, look away."}</p>
          <PlayerPicker players={seats.map((s) => s.player)} onPick={(p) => onPick(p.id)} />
        </div>
      ) : (
        <div className="card-flow">
          <p className="turn-line">
            <span className="turn-name">{picked.player.name}</span>
          </p>
          <Cloche open={lid} onOpen={onLid} label={lid ? undefined : `${picked.player.name} · ${ui("liftLid")}`}>
            <div className="prompt-card">
              <p className={`word-big ${zh ? "zh-display" : "en-display"}`}>{word(picked)}</p>
              {other(picked) && <p className="hint-ink">{other(picked)}</p>}
            </div>
          </Cloche>
          {lid && (
            <button type="button" className="btn btn-primary btn-lg btn-block" onClick={onClose}>
              {zh ? "记住了，盖上" : "Got it, cover it"}
            </button>
          )}
        </div>
      )}
    </Sheet>
  );
}
