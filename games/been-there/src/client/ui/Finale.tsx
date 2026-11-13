// The end of the trip. "Game over" comes down like the exit stamp in a passport; the teams are read
// out from last place to first, their money counting up; then the winners: their face, the winner's
// stamp, the stamps in their passport dealt out one by one, and a shower of paper. Phones and the big
// screen show the same, the big screen larger and side by side.
import { useEffect, useState } from "preact/hooks";
import type { RoomView } from "../../room/protocol";
import type { Mood } from "../art/characters";
import { Stamp } from "../art/stamps";
import { buzz } from "../controls";
import { backToTable, tableFrom } from "../base";
import { getLang, money, t, type Key } from "../i18n";
import { sfx } from "../sound";
import { send, serverNow } from "../store";
import { reducedMotion } from "./Board";
import { Btn, TEAM_COLORS, TeamChip, TeamFace, seatName, teamOf } from "./common";
import { Feed } from "./Game";
import { ReportCard } from "./ReportCard";

/** The big screen turns between the standings and the report card, this long each (ms). */
const TURN_MS = 12_000;

/** Seconds from the end of the game: the stamp lands, then a team every half second, last place first. */
const STAMP_AT = 0.3;
const FIRST_AT = 1.1;
const EACH = 0.55;
/** As many passport stamps as fit in two rows on a phone, and in one on the big screen. */
const TRIP = 12;
const TRIP_BIG = 7;

export function Over({ v, big }: { v: RoomView; big?: boolean }) {
  const g = v.game!;
  const s = g.s;
  const order = s.ps.map((_, seat) => seat).sort((a, b) => (b === s.winner ? 1 : 0) - (a === s.winner ? 1 : 0) || g.worth[b] - g.worth[a]);
  const still = reducedMotion();
  // Every screen keeps the same clock, from the moment the game ended, so the stamps land together;
  // a phone that comes back later just finds the result.
  const [since] = useState(() => {
    for (let i = v.feed.length - 1; i >= 0; i--) {
      const f = v.feed[i];
      if (f.t === "game" && f.e.t === "over") return Math.max(0, (serverNow() - f.at) / 1000);
    }
    return 0;
  });
  // When the team at `rank` comes in (the winners, rank 0, last), in seconds from now.
  const at = (rank: number) => (still ? 0 : FIRST_AT + (order.length - 1 - rank) * EACH - since);
  const ours = s.winner !== null && v.you.seats.includes(s.winner);
  // The big screen has no room for both: once the teams are in, it turns between them and the report
  // card (the winners' card stays). A phone shows the card under the standings.
  const [report, setReport] = useState(false);
  useEffect(() => {
    if (!big || !g.tally) return;
    let timer: ReturnType<typeof setTimeout>;
    const turn = (on: boolean, wait: number) => {
      timer = setTimeout(() => {
        setReport(on);
        turn(!on, TURN_MS);
      }, wait);
    };
    turn(true, Math.max(0, at(0) * 1000) + TURN_MS);
    return () => clearTimeout(timer);
  }, [big, !!g.tally]);
  const table = v.settings.hotseat ? null : tableFrom(v);
  // Nobody holds the big screen's remote: two minutes after the results it goes back to the table.
  useEffect(() => {
    if (!big || !table) return;
    const back = setTimeout(() => backToTable(table, { screen: true, over: v.code }), Math.max(20_000, 120_000 - since * 1000));
    return () => clearTimeout(back);
  }, []);
  useEffect(() => {
    const cheer = () => {
      sfx.win();
      if (ours) buzz([40, 60, 40, 60, 160]);
    };
    if (still) return cheer();
    // (a sound whose moment has gone by stays quiet)
    const later = (when: number, play: () => void) => (when > -0.25 ? setTimeout(play, Math.max(0, when) * 1000) : undefined);
    const timers = [later(STAMP_AT - since, sfx.stamp), later(at(0), cheer)];
    return () => timers.forEach(clearTimeout);
  }, []);
  return (
    <main class={`over${big ? " big" : ""}`} style={{ "--stamp-at": `${STAMP_AT - since}s` }}>
      <header class="exit-stamp">
        <h1>{t("gameOver")}</h1>
        <p class="num">
          {today()} · {t("room")} {v.code}
        </p>
      </header>
      <ol class={`results${s.winner !== null ? " with-won" : ""}${report ? " reporting" : ""}`}>
        {order.map((seat, rank) => (
          <Row key={seat} v={v} seat={seat} rank={rank} at={at(rank)} big={big} />
        ))}
        {big && report && (
          <li class="report-slot">
            <ReportCard v={v} big />
          </li>
        )}
      </ol>
      {!big && <ReportCard v={v} at={at(0) + 1.2} />}
      {s.winner !== null && !still && at(0) > -3 && <Confetti at={at(0)} many={big} />}
      {(v.you.host || table) && (
        <div class="over-again" style={{ "--at": `${at(0) + 0.8}s` }}>
          {table && (
            <Btn kind={v.you.host ? "quiet" : "primary"} wide onClick={() => backToTable(table, { screen: big, over: v.code })}>
              {t("backToTable")}
            </Btn>
          )}
          {v.you.host && (
            <Btn kind="primary" wide onClick={() => send({ t: "again" })}>
              {t("again")}
            </Btn>
          )}
        </div>
      )}
      {!big && <Feed v={v} n={12} />}
    </main>
  );
}

