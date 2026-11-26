// One table on a phone: lobby → round 1 (mood) → round 2 (cards) → spinner → result.
import { Check, Copy, Share2, TriangleAlert } from "lucide-preact";
import type { ComponentChildren } from "preact";
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { BASE } from "../../base";
import { CUISINES, OCCASIONS, TOP_COUNT, type Limits, type MoodPick, type OccasionId, type RangeId } from "../../engine";
import { PATHS, groupState, leafText, setAll, type Group, type Leaf, type PathId, type Picks } from "../paths";
import { TIMING, type RoomView } from "../../room/protocol";
import { t, tx, type Key } from "../i18n";
import { api } from "../net";
import { prefs } from "../prefs";
import { send, serverNow, toast, useApp } from "../store";
import { buzz, duration, fillFrom, moodTap, play, reduced } from "../motion";
import { Avatar, Btn, DemoBanner, Dock, Message, MotionScreen, Qr, TableLimits, TopBar, memberName, useBackCloses } from "./common";
import { DietCard } from "./DietCard";
import { PlaceCard } from "./PlaceCard";
import { RangePicker } from "./RangePicker";
import { RankedList } from "./RankedList";
import { OccasionPicker } from "./OccasionPicker";
import { WhenPicker } from "./WhenPicker";
import { whenLabel } from "../when";

/**
 * What places for each occasion usually cost a person at least: a diet card budget below it would
 * leave most of them off the list, so the lobby says so (to that person only; budgets are private).
 */
const OCCASION_BUDGET: Partial<Record<OccasionId, number>> = { business: 60, date: 35, birthday: 35 };

function lowBudget(v: RoomView): boolean {
  const floor = OCCASION_BUDGET[v.occasion];
  const b = v.you.limits?.budget ?? 0;
  return !!floor && b > 0 && b < floor;
}

export function Table({ home }: { home: () => void }) {
  const { view: v, status, fatal, me } = useApp();
  if (fatal) {
    return (
      <main class="page">
        <TopBar title="title" home={home} />
        <Message error>{t(fatal === "identity" ? "identity" : fatal === "full" ? "roomFull" : "noRoom")}</Message>
        <Btn onClick={home}>{t("home")}</Btn>
      </main>
    );
  }
  if (!v) return <main class="page center muted"><TopBar title="title" home={home} /><p>{t("connecting")}</p></main>;
  // Without a diet card, that comes first, in any round before the result: someone who joins late
  // (or was still filling it in when the host started) still gets notes on the cards for what they
  // can't eat, and their budget. The card stays on screen across phase changes, so nothing typed is lost.
  const showDiet = !v.you.limits && v.phase !== "spin" && v.phase !== "result";
  return (
    <main class={`page phase-${v.phase}`}>
      <TopBar
        title={showDiet ? "table" : v.phase === "mood" ? "round1" : v.phase === "cards" ? "round2" : v.phase === "result" || v.phase === "spin" ? "pickTitle" : "table"}
        vars={{ code: v.code }} home={home} noBack={v.phase === "result" || v.phase === "spin"}
      />
      {status === "reconnecting" && <Message>{t("reconnecting")}</Message>}
      <DemoBanner demo={v.demo} />
      {showDiet && v.phase !== "lobby" && <Message>{t("dietLate")}</Message>}
      <MotionScreen scene={showDiet ? "diet" : v.phase}>
        {showDiet ? (
          <DietCard
            initial={me?.card ?? null}
            saved={!!me?.user}
            onDone={(l) => {
              send({ t: "limits", limits: l });
              if (me?.user) void api("/api/me/card", { method: "PUT", body: JSON.stringify(l) });
            }}
          />
        ) : v.phase === "lobby" || v.phase === "finding" ? (
          <Lobby v={v} />
        ) : v.phase === "mood" ? (
          <Mood v={v} />
        ) : v.phase === "cards" ? (
          <Cards v={v} />
        ) : (
          <Result v={v} />
        )}
      </MotionScreen>
    </main>
  );
}

