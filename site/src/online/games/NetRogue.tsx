import { Camera, DoorOpen, Hand } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { TimerArc } from "../../components/TimerArc";
import { ROGUE_MS, RANKS, RULES, RULE_BY_RANK, ruleWords, SUITS, type Rank } from "../../data/rogue13";
import { HeldCard, RogueTable, type LeaveTo } from "../../games/rogueCards";
import { RogueLog } from "../../games/rogueLog";
import { playPower } from "../../games/rogueSounds";
import { UI, type T } from "../../i18n";
import { haptic } from "../../lib/sfx";
import type { RogueHolders, RogueView } from "../../shared/protocol";
import { usePenaltyText, useStore } from "../../store";
import { NetFrame } from "../NetFrame";
import { useReached, useRoom, useRoomEvent } from "../RoomContext";
import { useWatching } from "../players";
import { HostButton, HostRow, SeatPicker, TurnLine, useYourTurn, Waiting } from "./common";

const t = (zh: string, en: string): T => ({ zh, en });

/** How each card plays when everyone has their own phone. */
const ONLINE_HOW: Partial<Record<Rank, T>> = {
  "2": t("以后谁被罚，他的手机上会多一个喊陪酒的按钮，一按你就得陪他喝。", "From now on, anyone who gets a penalty can call you from their phone, and you drink with them."),
  "3": t("选一个园。从下一位开始轮流说一样，说完在自己手机上按一下。", "Pick a garden. Starting with the next player, each names one thing, then taps their phone."),
  "4": t("所有人抢着按下一个数字。两个人同时按到同一个数，两个都喝；最后没抢到的也喝。", "Everyone races to tap the next number. Two on the same number both drink; whoever is left drinks too."),
  "5": t("照相机牌摆在你的手机上，什么时候点你挑，只能点一次。", "The camera card sits on your phone. Tap it whenever you like, once."),
  "6": t("摸鼻子牌摆在你的手机上，只能点一次。你一点，所有人都要在手机上摸鼻子，最慢的喝。", "The nose card sits on your phone, good for one tap. Tap it and everyone must touch theirs; the slowest drinks."),
  "7": t("你选一个开始的数，大家轮流在手机上报数，遇到 7 的倍数或带 7 的要按过。", "Pick a starting number. Everyone counts in turn on their phone; on a seven, tap pass."),
  "8": t("WC 票摆在你的手机上。别人要去厕所，得先在手机上点上厕所，喝一口再去。", "The pass sits on your phone. Anyone else who needs the bathroom taps it on theirs and drinks first."),
  "10": t("神经病牌摆在你的手机上。谁接了你的话，点那张牌，点他，他喝。", "The troublemaker card sits on your phone. Whoever answers you: tap the card, tap them, and they drink."),
};

/** The same, when the host has set the table's own penalty instead of drinking. */
const ONLINE_HOW_CUSTOM: Partial<Record<Rank, T>> = {
  "2": t("以后谁被罚，他的手机上会多一个喊陪罚的按钮，一按你就得陪他一起受罚。", "From now on, anyone who gets a penalty can call you from their phone, and you take it with them."),
  "4": t("所有人抢着按下一个数字。两个人同时按到同一个数，两个都受罚；最后没抢到的也受罚。", "Everyone races to tap the next number. Two on the same number both take the penalty, and so does whoever is left."),
  "6": t("摸鼻子牌摆在你的手机上，只能点一次。你一点，所有人都要在手机上摸鼻子，最慢的受罚。", "The nose card sits on your phone, good for one tap. Tap it and everyone must touch theirs; the slowest takes the penalty."),
  "8": t("WC 票摆在你的手机上。别人要去厕所，得先在手机上点上厕所，受完罚再去。", "The pass sits on your phone. Anyone else who needs the bathroom taps it on theirs and takes the penalty first."),
  "10": t("神经病牌摆在你的手机上。谁接了你的话，点那张牌，点他，他受罚。", "The troublemaker card sits on your phone. Whoever answers you: tap the card, tap them, and they take the penalty."),
};

const onlineHow = (rank: Rank, custom: boolean) => (custom ? ONLINE_HOW_CUSTOM[rank] ?? ONLINE_HOW[rank] : ONLINE_HOW[rank]);

const GARDENS: T[] = [t("蔬菜园", "Vegetables"), t("水果园", "Fruits"), t("动物园", "Animals")];