/** Today, the way an exit stamp prints it. */
function today() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}·${p(d.getMonth() + 1)}·${p(d.getDate())}`;
}

function Row({ v, seat, rank, at, big }: { v: RoomView; seat: number; rank: number; at: number; big?: boolean }) {
  const g = v.game!;
  const s = g.s;
  const p = s.ps[seat];
  const team = teamOf(v, seat);
  const owned = s.deeds.filter((d) => d?.owner === seat).length;
  const facts = [
    t("finalCities", { n: owned }),
    t("finalStamps", { n: p.stamps.length }),
    t("rentCollected", { amount: money(s.stats.rentByOwner[seat] ?? 0) }),
  ].join(" · ");
  const style = { "--at": `${at}s`, "--team": TEAM_COLORS[team?.color ?? 0] };
  if (seat === s.winner) {
    const lang = getLang();
    const trip = big ? TRIP_BIG : TRIP;
    return (
      <li class="won" style={style}>
        <div class="medal">
          <TeamFace color={team?.color ?? 0} size={big ? 170 : 96} mood="happy" />
        </div>
        <div class="won-text">
          <p class="won-name">{t("winner", { team: seatName(v, seat) })}</p>
          <p class="muted">{t(`reason_${s.reason}` as Key)}</p>
          <p class="worth">
            <CountUp to={g.worth[seat]} at={at} />
          </p>
          <small class="muted">{facts}</small>
        </div>
        <span class="champion" aria-hidden="true">
          {t("champion")}
        </span>
        {p.stamps.length > 0 && (
          <div class="trip" aria-hidden="true">
            {p.stamps.slice(0, trip).map((id, i) => (
              <span key={id} style={{ "--i": i }}>
                <Stamp id={id} size={big ? 84 : 54} turn={(i % 2 ? 1 : -1) * (3 + ((i * 7) % 10))} lang={lang} />
              </span>
            ))}
            {p.stamps.length > trip && <b class="num">+{p.stamps.length - trip}</b>}
          </div>
        )}
      </li>
    );
  }
  const mood: Mood = p.out || rank === s.ps.length - 1 ? "sad" : "idle";
  return (
    <li class={p.out ? "broke" : undefined} style={style}>
      <span class="rank num">{rank + 1}</span>
      <TeamChip team={team} mood={mood} />
      {p.out && <span class="tag">{t("out")}</span>}
      <span class="worth">
        <CountUp to={g.worth[seat]} at={at} />
      </span>
      <small class="muted">{facts}</small>
    </li>
  );
}

/** Money that counts up from nothing once its row comes in. */
function CountUp({ to, at }: { to: number; at: number }) {
  const [n, setN] = useState(at > 0 ? 0 : to);
  useEffect(() => {
    if (at <= 0) return setN(to);
    let raf = 0;
    const start = performance.now() + at * 1000;
    const step = (now: number) => {
      const k = Math.min(1, Math.max(0, (now - start) / 800));
      setN(Math.round(to * (1 - (1 - k) ** 3)));
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, at]);
  return <span class="num">{money(n)}</span>;
}

/** Paper in the teams' colours, the ticket red and gold, falling once: on the big screen more of it,
    tumbling in 3D; on a phone less, and flat, so a mid-range phone keeps its frame rate. */
const PAPER = [...TEAM_COLORS, "#c8432b", "#e0a526", "#fbf4e4"];

function Confetti({ at, many }: { at: number; many?: boolean }) {
  const [pieces] = useState(() =>
    Array.from({ length: many ? 44 : 24 }, (_, i) => ({
      left: `${Math.random() * 100}%`,
      width: `${6 + Math.random() * 6}px`,
      height: `${9 + Math.random() * 9}px`,
      background: PAPER[i % PAPER.length],
      "--d": `${2.6 + Math.random() * 1.8}s`,
      "--delay": `${at + Math.random() * 0.9}s`,
      "--sway": `${(Math.random() - 0.5) * 220}px`,
      "--spin": `${(Math.random() - 0.5) * 900}deg`,
      "--flip": `${360 + Math.random() * 720}deg`,
    })),
  );
  const [gone, setGone] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setGone(true), (at + 6) * 1000);
    return () => clearTimeout(id);
  }, []);
  if (gone) return null;
  return (
    <div class="confetti" aria-hidden="true">
      {pieces.map((style, i) => (
        <i key={i} style={style} />
      ))}
    </div>
  );
}