/** Allergies and typed "don't eat"s are listed once above the cards, not on every card. */
const needsServer = (v: RoomView) => Object.keys(v.table.allergies).length > 0 || v.table.custom.length > 0;

/** The link in the QR code and the copy button: changle.ca/eat/r/1234. */
const joinUrl = (code: string) => `${location.origin}${BASE}/r/${code}`;

function Lobby({ v }: { v: RoomView }) {
  const { me } = useApp();
  const [copied, setCopied] = useState(false);
  const [name, setName] = useState(v.you.name || prefs.name);
  // A signed-in phone with no name yet goes by its Google first name (it can still be changed here).
  useEffect(() => {
    const n = me?.user?.name?.trim().slice(0, 16);
    if (!n || v.you.name || prefs.name) return;
    setName(n);
    prefs.name = n;
    send({ t: "name", name: n });
  }, [me?.user?.name]);
  const [editing, setEditing] = useState(false);
  const [range, setRange] = useState<RangeId>(v.range);
  const [when, setWhen] = useState<number | null>(null);
  const [occasion, setOccasion] = useState<OccasionId>(v.occasion);
  // Which of the table's settings the host is changing.
  const [changing, setChanging] = useState<"when" | "occasion" | null>(null);
  const host = v.you.host || !v.members.find((m) => m.host)?.online;
  const ready = v.members.filter((m) => m.ready).length;
  const people = useRef<HTMLUListElement>(null);
  const seen = useRef(new Map<string, boolean>());
  useLayoutEffect(() => {
    if (!people.current) return;
    const hadPeople = seen.current.size > 0;
    for (const member of v.members) {
      const el = Array.from(people.current.children).find((child) => (child as HTMLElement).dataset.member === member.id) as HTMLElement | undefined;
      if (!el) continue;
      if (!seen.current.has(member.id)) {
        play(el, "join");
        if (host && hadPeople) buzz(10);
      }
      if (member.ready && !seen.current.get(member.id)) {
        const badge = el.querySelector<HTMLElement>(".ready-badge");
        if (badge) play(badge, "ready");
      }
      seen.current.set(member.id, member.ready);
    }
    // Do not cancel arrivals when another member's state arrives during the animation.
  });
  if (editing) return <DietCard initial={v.you.limits} onDone={(l: Limits) => (send({ t: "limits", limits: l }), setEditing(false))} />;
  if (v.phase === "finding") return <p class="big center">{t("finding")}</p>;
  return (
    <>
      <section class="invite">
        <Qr text={joinUrl(v.code)} />
        <div>
          <p class="code num">{v.code}</p>
          <p class="muted small">{t("scan", { host: location.host + BASE })}</p>
          <Btn
            kind="quiet"
            onClick={() => {
              void navigator.clipboard?.writeText(joinUrl(v.code)).then(() => setCopied(true));
            }}
          >
            <Copy aria-hidden="true" />{copied ? t("copied") : t("copyLink")}
          </Btn>
        </div>
      </section>

      <section class="card settings">
        <p class="whenrow">
          <span>
            {OCCASIONS[v.occasion].emoji} {t("lobbyOccasion", { what: tx(OCCASIONS[v.occasion]) })}
          </span>
          {host && changing === null && (
            <Btn kind="quiet" class="change-occasion" onClick={() => (setOccasion(v.occasion), setChanging("occasion"))}>
              {t("changeOccasion")}
            </Btn>
          )}
        </p>
        {changing === "occasion" && (
          <>
            <OccasionPicker value={occasion} onChange={setOccasion} />
            <Btn kind="quiet" wide onClick={() => (send({ t: "occasion", occasion }), setChanging(null))}>
              {t("done")}
            </Btn>
          </>
        )}
        <p class="whenrow">
          <span>🕒 {t("lobbyWhen", { when: whenLabel(v.at) })}</span>
          {host && changing === null && (
            <Btn kind="quiet" class="change-when" onClick={() => (setWhen(v.at), setChanging("when"))}>
              {t("changeWhen")}
            </Btn>
          )}
        </p>
        {changing === "when" && (
          <>
            <WhenPicker value={when} onChange={setWhen} />
            <Btn kind="quiet" wide onClick={() => (send({ t: "when", at: when }), setChanging(null))}>
              {t("done")}
            </Btn>
          </>
        )}
        {lowBudget(v) && (
          <p class="budget-low">
            <span class="budget-warning"><TriangleAlert aria-hidden="true" />{t("budgetLow", { n: v.you.limits!.budget, occasion: t(`occFor_${v.occasion}` as Key) })}</span>
            <Btn kind="quiet" class="change-budget" onClick={() => setEditing(true)}>
              {t("budgetChange")}
            </Btn>
          </p>
        )}
      </section>

      <label class="field">
        <span>{t("yourName")}</span>
        <input
          value={name}
          maxLength={16}
          onInput={(e) => setName((e.target as HTMLInputElement).value)}
          onBlur={() => {
            prefs.name = name.trim();
            send({ t: "name", name: name.trim() });
          }}
        />
      </label>

      <section class="card">
        <h2>{t("people")}</h2>
        <ul class="people" ref={people}>
          {v.members.map((m) => (
            <li key={m.id} class={`member${m.id === v.you.id ? " mine" : ""}`} data-member={m.id}>
              <Avatar v={v} m={m} />
              <span class="member-name">{memberName(v, m)}</span>
              <span class="member-tags">
                {m.id === v.you.id && <small>({t("you")})</small>}
                {m.host && <small>{t("host")}</small>}
              </span>
              {(!m.online || !m.ready) && <small class="muted">{t(!m.online ? "away" : "notReady")}</small>}
            </li>
          ))}
        </ul>
      </section>

      {v.error && (
        <section class="card">
          <Message error>{t(v.error)}</Message>
          {host && v.error !== "searchLimit" && (
            <>
              <RangePicker value={range} onChange={setRange} />
              <Btn kind="primary" wide onClick={() => send({ t: "again", range })}>
                {t("wider")}
              </Btn>
            </>
          )}
        </section>
      )}

      {!v.error && <Dock status={host ? t("readyCount", { n: ready, m: v.members.length }) : undefined}>
        <Btn kind="quiet" onClick={() => setEditing(true)}>{t("editCard")}</Btn>
        {host ? <Btn kind="primary" wide onClick={() => send({ t: "start" })}>{t("start")}</Btn> : <p class="muted center">{t("waitHost")}</p>}
      </Dock>}
    </>
  );
}