const DECK_SIZE = RANKS.length * SUITS.length;
/** The deck has run out: the pile comes back onto the deck, then the deck riffles, then the card comes (as on one phone). */
const GATHER_MS = 380;
const RIFFLE_MS = 820;

/**
 * What the table shows beyond the server's view: how many cards lie on the pile, where the card
 * up goes when it leaves (a power's card down to the tray, the rest onto the pile), and the
 * moment a fresh deck is dealt from, when the pile gathers back and the deck riffles before the
 * card turns over. `openedOn`: the card already up when this phone arrived (dealt without ceremony).
 */
export function useTable(v: RogueView, cardKey: string, openedOn: string) {
  const [holding, setHolding] = useState<string | null>(null);
  const [shuffling, setShuffling] = useState(false);
  const lastRank = useRef<Rank | null>(null);
  if (v.card) lastRank.current = v.card.rank;
  useEffect(() => {
    if (!cardKey || cardKey === openedOn || !v.reshuffled) return;
    setHolding(cardKey);
    const a = window.setTimeout(() => setShuffling(true), GATHER_MS);
    const b = window.setTimeout(() => {
      setShuffling(false);
      setHolding(null);
    }, GATHER_MS + RIFFLE_MS);
    return () => {
      window.clearTimeout(a);
      window.clearTimeout(b);
      setShuffling(false);
      setHolding(null);
    };
    // a fresh deck's first card is what starts this
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardKey]);
  const held = holding === cardKey && !!cardKey;
  const drawn = held ? 0 : Math.max(0, DECK_SIZE - v.left - (v.card ? 1 : 0));
  const leaveTo: LeaveTo = lastRank.current && RULE_BY_RANK[lastRank.current].kind === "hold" ? "tray" : "pile";
  return { holding: held, shuffling, drawn, leaveTo };
}

