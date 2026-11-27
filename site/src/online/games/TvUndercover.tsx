import { EyeOff, Mic, Search } from "lucide-react";
import { useLayoutEffect, useRef } from "react";
import { Figure } from "../../components/Figure";
import { gsap, reduced } from "../../lib/anim";
import { sfx } from "../../lib/sfx";
import type { SeatView, UcRole, UndercoverView } from "../../shared/protocol";
import { Bi, DoneBadge, FacesIn, RoundTag, Stamp, stampIn, TvClock, TvLineup, TvShow, useArrivals, useBeat, useLang, useSeats, type Person } from "../../tv/show";
import type { TvViewProps } from "../../tv/views";
import "../../styles/tv-undercover.css";

const TALK_MS = 40_000;
const VOTE_MS = 60_000;
const GUESS_MS = 45_000;

/**
 * 谁是卧底 on the big screen: an interrogation room under one hanging lamp. While the words are
 * read, a card over every head; then whoever is describing stands in the lamp's light, with what
 * everyone has said down the side; the vote lights up who has voted (never for whom); the one
 * voted out takes the stamp of what they really were; at the end both words, and every side.
 * A tie sends the tied players back under the lamp for a run-off; a blank voted out stands there
 * guessing the civilians' word. No word, and no role, is on this screen before the game says it.
 */
export default function TvUndercover({ v, sound }: TvViewProps<UndercoverView>) {
  const { zh } = useLang();
  const runoff = v.pk.length > 0 && (v.phase === "talk" || v.phase === "vote");
  const clock =
    v.phase === "talk" ? (
      <TvClock key={`t${v.round}-${runoff ? "pk" : ""}${v.speaker}`} endsAt={v.endsAt} total={TALK_MS} sound={sound} />
    ) : v.phase === "vote" ? (
      <TvClock key={`v${v.round}${runoff ? "pk" : ""}`} endsAt={v.endsAt} total={VOTE_MS} sound={sound} />
    ) : v.phase === "guess" ? (
      <TvClock key={`g${v.round}`} endsAt={v.endsAt} total={GUESS_MS} sound={sound} />
    ) : null;
  const tag = v.round > 0 && v.phase !== "setup" ? <RoundTag>{zh ? `第 ${v.round} 轮${runoff ? " · 加赛" : ""}` : `Round ${v.round}${runoff ? " · run-off" : ""}`}</RoundTag> : null;
  return (
    <TvShow game="undercover" className="tvu" phase={v.phase} round={tag} clock={clock} set={<Lamp on={v.phase === "talk" || v.phase === "reveal" || v.phase === "guess"} />}>
      {v.phase === "setup" && <Setup v={v} />}
      {v.phase === "word" && <Words v={v} sound={sound} />}
      {v.phase === "talk" && <Talk v={v} sound={sound} />}
      {v.phase === "vote" && <Vote v={v} sound={sound} />}
      {v.phase === "guess" && <Guess v={v} sound={sound} />}
      {v.phase === "reveal" && <Reveal v={v} sound={sound} />}
      {v.phase === "end" && <End v={v} />}
    </TvShow>
  );
}

/** The room: blinds striping the back wall, one lamp hanging over the middle. */
function Lamp({ on }: { on: boolean }) {
  return (
    <>
      <i className="tvu-blinds" />
      <i className={`tvu-cone ${on ? "is-on" : ""}`} />
      <i className="tvu-lamp" />
    </>
  );
}