/** The host can advance either round, as before the screen redesign. */
function NextRound({ v }: { v: RoomView }) {
  const host = v.you.host || !v.members.find((m) => m.host)?.online;
  return host ? <Btn kind="quiet" onClick={() => send({ t: "next", phase: v.phase })}>{t("skipAhead")}</Btn> : null;
}

function Progress({ v }: { v: RoomView }) {
  const here = v.members.filter((m) => m.online);
  const dots = useRef<HTMLSpanElement>(null);
  const previous = useRef(new Map<string, boolean>());
  useLayoutEffect(() => {
    v.members.forEach((m, i) => {
      const el = dots.current?.children[i] as HTMLElement | undefined;
      if (el && m.done && !previous.current.get(m.id)) play(el, "dot");
      previous.current.set(m.id, m.done);
    });
  });
  return (
    <div class="progress">
      <span class="progress-dots" ref={dots} aria-hidden="true">{v.members.map((m) => <span key={m.id} class={`progress-dot${m.done ? " done" : ""}`} />)}</span>
      <span>{t("waitingOthers", { n: here.filter((m) => m.done).length, m: here.length })}</span>
    </div>
  );
}

const cycleMood = { none: "like", like: "ban", ban: "none" } as const;

/**
 * Round 1. First the way in: by cuisine or by what you feel like eating (Steve, 2026-11-19). Then a
 * row of big groups: a tap likes or refuses a whole group, 细分 opens it to pick inside. A group
 * picked partly opens on a tap instead, so one tap never wipes out a careful choice. The server
 * still only gets which menu items each person likes or refuses.
 */