export function NetRogue({ v, onLeave }: { v: RogueView; onLeave: () => void }) {
  const { me, isHost, g, nameOf } = useRoom();
  const { ui, tr, lang } = useStore();
  const custom = usePenaltyText().isCustom;
  const rule = v.card ? RULE_BY_RANK[v.card.rank] : null;
  const words = rule ? ruleWords(rule, custom) : null;
  const how = v.card ? onlineHow(v.card.rank, custom) : undefined;
  const myTurn = v.turn === me;
  const drawer = v.drawer === me;
  const drawerActs = drawer || isHost;
  // while the table plays a round of the card, the card steps back so the round fits on screen
  const live = v.phase === "garden" || v.phase === "grab" || v.phase === "sevens";
  useYourTurn(myTurn && v.phase === "draw");

  // a power's card comes up: its own sound on every phone, once the card has turned over (using the
  // power later is an effect of its own; a phone that opens on a card already up stays quiet)
  const cardKey = v.card ? `${v.card.rank}${v.card.suit}-${v.left}` : "";
  const openedOn = useRef(cardKey);
  const table = useTable(v, cardKey, openedOn.current);
  useEffect(() => {
    if (!cardKey || cardKey === openedOn.current) return;
    const power = v.card ? RULE_BY_RANK[v.card.rank].power : undefined;
    if (!power) return;
    const id = window.setTimeout(() => playPower(power), 480 + (v.reshuffled ? GATHER_MS + RIFFLE_MS : 0));
    return () => window.clearTimeout(id);
    // the card is what changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardKey]);
  // the card and what it asks come up together, once the table has dealt it
  const up = !!v.card && !table.holding;
  // the 牌谱, off the pile: what is left of each rank, and the cards turned so far
  const [logOpen, setLogOpen] = useState(false);

  const rules = (
    <ul className="rule-list">
      {RULES.map((r) => (
        <li key={r.rank}>
          <span className="rule-rank en-display">{r.rank}</span>
          <span>
            <strong>{tr(ruleWords(r, custom).title)}</strong>
            <br />
            {tr(ruleWords(r, custom).rule)}
            {ONLINE_HOW[r.rank] && (
              <>
                <br />
                <span style={{ color: "var(--lamp)" }}>{tr(onlineHow(r.rank, custom)!)}</span>
              </>
            )}
          </span>
        </li>
      ))}
    </ul>
  );

  return (
    <NetFrame title={UI.gameRogue} rules={rules} onLeave={onLeave}>
      <TurnLine
        pid={v.phase === "draw" ? v.turn : v.drawer}
        lead={v.phase === "draw" ? undefined : lang === "zh" ? "抽牌的是" : "Drawn by"}
        mineText={v.phase === "draw" ? undefined : lang === "zh" ? "你抽的牌" : "Your card"}
        extra={<span className="hint tabular">{ui("remaining", { n: v.left })}</span>}
      />

      <div className={`card-stage ${live ? "card-stage-small" : ""}`}>
        <RogueTable
          card={up && v.card ? { rank: v.card.rank, suit: v.card.suit } : null}
          remaining={v.left}
          drawn={table.drawn}
          canDraw={v.phase === "draw" && (myTurn || isHost) && !v.interrupt && !table.holding}
          onDraw={() => {
            g("draw");
            haptic(10);
          }}
          drawLabel={lang === "zh" ? "下滑抽牌" : "Swipe down"}
          shuffling={table.shuffling}
          leaveTo={table.leaveTo}
          onPile={() => setLogOpen(true)}
        />
      </div>
      <RogueLog open={logOpen} onClose={() => setLogOpen(false)} stock={v.stock ?? []} log={v.log ?? []} nameOf={nameOf} />

      <AnimatePresence mode="wait">
        {up && v.card && rule && words && (
          <motion.div
            key={`${v.card.rank}${v.card.suit}-${v.left}`}
            className="porcelain rule-card"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ delay: 0.35, duration: 0.3 }}
          >
            <h2 className={`rule-title ${lang === "zh" ? "zh-display" : "en-display"}`}>{tr(words.title)}</h2>
            {!live && <p className="rule-body">{tr(words.rule)}</p>}
            {how && <p className={`hint-ink ${live ? "" : "rule-online"}`}>{tr(how)}</p>}
            {v.reshuffled && <p className="hint-ink">{ui("deckReshuffled")}</p>}
          </motion.div>
        )}
      </AnimatePresence>

      {up && v.card && rule && (
        <motion.div key={`panel-${v.phase}-${v.left}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5, duration: 0.25 }}>
          <PhasePanel v={v} drawerActs={drawerActs} />
        </motion.div>
      )}

      <Powers v={v} />

      <HostRow>
        {v.phase === "draw" && !myTurn && <HostButton onClick={() => g("skip", { at: `${v.phase}:${v.turn}` })}>{ui("skip")}</HostButton>}
        {(v.phase === "garden" || v.phase === "grab" || v.phase === "sevens" || v.phase === "garden-pick" || v.phase === "sevens-start" || v.phase === "pick") && !drawer && (
          <HostButton onClick={() => g("skip", { at: `${v.phase}:${v.turn}` })}>{lang === "zh" ? "结束这张牌" : "End this card"}</HostButton>
        )}
      </HostRow>

      <Interrupts v={v} />
    </NetFrame>
  );
}

/* ---------------- what this card asks of the table ---------------- */

function PhasePanel({ v, drawerActs }: { v: RogueView; drawerActs: boolean }) {
  const { me, g, nameOf, offset, isHost } = useRoom();
  const { ui, tr, lang } = useStore();
  const pen = usePenaltyText();
  const drawerName = nameOf(v.drawer);

  switch (v.phase) {
    case "pick":
      return drawerActs ? (
        <div className="stack" style={{ gap: 10 }}>
          <p className="hint" style={{ textAlign: "center" }}>
            {ui("chooseTarget")}
          </p>
          <SeatPicker exclude={v.drawer ? [v.drawer] : []} onPick={(pid) => g("pick", { target: pid })} />
        </div>
      ) : (
        <Waiting>{pen.line(t(`${drawerName} 在指定谁喝`, `${drawerName} is choosing who drinks`), t(`${drawerName} 在指定谁受罚`, `${drawerName} is choosing who takes the penalty`))}</Waiting>
      );

    case "done": {
      const canNext = v.drawer === me || v.turn === me || isHost;
      return canNext ? (
        <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => g("next")}>
          {lang === "zh" ? "下一位抽牌" : "Next player draws"}
        </button>
      ) : (
        <Waiting>{lang === "zh" ? `等 ${drawerName} 传给下一位` : `Waiting for ${drawerName} to pass it on`}</Waiting>
      );
    }

    case "garden-pick":
      return drawerActs ? (
        <div className="row garden-pick" style={{ gap: 8 }}>
          {GARDENS.map((name, kind) => (
            <button key={kind} type="button" className="btn btn-block btn-porcelain" onClick={() => g("garden", { kind })}>
              {tr(name)}
            </button>
          ))}
        </div>
      ) : (
        <Waiting>{lang === "zh" ? `${drawerName} 在选园子` : `${drawerName} is choosing the garden`}</Waiting>
      );

    case "garden": {
      const gd = v.garden!;
      const speaking = gd.speaker === me;
      return (
        <div className="stack game-panel" style={{ gap: 12 }}>
          <div className="row draw-head">
            <TimerArc key={`${gd.speaker}-${gd.said}`} seconds={7} running endsAt={gd.endsAt} offset={offset} size={56} />
            <div className="draw-word">
              <span className={`draw-word-main ${lang === "zh" ? "zh-display" : "en-display"}`}>{tr(GARDENS[gd.kind])}</span>
              <span className="hint tabular">{lang === "zh" ? `已经说了 ${gd.said} 个` : `${gd.said} named so far`}</span>
            </div>
          </div>
          {speaking ? (
            <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => g("said")}>
              {lang === "zh" ? "我说完了，下一个" : "Said it. Next"}
            </button>
          ) : (
            <Waiting>{lang === "zh" ? `轮到 ${nameOf(gd.speaker)} 说` : `${nameOf(gd.speaker)} is up`}</Waiting>
          )}
          {/* the judge names who it was: the one who just finished (the word just heard), or the one speaking now */}
          {drawerActs && gd.last && gd.last !== me && (
            <button type="button" className="btn btn-penalty btn-block" onClick={() => g("repeat", { who: gd.last })}>
              {lang === "zh" ? `${nameOf(gd.last)} 刚才重复了或说错了` : `${nameOf(gd.last)} repeated or fumbled`}
            </button>
          )}
          {drawerActs && !speaking && (
            <button type="button" className={`btn btn-block ${gd.last && gd.last !== me ? "btn-ghost" : "btn-penalty"}`} onClick={() => g("repeat", { who: gd.speaker })}>
              {lang === "zh" ? `${nameOf(gd.speaker)} 重复了或说错了` : `${nameOf(gd.speaker)} repeated or fumbled`}
            </button>
          )}
        </div>
      );
    }

    case "grab":
      return <GrabPanel v={v} />;

    case "sevens-start":
      return drawerActs ? (
        <div className="stack" style={{ gap: 10 }}>
          <p className="hint" style={{ textAlign: "center" }}>
            {lang === "zh" ? "从几开始数？" : "Start counting from?"}
          </p>
          <div className="num-grid">
            {Array.from({ length: 20 }, (_, i) => i + 1).map((n) => (
              // (not a seven: the first number is said out loud, and those are a 过)
              <button key={n} type="button" className="num-btn tabular" disabled={n % 7 === 0 || String(n).includes("7")} onClick={() => g("sevens", { start: n })}>
                {n}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <Waiting>{lang === "zh" ? `${drawerName} 在选从几开始` : `${drawerName} is picking the start`}</Waiting>
      );

    case "sevens":
      return <SevensPanel v={v} />;

    default:
      return null;
  }
}

function GrabPanel({ v }: { v: RogueView }) {
  const { me, g, nameOf, offset } = useRoom();
  const { lang } = useStore();
  const gr = v.grab!;
  const mine = gr.claimed[me];
  const watching = useWatching();
  const order = Object.entries(gr.claimed).sort((a, b) => a[1] - b[1]);
  return (
    <div className="stack game-panel" style={{ gap: 12 }}>
      <div className="row draw-head">
        <TimerArc seconds={15} running endsAt={gr.endsAt} offset={offset} size={56} />
        <p className="hint">{lang === "zh" ? "抢着按下一个数字" : "Race for the next number"}</p>
      </div>
      {watching ? null : mine === undefined ? (
        <motion.button
          key={gr.next}
          type="button"
          className="grab-btn en-display"
          initial={{ scale: 0.85, opacity: 0.4 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: "spring", stiffness: 500, damping: 20 }}
          whileTap={{ scale: 0.92 }}
          onPointerDown={() => {
            g("grab", { n: gr.next });
            haptic(12);
          }}
        >
          {gr.next}
        </motion.button>
      ) : (
        <p className="grab-mine">
          {lang === "zh" ? "你抢到了" : "You got"} <span className="en-display">{mine}</span>
        </p>
      )}
      <div className="grab-claims">
        {order.map(([pid, n]) => (
          <motion.span key={pid} className={`called-chip ${pid === me ? "is-me" : ""}`} layout initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
            <span className="en-display">{n}</span>
            <span className="called-who">{nameOf(pid)}</span>
          </motion.span>
        ))}
      </div>
    </div>
  );
}

function SevensPanel({ v }: { v: RogueView }) {
  const { me, g, nameOf, offset } = useRoom();
  const { lang } = useStore();
  const sv = v.sevens!;
  const speaking = sv.speaker === me;
  return (
    <div className="stack game-panel" style={{ gap: 12 }}>
      <div className="sevens-log">
        {sv.log.map((x, i) => (
          <span key={i} className="sevens-entry">
            <span className="en-display">{x.pass ? (lang === "zh" ? "过" : "pass") : x.n}</span>
            <span className="called-who">{nameOf(x.pid)}</span>
          </span>
        ))}
      </div>
      <div className="row draw-head">
        <TimerArc key={`${sv.n}`} seconds={5} running endsAt={sv.endsAt} offset={offset} size={56} />
        <p className={speaking ? "turn-name" : "hint"}>{speaking ? (lang === "zh" ? "到你了：报数还是过？" : "You're up: say it or pass?") : lang === "zh" ? `轮到 ${nameOf(sv.speaker)}` : `${nameOf(sv.speaker)} is up`}</p>
      </div>
      {speaking && (
        <div className="row" style={{ gap: 10 }}>
          <button type="button" className="btn btn-porcelain btn-lg btn-block en-display sevens-num" onClick={() => g("say", { pass: false })}>
            {sv.n}
          </button>
          <button type="button" className="btn btn-gold btn-lg btn-block" onClick={() => g("say", { pass: true })}>
            {lang === "zh" ? "过" : "Pass"}
          </button>
        </div>
      )}
    </div>
  );
}

/* ---------------- standing powers ---------------- */

const BADGE: Record<keyof RogueHolders, Rank> = { buddy: "2", camera: "5", nose: "6", wc: "8", trouble: "10" };

function Powers({ v }: { v: RogueView }) {
  const { me, g, nameOf } = useRoom();
  const { ui, lang } = useStore();
  const pen = usePenaltyText();
  const watching = useWatching();
  const [troubleOpen, setTroubleOpen] = useState(false);
  const [wcAsk, setWcAsk] = useState(false);
  const held = (Object.keys(BADGE) as (keyof RogueHolders)[]).filter((k) => v.holders[k]);
  // while another power is on, or a timed round (三园, 抢数字, 逢七过) that the camera or the nose would cover
  const busy = !!v.interrupt || v.phase === "garden" || v.phase === "grab" || v.phase === "sevens";
  const iHave = (k: keyof RogueHolders) => v.holders[k] === me;
  const myWc = iHave("wc") && !v.wcUsed;
  // the pass is good for one visit, the camera and the nose for one call each, until the next card of theirs
  const spent = (k: keyof RogueHolders) => (k === "wc" ? !!v.wcUsed : k === "camera" || k === "nose" ? !!v.used?.[k] : false);
  const you = lang === "zh" ? "你" : "you";
  const bathroom = lang === "zh" ? "上厕所" : "Bathroom";
  const askBathroom = () => (myWc ? g("wc") : setWcAsk((a) => !a));

  /** What a tap on a held card does on this phone: the holder's own powers, and the pass for anyone. */
  const action = (k: keyof RogueHolders): { words: string; onTap: () => void; disabled?: boolean; quiet?: boolean } | null => {
    if (k === "wc") return watching ? null : { words: bathroom, onTap: askBathroom, quiet: true };
    if (!iHave(k)) return null;
    switch (k) {
      case "camera":
        return { words: lang === "zh" ? "拍照" : "Shoot", onTap: () => g("camera"), disabled: busy || spent("camera") };
      case "nose":
        return { words: lang === "zh" ? "喊摸鼻子" : "Call it", onTap: () => g("nose"), disabled: busy || spent("nose") };
      case "trouble":
        return { words: lang === "zh" ? "谁接话了" : "Who answered?", onTap: () => setTroubleOpen((o) => !o) };
      default:
        return null;
    }
  };

  return (
    <div className="stack" style={{ gap: 10 }}>
      {/* the powers out on the table: whose, and what a tap does on this phone */}
      {held.length > 0 && (
        <div className="rg-tray">
          {held.map((k) => {
            const who = v.holders[k] === me ? you : nameOf(v.holders[k]);
            const act = action(k);
            return act ? (
              <HeldCard key={k} rank={BADGE[k]} who={who} mine={iHave(k)} action={act.words} quiet={act.quiet} used={spent(k)} disabled={act.disabled} onTap={act.onTap} />
            ) : (
              <HeldCard key={k} rank={BADGE[k]} who={who} mine={iHave(k)} used={spent(k)} />
            );
          })}
        </div>
      )}

      {/* no pass at the table: the bathroom still asks for a drink first (someone just watching goes when they like) */}
      {!v.holders.wc && !watching && (
        <div className="power-dock">
          <button type="button" className="power-btn power-quiet" onClick={askBathroom}>
            <DoorOpen size={18} />
            {bathroom}
          </button>
        </div>
      )}

      <AnimatePresence>
        {troubleOpen && iHave("trouble") && (
          <motion.div key="trouble" className="stack" style={{ gap: 8 }} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
            <p className="hint">{pen.line(t("点接了你话的人，他喝", "Tap whoever answered you. They drink."), t("点接了你话的人，他受罚", "Tap whoever answered you. They take the penalty."))}</p>
            <SeatPicker
              exclude={[me]}
              onPick={(pid) => {
                g("trouble", { target: pid });
                setTroubleOpen(false);
              }}
            />
          </motion.div>
        )}
        {wcAsk && !myWc && (
          <motion.div key="wc" className="wc-ask" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <span>
              {(() => {
                // the pass: nobody's, someone else's, or your own and used up
                const first = pen.isCustom ? (lang === "zh" ? "先受罚再去？" : "Penalty first, then go?") : lang === "zh" ? "先喝一口再去？" : "Drink first, then go?";
                if (!v.holders.wc) return lang === "zh" ? `没人有 WC 票，${first}` : `No pass at the table. ${first}`;
                if (v.holders.wc === me) return lang === "zh" ? `你的 WC 票用过了，${first}` : `Your pass is used up. ${first}`;
                return lang === "zh" ? `WC 票在 ${nameOf(v.holders.wc)} 手上，${first}` : `${nameOf(v.holders.wc)} holds the pass. ${first}`;
              })()}
            </span>
            <div className="row" style={{ gap: 8 }}>
              <button type="button" className="btn btn-ghost btn-sm" onClick={() => setWcAsk(false)}>
                {lang === "zh" ? "不去了" : "Never mind"}
              </button>
              <button
                type="button"
                className="btn btn-penalty btn-sm"
                onClick={() => {
                  g("wc");
                  setWcAsk(false);
                }}
              >
                {pen.isCustom ? ui("iTakeIt") : lang === "zh" ? "我喝" : "I'll drink"}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ---------------- camera and nose: they stop the whole table ---------------- */

function Interrupts({ v }: { v: RogueView }) {
  const { me, g, nameOf, offset } = useRoom();
  const { lang } = useStore();
  const pen = usePenaltyText();
  const it = v.interrupt;
  const [flash, setFlash] = useState(0);
  useRoomEvent((e) => {
    if (e.k === "fx" && e.fx === "camera") setFlash(Date.now());
  });
  const freezeOver = useReached(it?.kind === "camera" && it.phase === "freeze" ? it.endsAt : null);
  const tapped = it?.kind === "nose" && it.tapped.includes(me);
  const watching = useWatching();
  const tapRef = useRef(false);
  useEffect(() => {
    tapRef.current = false;
  }, [it?.kind === "nose" ? it.endsAt : 0]);

  return (
    <>
      <AnimatePresence>
        {flash > 0 && (
          <motion.div key={flash} className="camera-flash" initial={{ opacity: 0.95 }} animate={{ opacity: 0 }} transition={{ duration: 0.7, ease: "easeOut" }} onAnimationComplete={() => setFlash(0)} />
        )}
      </AnimatePresence>
      <AnimatePresence>
        {it && (
          <motion.div key={it.kind === "camera" ? `camera-${it.by}` : `nose-${it.endsAt}`} className="interrupt-layer" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            {it.kind === "camera" ? (
              it.phase === "freeze" && !freezeOver ? (
                <div className="interrupt-stage">
                  {/* the photo, developing: the table holds still until it is done */}
                  <div className="rg-photo">
                    <div className="rg-photo-pic">
                      <p className={`interrupt-big ${lang === "zh" ? "zh-display" : "en-display"}`}>{lang === "zh" ? "定格" : "Freeze"}</p>
                      <TimerArc seconds={ROGUE_MS.freeze / 1000} running endsAt={it.endsAt} offset={offset} size={64} ticking={false} />
                    </div>
                    <p className="rg-photo-line">{it.by === me ? (lang === "zh" ? "看清楚谁在动" : "Watch who moves") : lang === "zh" ? `${nameOf(it.by)} 拍照了，别动` : `${nameOf(it.by)} took a photo. Don't move.`}</p>
                  </div>
                </div>
              ) : it.by === me ? (
                <div className="interrupt-stage">
                  <div className="rg-photo">
                    <div className="rg-photo-pic">
                      <Camera size={44} />
                      <p className="interrupt-sub">{lang === "zh" ? "谁动了？" : "Who moved?"}</p>
                      {/* no answer by the deadline: nobody moved, and the table goes on without the holder */}
                      {it.phase === "judge" && <TimerArc seconds={ROGUE_MS.judge / 1000} running endsAt={it.endsAt} offset={offset} size={48} ticking={false} />}
                    </div>
                    <p className="rg-photo-line">{lang === "zh" ? "你的照片" : "Your photo"}</p>
                  </div>
                  <SeatPicker exclude={[me]} onPick={(pid) => g("moved", { target: pid })} />
                  <button type="button" className="btn btn-ghost" onClick={() => g("moved", {})}>
                    {lang === "zh" ? "没人动" : "Nobody moved"}
                  </button>
                </div>
              ) : (
                <div className="interrupt-stage">
                  <div className="rg-photo">
                    <div className="rg-photo-pic">
                      <Camera size={44} />
                      {it.phase === "judge" && <TimerArc seconds={ROGUE_MS.judge / 1000} running endsAt={it.endsAt} offset={offset} size={48} ticking={false} />}
                    </div>
                    <p className="rg-photo-line">{lang === "zh" ? `${nameOf(it.by)} 在看照片，谁动了谁${pen.isCustom ? "受罚" : "喝"}` : `${nameOf(it.by)} is checking the photo`}</p>
                  </div>
                  {it.phase === "judge" && <p className="hint">{lang === "zh" ? "到点没判，算没人动" : "No call by then: nobody moved"}</p>}
                </div>
              )
            ) : it.by === me ? (
              <div className="interrupt-stage">
                <Hand size={52} className="rg-wiggle" />
                <p className={`interrupt-big ${lang === "zh" ? "zh-display" : "en-display"}`}>{lang === "zh" ? "摸鼻子" : "Nose"}</p>
                <p className="interrupt-sub tabular">
                  {pen.line(t(`已经摸到 ${it.tapped.length} 个，最慢的喝`, `${it.tapped.length} touched. The slowest drinks.`), t(`已经摸到 ${it.tapped.length} 个，最慢的受罚`, `${it.tapped.length} touched. The slowest takes the penalty.`))}
                </p>
                <TimerArc seconds={ROGUE_MS.nose / 1000} running endsAt={it.endsAt} offset={offset} size={72} />
              </div>
            ) : (
              <div className="interrupt-stage">
                <p className="interrupt-sub">{lang === "zh" ? `${nameOf(it.by)} 喊摸鼻子` : `${nameOf(it.by)} says: nose!`}</p>
                {watching ? null : tapped ? (
                  <p className={`interrupt-big ${lang === "zh" ? "zh-display" : "en-display"}`}>{lang === "zh" ? "摸到了" : "Got it"}</p>
                ) : (
                  <motion.button
                    type="button"
                    className="nose-btn"
                    initial={{ scale: 0.6 }}
                    animate={{ scale: [1, 1.06, 1] }}
                    transition={{ duration: 0.5, repeat: Infinity }}
                    onPointerDown={() => {
                      if (tapRef.current) return;
                      tapRef.current = true;
                      g("tap");
                      haptic(20);
                    }}
                  >
                    <Hand size={56} />
                    <span>{lang === "zh" ? "摸鼻子" : "Touch"}</span>
                  </motion.button>
                )}
                <TimerArc seconds={ROGUE_MS.nose / 1000} running endsAt={it.endsAt} offset={offset} size={64} />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