/** "Amy、Ben" / "Amy and Ben", "Amy, Ben and Cat" */
const joined = (names: string[], zh: boolean) => (zh || names.length < 2 ? names.join("、") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

const roleName = (r: UcRole, zh: boolean) => (r === "civ" ? (zh ? "平民" : "Civilian") : r === "uc" ? (zh ? "卧底" : "Undercover") : zh ? "白板" : "Blank");

/* ------------------------------------------------------------------ before the deal */

function Setup({ v }: { v: UndercoverView }) {
  const { zh } = useLang();
  const { players } = useSeats();
  const enough = players.length >= 4;
  return (
    <div className="tvu-setup">
      <div className="tvu-file">
        <span className="tvu-file-tab">{zh ? "案件档案" : "Case file"}</span>
        <ul className="tvu-file-rows">
          <li>
            <span>{zh ? "卧底" : "Undercover"}</span>
            <b className="tabular">× {v.uc}</b>
          </li>
          <li>
            <span>{zh ? "白板" : "A blank"}</span>
            <b>{v.blank ? (zh ? "有一个" : "One") : zh ? "没有" : "None"}</b>
          </li>
          <li>
            <span>{zh ? "词库" : "Words"}</span>
            <b>{v.adult ? (zh ? "成人档" : "Adults only") : zh ? "日常" : "Everyday"}</b>
          </li>
          <li>
            <span>{zh ? "在座" : "Seated"}</span>
            <b className="tabular">{players.length}</b>
          </li>
        </ul>
        <p className="tvu-file-note">{enough ? (zh ? "主人在手机上发词" : "The host deals the words on their phone") : zh ? `至少 4 个人，还差 ${4 - players.length} 个` : `Needs 4 players: ${4 - players.length} more`}</p>
      </div>
      <TvLineup people={players.map((s) => ({ seat: s }))} big={220} />
    </div>
  );
}

/* ------------------------------------------------------------------ everyone reads their word */

function Words({ v, sound }: { v: UndercoverView; sound: boolean }) {
  const { zh } = useLang();
  const { players } = useSeats();
  useArrivals(v.ready, sound);
  const people: Person[] = players.map((s) => {
    const dealt = v.inGame.includes(s.id);
    const ready = v.ready.includes(s.id);
    return {
      seat: s,
      state: !dealt ? "dim" : ready ? "ready" : "idle",
      badge: ready ? <DoneBadge /> : undefined,
      tag: dealt && !ready ? <span className="tvu-card" aria-hidden="true" /> : !dealt ? (zh ? "下一局" : "Next game") : undefined,
    };
  });
  return (
    <div className="tvu-words">
      <h1 className="tvu-head">
        <EyeOff size={54} strokeWidth={2.2} />
        <Bi t={v.redeals > 0 ? { zh: "换了一组新词，大家再看一次", en: "A fresh pair: everyone looks again" } : { zh: "每个人在偷偷看自己的词", en: "Everyone is reading their word in secret" }} />
      </h1>
      <p className="tvu-sub">
        {zh ? "大多数人是同一个词，卧底的词和大家的很像。记住它，别让人看见。" : "Most share one word; the undercover's is close to it. Remember it, and keep it hidden."}
        <span className="tvu-count tabular">
          <b>{v.ready.length}</b>/{v.alive.length}
          <small>{zh ? " 记住了" : " ready"}</small>
        </span>
      </p>
      <TvLineup people={people} big={220} />
    </div>
  );
}

/* ------------------------------------------------------------------ describing */

function Talk({ v, sound }: { v: UndercoverView; sound: boolean }) {
  const { zh } = useLang();
  const { seat } = useSeats();
  const speaker = v.order[v.speaker] ?? null;
  const who = seat(speaker);
  const order = v.order.filter((pid) => v.alive.includes(pid));
  const spot = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    if (sound) sfx.woodblock(1.1, 0.7);
    if (reduced() || !spot.current) return;
    const tw = gsap.fromTo(spot.current, { opacity: 0, y: 40, scale: 0.9 }, { opacity: 1, y: 0, scale: 1, duration: 0.6, ease: "back.out(1.6)" });
    return () => {
      tw.progress(1);
      tw.kill();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [speaker, v.round]);
  return (
    <div className="tvu-talk">
      <div className="tvu-spot" ref={spot} key={speaker ?? ""}>
        {who && (
          <>
            <span className="tvu-spot-fig">
              <Figure seat={who} />
            </span>
            <p className="tvu-spot-name">
              <Mic size={44} strokeWidth={2.2} />
              {who.name}
            </p>
            <p className="tvu-spot-what">{zh ? "在描述自己的词" : "is describing their word"}</p>
          </>
        )}
      </div>
      <aside className="tvu-said">
        <h2>{v.pk.length ? (zh ? "平票加赛：再各说一句" : "Tie run-off: one more line each") : zh ? "说过的话" : "What's been said"}</h2>
        <ol>
          {order.map((pid) => {
            const i = v.order.indexOf(pid);
            const state = i < v.speaker ? "done" : i === v.speaker ? "now" : "next";
            const s = seat(pid);
            // what they typed in the rounds before, newest first: a story that changes gives people away
            const before = v.said
              .filter((r) => r.desc[pid])
              .map((r) => r.desc[pid])
              .reverse()
              .slice(0, 2);
            return (
              <li key={pid} className={`is-${state}`}>
                {s && <FacesIn seats={[s]} size={46} />}
                <span className="tvu-said-name">{s?.name ?? "?"}</span>
                <span className="tvu-said-text">{v.desc[pid] ? v.desc[pid] : state === "done" ? (zh ? "（口头说了）" : "(said it aloud)") : state === "now" ? (zh ? "正在说…" : "speaking…") : zh ? "等着说" : "up next"}</span>
                {before.length > 0 && <span className="tvu-said-before">{`${zh ? "之前：" : "Before: "}${before.join(zh ? " · " : " · ")}`}</span>}
              </li>
            );
          })}
        </ol>
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------------ the vote */

function Vote({ v, sound }: { v: UndercoverView; sound: boolean }) {
  const { zh } = useLang();
  const { seat } = useSeats();
  useArrivals(v.voted, sound);
  const alive = v.alive.map((pid) => seat(pid)).filter((s): s is SeatView => !!s);
  const out = v.inGame.filter((pid) => !v.alive.includes(pid)).map((pid) => seat(pid)).filter((s): s is SeatView => !!s);
  const voted = v.voted.filter((pid) => v.voters.includes(pid)).length;
  const runoff = v.pk.length > 0;
  const names = joined(
    v.pk.map((pid) => seat(pid)?.name ?? "?"),
    zh,
  );
  return (
    <div className="tvu-vote">
      <h1 className="tvu-head">
        <Search size={54} strokeWidth={2.4} />
        <Bi t={runoff ? { zh: "加赛投票：只在平票的人里选", en: "Run-off: vote between the tied" } : { zh: "投票：谁是卧底？", en: "Vote: who's the undercover?" }} />
      </h1>
      <p className="tvu-sub">
        {runoff ? (zh ? `${names} 平票，其他人在手机上只在他们中间投` : `${names} tied. Everyone else votes between them on their phone.`) : zh ? "在手机上投给你怀疑的人，票最多的出局" : "Vote on your phone for who you suspect. The most votes is out."}
        <span className="tvu-count tabular">
          <b>{voted}</b>/{v.voters.length}
          <small>{zh ? " 投了" : " voted"}</small>
        </span>
      </p>
      <TvLineup
        people={alive.map((s) => {
          const inRunoff = runoff && v.pk.includes(s.id);
          return {
            seat: s,
            state: inRunoff ? "spot" : v.voted.includes(s.id) ? "voted" : "idle",
            badge: v.voted.includes(s.id) ? <DoneBadge /> : undefined,
            tag: inRunoff ? (zh ? "加赛" : "Run-off") : undefined,
            under: v.desc[s.id] ? <span className="tvu-clue">{v.desc[s.id]}</span> : undefined,
          };
        })}
        big={210}
      />
      {out.length > 0 && (
        <p className="tvu-gone">
          <span>{zh ? "已出局" : "Out"}</span>
          <FacesIn seats={out} size={40} />
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ the blank's last guess */

function Guess({ v, sound }: { v: UndercoverView; sound: boolean }) {
  const { zh } = useLang();
  const { seat } = useSeats();
  const who = v.out ? seat(v.out.pid) : undefined;
  const root = useRef<HTMLDivElement>(null);
  useBeat(
    (tl, q) => {
      if (sound) tl.call(() => sfx.stamp(0.9), [], 0.9);
      tl.fromTo(q(".tvu-out-fig"), { opacity: 0, y: 60, scale: 0.85 }, { opacity: 1, y: 0, scale: 1, duration: 0.7, ease: "back.out(1.5)" }, 0.1);
      stampIn(tl, q(".tvu-out-stamp .tvx-stamp"), 0.8);
      tl.fromTo(q(".tvu-out-line, .tvu-guess-note"), { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.4 }, 1.2);
    },
    root,
    [v.round, v.out?.pid ?? ""],
  );
  return (
    <div className="tvu-reveal" ref={root}>
      <div className="tvu-out is-caught">
        {who && (
          <>
            <span className="tvu-out-fig">
              <Figure seat={who} />
            </span>
            <p className="tvu-out-name">{zh ? `${who.name} 出局` : `${who.name} is out`}</p>
            <span className="tvu-out-stamp">
              <Stamp tone="stop" held>
                {zh ? "白板！" : "The blank!"}
              </Stamp>
            </span>
            <p className="tvu-out-line">{zh ? "最后一搏：正在猜平民的词" : "One last shot: guessing the civilians' word"}</p>
          </>
        )}
      </div>
      <aside className="tvu-tally">
        <h2>{zh ? "白板猜词" : "The blank's guess"}</h2>
        <p className="tvu-guess-note">{zh ? "猜中了，白板一个人赢，其他人全输；猜错了，游戏接着玩。" : "Right, and the blank wins alone while everyone else loses. Wrong, and the game goes on."}</p>
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------------ out */

function Reveal({ v, sound }: { v: UndercoverView; sound: boolean }) {
  const { zh } = useLang();
  const { seat } = useSeats();
  const out = v.out ? seat(v.out.pid) : undefined;
  const role = v.out?.role ?? "civ";
  const caught = !!v.out && role !== "civ";
  const root = useRef<HTMLDivElement>(null);
  // who voted for whom: out in the open now
  const tally: Record<string, string[]> = {};
  for (const [voter, target] of Object.entries(v.votes ?? {})) (tally[target] ??= []).push(voter);
  const rows = Object.entries(tally).sort((a, b) => b[1].length - a[1].length);
  const key = `${v.round}:${v.out?.pid ?? "tie"}`;
  // a drum roll, whoever is out steps into the light, and what they were slams onto them
  useBeat(
    (tl, q) => {
      if (sound) tl.call(() => sfx.drumroll(1.1), [], 0);
      tl.fromTo(q(".tvu-out-fig"), { opacity: 0, y: 60, scale: 0.85 }, { opacity: 1, y: 0, scale: 1, duration: 0.7, ease: "back.out(1.5)" }, 0.2);
      tl.fromTo(q(".tvu-out-name, .tvu-tie"), { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.4 }, 0.5);
      tl.fromTo(q(".tvu-tally li"), { opacity: 0, x: 40 }, { opacity: 1, x: 0, duration: 0.4, stagger: 0.1 }, 0.4);
      stampIn(tl, q(".tvu-out-stamp .tvx-stamp"), 1.2);
      tl.fromTo(q(".tvu-out-line"), { opacity: 0 }, { opacity: 1, duration: 0.3 }, 1.5);
      if (caught) tl.fromTo(q(".tvu-out-fig"), { x: -12 }, { x: 0, duration: 0.6, ease: "elastic.out(1.6, 0.15)" }, 1.35);
      if (sound && v.out) tl.call(() => (caught ? sfx.stamp(0.9) : sfx.sadTrombone(0.6)), [], 1.25);
    },
    root,
    [key],
  );
  return (
    <div className="tvu-reveal" ref={root}>
      <div className={`tvu-out ${caught ? "is-caught" : v.out ? "is-civ" : "is-tie"}`}>
        {out ? (
          <>
            <span className="tvu-out-fig">
              <Figure seat={out} />
            </span>
            <p className="tvu-out-name">{zh ? `${out.name} 出局` : `${out.name} is out`}</p>
            <span className="tvu-out-stamp">
              <Stamp tone={caught ? "stop" : "moon"} held>
                {caught ? (role === "uc" ? (zh ? "卧底！" : "Undercover!") : zh ? "白板！" : "The blank!") : zh ? "平民" : "Civilian"}
              </Stamp>
            </span>
            <p className="tvu-out-line">
              {v.guess
                ? v.guess.right
                  ? zh
                    ? `白板猜中了：${v.guess.text}！`
                    : `The blank guessed it: ${v.guess.text}!`
                  : v.guess.text
                    ? zh
                      ? `白板猜：${v.guess.text}，没猜中`
                      : `The blank guessed "${v.guess.text}": wrong`
                    : zh
                      ? "白板没猜出来"
                      : "The blank didn't guess in time"
                : caught
                  ? zh
                    ? "抓到了！"
                    : "Caught!"
                  : zh
                    ? "冤枉了一个好人"
                    : "An innocent, voted out"}
            </p>
          </>
        ) : v.pk.length ? (
          <div className="tvu-tie">
            <Bi t={{ zh: "平票，加赛！", en: "A tie: run-off!" }} />
            <p>{zh ? `${joined(v.pk.map((pid) => seat(pid)?.name ?? "?"), zh)} 再各说一句，其他人只在他们中间投` : `${joined(v.pk.map((pid) => seat(pid)?.name ?? "?"), zh)} say one more line each; the rest vote between them`}</p>
          </div>
        ) : (
          <div className="tvu-tie">
            <Bi t={{ zh: "平票，这轮没人出局", en: "A tie. Nobody is out this round." }} />
            <p>{zh ? "接着描述，再投一轮" : "Describe again, then vote again"}</p>
          </div>
        )}
      </div>
      <aside className="tvu-tally">
        <h2>{zh ? "谁投了谁" : "Who voted for whom"}</h2>
        <ul>
          {rows.map(([target, voters]) => {
            const s = seat(target);
            return (
              <li key={target} className={target === v.out?.pid ? "is-out" : ""}>
                <span className="tvu-tally-who">
                  <span className="tvu-tally-name">{s?.name ?? "?"}</span>
                  <b className="tabular">{voters.length}</b>
                </span>
                <FacesIn seats={voters.map((p) => seat(p))} size={42} />
              </li>
            );
          })}
        </ul>
        {v.winner && <p className="tvu-tally-end">{zh ? "胜负已分，主人点「看结果」" : "That settles it. The host shows the result."}</p>}
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------------ the end */

function End({ v }: { v: UndercoverView }) {
  const { zh, tr, other } = useLang();
  const { seat } = useSeats();
  const roles = v.roles ?? {};
  const civWin = v.winner === "civ";
  const civ = Object.keys(roles).filter((pid) => roles[pid] === "civ");
  const side = Object.keys(roles).filter((pid) => roles[pid] !== "civ");
  // a blank who guessed the word wins alone: the undercovers on their side lose with the civilians
  const won = (pid: string) => (v.winner === "civ" ? roles[pid] === "civ" : v.winner === "blank" ? roles[pid] === "blank" : roles[pid] !== "civ");
  const people = (ids: string[]): Person[] =>
    ids
      .map((pid) => seat(pid))
      .filter((s): s is SeatView => !!s)
      .map((s) => ({ seat: s, state: won(s.id) ? "win" : "lose", tag: roleName(roles[s.id], zh) }));
  return (
    <div className="tvu-end">
      <h1 className={`tvu-winner ${civWin ? "is-civ" : "is-uc"}`}>
        <Stamp tone={civWin ? "go" : "stop"}>{civWin ? (zh ? "平民赢了！" : "Civilians win!") : v.winner === "blank" ? (zh ? "白板猜中，白板赢了！" : "The blank guessed it and wins!") : zh ? "卧底赢了！" : "The undercover side wins!"}</Stamp>
      </h1>
      {v.pair && (
        <div className="tvu-pair">
          <div className="tvu-word is-civ">
            <span className="tvu-word-who">{zh ? "平民的词" : "Civilians' word"}</span>
            <b>{tr(v.pair.civ)}</b>
            <small>{other(v.pair.civ)}</small>
          </div>
          <span className="tvu-vs">VS</span>
          <div className="tvu-word is-uc">
            <span className="tvu-word-who">{zh ? "卧底的词" : "Undercover's word"}</span>
            <b>{tr(v.pair.uc)}</b>
            <small>{other(v.pair.uc)}</small>
          </div>
        </div>
      )}
      <div className="tvu-sides">
        <TvLineup people={people(civ)} big={civ.length > 6 ? 170 : 200} className="tvu-side" />
        <TvLineup people={people(side)} big={200} className="tvu-side is-uc" />
      </div>
    </div>
  );
}