function Mood({ v }: { v: RoomView }) {
  const [picks, setPicks] = useState<Picks>(v.you.mood);
  const [path, setPath] = useState<PathId | null>(Object.keys(v.you.mood).length ? "cuisine" : null);
  const [open, setOpen] = useState<string | null>(null);
  useBackCloses(open !== null, () => setOpen(null));
  const done = v.members.find((m) => m.id === v.you.id)?.done ?? false;
  const push = (p: Picks, finished: boolean) => send({ t: "mood", picks: p, done: finished });
  const change = (p: Picks) => {
    setPicks(p);
    push(p, false);
  };
  const groups = path ? PATHS[path] : [];
  const opened = groups.find((g) => g.id === open);
  return (
    <>
      <p class="muted small">{t("round1Hint")}</p>
      <MotionScreen scene={`${path}:${open}`}>
        {!path ? (
          <section class="menu paths">
            <h3>{t("pathAsk")}</h3>
            {(["cuisine", "dish"] as const).map((p) => (
              <button key={p} type="button" class="choice press" data-path={p} onClick={() => setPath(p)}>
                <span class="label">{t(p === "cuisine" ? "byCuisine" : "byDish")}</span>
                <span class="hint">{t(p === "cuisine" ? "byCuisineEg" : "byDishEg")}</span>
              </button>
            ))}
          </section>
        ) : opened ? (
          <section class="menu inside-group">
            <button type="button" class="back-all press" onClick={() => setOpen(null)}>
              ‹ {tx(opened.text)}
            </button>
            <div class="moods">
              {opened.leaves.map((l) => (
                <LeafChip key={l.id} l={l} picks={picks} done={done} change={change} />
              ))}
            </div>
          </section>
        ) : (
          <section class="menu">
            <div class="seg path-switch">
              {(["cuisine", "dish"] as const).map((p) => (
                <button key={p} type="button" class="press" data-path={p} aria-pressed={path === p} onClick={() => setPath(p)}>
                  {t(p === "cuisine" ? "byCuisine" : "byDish")}
                </button>
              ))}
            </div>
            <div class="moods">
              {groups.map((g) =>
                g.leaves.length === 1 ? (
                  <LeafChip key={g.id} l={g.leaves[0]} picks={picks} done={done} change={change} />
                ) : (
                  <GroupTile key={g.id} g={g} picks={picks} done={done} change={change} openIt={() => setOpen(g.id)} />
                ),
              )}
            </div>
          </section>
        )}
      </MotionScreen>
      <Dock status={<Progress v={v} />}>
        <NextRound v={v} />
        <Btn kind="primary" wide disabled={done} onClick={() => push(picks, true)}>{t("done")}</Btn>
      </Dock>
    </>
  );
}

function LeafChip({ l, picks, done, change }: { l: Leaf; picks: Picks; done: boolean; change: (p: Picks) => void }) {
  const now: MoodPick | "none" = picks[l.id] ?? "none";
  return (
    <button type="button" class={`mood press ${now}`} data-cuisine={l.id} aria-pressed={now !== "none"} disabled={done} onClick={(e) => { moodTap(e.currentTarget, cycleMood[now]); change(setAll(picks, [l.id], cycleMood[now])); }}>
      <span class="emoji" aria-hidden="true">
        {CUISINES[l.id].emoji}
      </span>
      <span class="label">{tx(leafText(l))}</span>
      <span class="mark" aria-hidden="true">
        <span class="mark-like">👍</span><span class="mark-ban">🚫</span>
      </span>
    </button>
  );
}

function GroupTile({ g, picks, done, change, openIt }: { g: Group; picks: Picks; done: boolean; change: (p: Picks) => void; openIt: () => void }) {
  const { state, likes, bans } = groupState(g, picks);
  const name = tx(g.text);
  const status = state === "like" ? t("allYes") : state === "ban" ? t("allNo") : state === "some" ? t("someYes", { likes, bans }) : "";
  const next = state === "none" ? "like" : state === "like" ? "ban" : "none";
  return (
    <div class="group">
      <button
        type="button"
        class={`mood press ${state}`}
        data-group={g.id}
        aria-pressed={state !== "none"}
        aria-label={status ? t("groupStatus", { name, status }) : name}
        disabled={done}
        onClick={(e) => { if (state === "some") openIt(); else { moodTap(e.currentTarget, next); change(setAll(picks, g.leaves.map((l) => l.id), next)); } }}
      >
        <span class="emoji" aria-hidden="true">
          {g.emoji}
        </span>
        <span class="label">{name}</span>
        <span class={`mark${state === "some" ? " some" : ""}`} aria-hidden="true">
          <span class="mark-like">👍</span><span class="mark-ban">🚫</span>
          {state === "some" ? [likes && `👍${likes}`, bans && `🚫${bans}`].filter(Boolean).join(" ") : ""}
        </span>
      </button>
      <button type="button" class="inside press" aria-label={t("insideOf", { name })} onClick={openIt}>
        {t("inside")} ›
      </button>
    </div>
  );
}

function Cards({ v }: { v: RoomView }) {
  const [approve, setApprove] = useState<string[]>(v.you.ballot.approve);
  const [veto, setVeto] = useState<string | null>(v.you.ballot.veto);
  const picked = useRef<HTMLParagraphElement>(null);
  const previousCount = useRef(approve.length);
  useLayoutEffect(() => {
    if (previousCount.current !== approve.length && picked.current) play(picked.current, "picked");
    previousCount.current = approve.length;
  }, [approve.length]);
  const done = v.members.find((m) => m.id === v.you.id)?.done ?? false;
  const push = (a: string[], x: string | null, finished: boolean) => send({ t: "ballot", approve: a, veto: x, done: finished });
  return (
    <>
      <p class="muted small">{t("round2Hint")}</p>
      {v.at && <p class="planned small">{t("plannedFor", { when: whenLabel(v.at) })}</p>}
      <TableLimits l={v.table} />
      <RankedList
        sortable
        cards={v.cards}
        top={TOP_COUNT}
        occasion={v.occasion}
        overBudget={v.overBudget}
        veto={veto}
        action={(c) => {
          const id = c.place.id;
          const yes = approve.includes(id);
          const no = veto === id;
          return (
            <div class="vote">
              <Btn
                kind="quiet"
                pressed={yes}
                disabled={done}
                class="approve"
                onClick={(e) => {
                  if (!yes) { fillFrom(e.currentTarget, e); play(e.currentTarget, "approve"); buzz(10); }
                  const a = yes ? approve.filter((x) => x !== id) : [...approve, id];
                  const x = no ? null : veto;
                  setApprove(a);
                  setVeto(x);
                  push(a, x, false);
                }}
              >
                <span class="approve-fill" aria-hidden="true" /><Check aria-hidden="true" /><span>{t("approve")}</span>
              </Btn>
              <Btn
                kind="quiet"
                pressed={no}
                disabled={done || (veto !== null && !no)}
                class="veto"
                onClick={() => {
                  if (!no) buzz([20, 40, 20]);
                  const x = no ? null : id;
                  const a = approve.filter((y) => y !== id);
                  setVeto(x);
                  setApprove(a);
                  push(a, x, false);
                }}
              >
                {no ? t("vetoed") : <>🚫 {veto !== null ? t("vetoUsed") : t("veto")}</>}
              </Btn>
            </div>
          );
        }}
      />
      {!v.demo && <p class="google muted small">{t("google")}</p>}
      <Dock status={<><p class="picked num" ref={picked}>{t("picked", { n: approve.length })} · {t(veto ? "vetoUsed" : "vetoLeft")}</p><Progress v={v} /></>}>
        <NextRound v={v} />
        <Btn kind="primary" wide disabled={done} onClick={() => push(approve, veto, true)}>{t("done")}</Btn>
      </Dock>
    </>
  );
}

function Spinner({ v }: { v: RoomView }) {
  const tied = v.result!.tied;
  const winner = v.result!.winner;
  const ends = v.phaseEnds ?? serverNow();
  const [frame, setFrame] = useState({ step: -1, previous: -1, quiet: reduced(), landed: false, travel: duration("enter") });
  useEffect(() => {
    // The wheel's schedule is anchored to server time, including a phone joining mid-spin.
    const spin = TIMING.spin; // the server's own length of the spin phase
    const start = ends - spin;
    const steps = 18;
    let timer: ReturnType<typeof setTimeout>;
    let previous = -1;
    const media = matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => {
      clearTimeout(timer);
      const now = serverNow();
      const quiet = reduced();
      const travel = duration("enter");
      const at = (step: number) => start + (spin - travel) * (step / steps) ** 1.8;
      let step = 0;
      while (step < steps && at(step + 1) <= now) step++;
      const landed = now >= ends;
      if (!quiet && step !== previous && previous >= 0) buzz(5);
      setFrame({ step, previous, quiet, landed, travel: Math.max(0, Math.min(travel, (step < steps ? at(step + 1) : ends) - now)) });
      previous = step;
      if (!landed) timer = setTimeout(update, Math.max(1, (quiet || step === steps ? ends : at(step + 1)) - now));
    };
    update();
    media.addEventListener("change", update);
    return () => { clearTimeout(timer); media.removeEventListener("change", update); };
  }, [ends, winner]);
  const name = (step: number) => {
    const index = tied.indexOf(winner);
    const id = tied[((index - (18 - Math.max(0, step))) % tied.length + tied.length) % tied.length];
    return (v.cards.find((c) => c.place.id === id) ?? (v.winner?.place.id === id ? v.winner : undefined))?.place.name ?? "";
  };
  return (
    <section class="card spin center">
      <p>{t("spinning")}</p>
      <div class="spin-window" aria-live="off" style={{ "--wheel-step": `${frame.travel}ms` }}>
        {frame.quiet ? frame.landed && <p class="spinname wheel-fade">{name(18)}</p> : <div key={frame.step} class="wheel-step">
          {frame.previous >= 0 && frame.previous !== frame.step && <p class="spinname wheel-out" aria-hidden="true">{name(frame.previous)}</p>}
          <p class={`spinname${frame.previous >= 0 && frame.previous !== frame.step ? " wheel-in" : ""}`}>{name(frame.step)}</p>
        </div>}
      </div>
    </section>
  );
}

/** Art colors are a named palette, as for the table's avatars. */
const SPARK_GELS = ["var(--gel-amber)", "var(--gel-honey)", "var(--gel-mint)"] as const;

function Reveal({ children }: { children: ComponentChildren }) {
  const root = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = root.current!;
    const clean: (() => void)[] = [];
    el.querySelectorAll<HTMLElement>("[data-reveal-move]").forEach((part) => {
      const move = part.dataset.revealMove!;
      if (move === "spark" && reduced()) return;
      clean.push(play(part, move, move === "stamp" ? (name) => {
        if (name === "stamp-hit") buzz([20, 40, 30]);
      } : undefined, move === "stamp" ? "stamp-settle" : undefined));
    });
    return () => clean.forEach((stop) => stop());
  }, []);
  return <div class="result-reveal" ref={root}>
    <div class="reveal-scrim" data-reveal-move="dim" aria-hidden="true" />
    {children}
  </div>;
}

function Result({ v }: { v: RoomView }) {
  const { me } = useApp();
  const r = v.result;
  const win = v.winner ?? v.cards.find((c) => c.place.id === r?.winner);
  useEffect(() => {
    if (v.phase === "result" && win && me?.user) void api("/api/me/last", { method: "POST", body: JSON.stringify({ code: v.code, name: win.place.name }) });
  }, [v.phase, win?.place.id]);
  if (v.phase === "spin") return <Spinner v={v} />;
  if (!r || !win) return <p class="muted center">{t("connecting")}</p>;
  const s = r.scores.find((x) => x.id === r.winner)!;
  const rateUrl = `${location.origin}${BASE}/r/${v.code}/rate`;
  const map = win.place.mapsUrl ?? "";
  const share = async () => {
    const vars = { name: win.place.name, map, rate: rateUrl };
    const text = v.at ? t("shareTextAt", { ...vars, when: whenLabel(v.at) }) : t("shareText", vars);
    if (navigator.share) {
      try {
        await navigator.share({ text });
        return;
      } catch {
        // cancelled: fall back to copying
      }
    }
    await navigator.clipboard?.writeText(text);
    toast(t("copied"));
  };
  return (
    <Reveal key={r.winner}>
      <h2 class="center" data-reveal-move="tail">{v.at ? t("winnerAt", { when: whenLabel(v.at) }) : t("winner")}</h2>
      <div class="winner-card" data-reveal-move="winner">
        <PlaceCard c={win} occasion={v.occasion} win />
        <span class="spark-burst" aria-hidden="true">{Array.from({ length: 12 }, (_, i) => <i key={i} class="spark" data-reveal-move="spark" style={{ "--a": `${i * 30}deg`, "--spark-color": SPARK_GELS[i % SPARK_GELS.length] }} />)}</span>
        <span class="stamp" data-reveal-move="stamp" aria-hidden="true">{t("stamp")}</span>
      </div>
      <div class="reveal-tail" data-reveal-move="tail">
        <p class="muted small center">{t("votes", { yes: s.yes, veto: s.vetoes })}</p>
        <p class="links winner-links">
          {win.place.mapsUrl && <a class="btn quiet press" href={win.place.mapsUrl} target="_blank" rel="noopener">{t("map")}</a>}
          {win.place.phone && <a class="btn quiet press" href={`tel:${win.place.phone.replace(/[^\d+]/g, "")}`}>{t("call")}</a>}
        </p>
        {v.winner?.unsafe && <Message>{t(v.winner.unsafe === "budget" ? "winnerOverBudget" : "winnerUnsafe")}</Message>}
        {needsServer(v) && (
          <>
            <TableLimits l={v.table} />
            <Message>{t("tellServer")}</Message>
          </>
        )}
        <a class="btn quiet press wide" href={`${BASE}/r/${v.code}/rate`}>
          {t("rateAfter")}
        </a>
        {v.ratings.n > 0 && <p class="center">{t("tableScore", { n: v.ratings.liked, m: v.ratings.n })}</p>}
        {/* The made-up restaurants aren't Google's: the banner says so instead. */}
        {!v.demo && <p class="google muted small">{t("google")}</p>}
        {(v.you.host || !v.members.find((m) => m.host)?.online) && (
          <>
            {/* Steve, 2026-11-25: a way back to round 2's cards from here, to pick again. */}
            {v.ratings.n === 0 && (
              <Btn kind="quiet" wide onClick={() => send({ t: "back" })}>
                ‹ {t("backToCards")}
              </Btn>
            )}
            <Btn kind="quiet" onClick={() => send({ t: "again" })}>
              {t("again")}
            </Btn>
          </>
        )}
      </div>
      <Dock><Btn kind="primary" wide reveal onClick={() => void share()}><Share2 aria-hidden="true" />{t("share")}</Btn></Dock>
    </Reveal>
  );
}
