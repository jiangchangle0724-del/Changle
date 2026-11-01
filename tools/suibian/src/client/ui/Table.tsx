// One table on a phone: lobby → round 1 (mood) → round 2 (cards) → spinner → result.
import { useEffect, useState } from "preact/hooks";
import { BASE } from "../../base";
import { CUISINES, type Limits, type MoodPick, type RangeId } from "../../engine";
import type { RoomView } from "../../room/protocol";
import { t, tx } from "../i18n";
import { api } from "../net";
import { prefs } from "../prefs";
import { send, toast, useApp } from "../store";
import { Btn, Countdown, DemoBanner, LangToggle, Qr, TableLimits, memberName } from "./common";
import { DietCard } from "./DietCard";
import { PlaceCard } from "./PlaceCard";
import { RangePicker } from "./RangePicker";

export function Table({ home }: { home: () => void }) {
  const { view: v, status, fatal, me } = useApp();
  if (fatal) {
    return (
      <main class="page">
        <p class="error">{t(fatal === "identity" ? "identity" : "noRoom")}</p>
        <Btn onClick={home}>{t("home")}</Btn>
      </main>
    );
  }
  if (!v) return <main class="page center muted">{t("connecting")}</main>;
  const showDiet = v.phase === "lobby" && !v.you.limits;
  return (
    <main class={`page phase-${v.phase}`}>
      <header class="bar">
        <a
          href={`${BASE}/`}
          class="brand"
          onClick={(e) => {
            e.preventDefault();
            home();
          }}
        >
          🥢 {t("title")}
        </a>
        <span class="num">{t("table", { code: v.code })}</span>
        <LangToggle />
      </header>
      {status === "reconnecting" && <p class="warn">{t("reconnecting")}</p>}
      <DemoBanner demo={v.demo} />
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
  const host = v.you.host || !v.members.find((m) => m.host)?.online;
  const ready = v.members.filter((m) => m.ready).length;
  if (editing) return <DietCard initial={v.you.limits} onDone={(l: Limits) => (send({ t: "limits", limits: l }), setEditing(false))} />;
  if (v.phase === "finding") return <p class="big center">{t("finding")}</p>;
  return (
    <>
      <section class="card invite">
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
            {copied ? t("copied") : t("copyLink")}
          </Btn>
        </div>
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

      <section>
        <h2>{t("people")}</h2>
        <ul class="people">
          {v.members.map((m) => (
            <li key={m.id} class={m.id === v.you.id ? "mine" : ""}>
              <span>
                {memberName(v, m)}
                {m.id === v.you.id && <small> ({t("you")})</small>}
                {m.host && <small> · {t("host")}</small>}
              </span>
              <small class={m.ready ? "ok" : "muted"}>{!m.online ? t("away") : m.ready ? t("ready") : t("notReady")}</small>
            </li>
          ))}
        </ul>
        <TableLimits l={v.table} />
        <Btn kind="quiet" onClick={() => setEditing(true)}>
          {t("editCard")}
        </Btn>
      </section>

      {v.error && (
        <section class="card">
          <p class="error">{t(v.error)}</p>
          {host && (
            <>
              <RangePicker value={range} onChange={setRange} />
              <Btn kind="primary" wide onClick={() => send({ t: "again", range })}>
                {t("wider")}
              </Btn>
            </>
          )}
        </section>
      )}

      {!v.error &&
        (host ? (
          <>
            <p class="muted small center">{t("readyCount", { n: ready, m: v.members.length })}</p>
            <Btn kind="primary" wide onClick={() => send({ t: "start" })}>
              {t("start")}
            </Btn>
          </>
        ) : (
          <p class="muted center">{t("waitHost")}</p>
        ))}
    </>
  );
}

function Progress({ v }: { v: RoomView }) {
  const here = v.members.filter((m) => m.online);
  const host = v.you.host || !v.members.find((m) => m.host)?.online;
  return (
    <div class="progress">
      <span>{t("waitingOthers", { n: here.filter((m) => m.done).length, m: here.length })}</span>
      <Countdown ends={v.phaseEnds} />
      {host && (
        <Btn kind="quiet" onClick={() => send({ t: "next" })}>
          {t("skipAhead")}
        </Btn>
      )}
    </div>
  );
}

const cycleMood = { none: "like", like: "ban", ban: "none" } as const;

function Mood({ v }: { v: RoomView }) {
  const [picks, setPicks] = useState(v.you.mood);
  const done = v.members.find((m) => m.id === v.you.id)?.done ?? false;
  const push = (p: typeof picks, finished: boolean) => send({ t: "mood", picks: p, done: finished });
  return (
    <>
      <h2>{t("round1")}</h2>
      <p class="muted small">{t("round1Hint")}</p>
      <TableLimits l={v.table} />
      <div class="moods">
        {v.chips.map((c) => {
          const now: MoodPick | "none" = picks[c.cuisine] ?? "none";
          const cu = CUISINES[c.cuisine];
          return (
            <button
              key={c.cuisine}
              type="button"
              class={`mood ${now}`}
              data-cuisine={c.cuisine}
              aria-pressed={now !== "none"}
              disabled={done}
              onClick={() => {
                const to = cycleMood[now];
                const p = { ...picks };
                if (to === "none") delete p[c.cuisine];
                else p[c.cuisine] = to;
                setPicks(p);
                push(p, false);
              }}
            >
              <span class="emoji" aria-hidden="true">
                {cu.emoji}
              </span>
              <span class="label">{tx(cu)}</span>
              <small class="muted">{t(c.count === 1 ? "place1" : "places", { n: c.count })}</small>
              <span class="mark" aria-hidden="true">
                {now === "like" ? "👍" : now === "ban" ? "🚫" : ""}
              </span>
            </button>
          );
        })}
      </div>
      <Btn kind="primary" wide disabled={done} onClick={() => push(picks, true)}>
        {t("done")}
      </Btn>
      <Progress v={v} />
    </>
  );
}

function Cards({ v }: { v: RoomView }) {
  const [approve, setApprove] = useState<string[]>(v.you.ballot.approve);
  const [veto, setVeto] = useState<string | null>(v.you.ballot.veto);
  const done = v.members.find((m) => m.id === v.you.id)?.done ?? false;
  const push = (a: string[], x: string | null, finished: boolean) => send({ t: "ballot", approve: a, veto: x, done: finished });
  return (
    <>
      <h2>{t("round2")}</h2>
      <p class="muted small">{t("round2Hint")}</p>
      <TableLimits l={v.table} />
      {needsServer(v) && <p class="warn small">{t("tellServer")}</p>}
      <div class="places">
        {v.cards.map((c) => {
          const id = c.place.id;
          const yes = approve.includes(id);
          const no = veto === id;
          return (
            <PlaceCard key={id} c={c}>
              <div class="vote">
                <Btn
                  kind={yes ? "primary" : undefined}
                  pressed={yes}
                  disabled={done}
                  class="approve"
                  onClick={() => {
                    const a = yes ? approve.filter((x) => x !== id) : [...approve, id];
                    const x = no ? null : veto;
                    setApprove(a);
                    setVeto(x);
                    push(a, x, false);
                  }}
                >
                  ✓ {t("approve")}
                </Btn>
                <Btn
                  kind={no ? "danger" : "quiet"}
                  pressed={no}
                  disabled={done || (veto !== null && !no)}
                  class="veto"
                  onClick={() => {
                    const x = no ? null : id;
                    const a = approve.filter((y) => y !== id);
                    setVeto(x);
                    setApprove(a);
                    push(a, x, false);
                  }}
                >
                  🚫 {veto !== null && !no ? t("vetoUsed") : t("veto")}
                </Btn>
              </div>
            </PlaceCard>
          );
        })}
      </div>
      <p class="google muted small">{t("google")}</p>
      <Btn kind="primary" wide disabled={done} onClick={() => push(approve, veto, true)}>
        {t("done")}
      </Btn>
      <Progress v={v} />
    </>
  );
}

function Spinner({ v }: { v: RoomView }) {
  const tied = v.result!.tied;
  const [i, setI] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setI((n) => n + 1), 140);
    return () => clearInterval(id);
  }, []);
  const name = v.cards.find((c) => c.place.id === tied[i % tied.length])?.place.name ?? "";
  return (
    <section class="spin center">
      <p>{t("spinning")}</p>
      <p class="spinname" aria-live="off">
        {name}
      </p>
    </section>
  );
}

function Result({ v }: { v: RoomView }) {
  const { me } = useApp();
  const r = v.result;
  const win = v.cards.find((c) => c.place.id === r?.winner);
  useEffect(() => {
    if (v.phase === "result" && win && me?.user) void api("/api/me/last", { method: "POST", body: JSON.stringify({ code: v.code, name: win.place.name }) });
  }, [v.phase, win?.place.id]);
  if (v.phase === "spin") return <Spinner v={v} />;
  if (!r || !win) return null;
  const s = r.scores.find((x) => x.id === r.winner)!;
  const rateUrl = `${location.origin}${BASE}/r/${v.code}/rate`;
  const map = win.place.mapsUrl ?? "";
  const share = async () => {
    const text = t("shareText", { name: win.place.name, map, rate: rateUrl });
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
    <>
      <h2 class="center">{t("winner")}</h2>
      <PlaceCard c={win}>
        <p class="muted small">{t("votes", { yes: s.yes, veto: s.vetoes })}</p>
      </PlaceCard>
      {needsServer(v) && <p class="warn">{t("tellServer")}</p>}
      <Btn kind="primary" wide onClick={() => void share()}>
        {t("share")}
      </Btn>
      <a class="btn wide" href={`${BASE}/r/${v.code}/rate`}>
        {t("rateAfter")}
      </a>
      {v.ratings.n > 0 && <p class="center">{t("tableScore", { n: v.ratings.liked, m: v.ratings.n })}</p>}
      <p class="google muted small">{t("google")}</p>
      {(v.you.host || !v.members.find((m) => m.host)?.online) && (
        <Btn kind="quiet" onClick={() => send({ t: "again" })}>
          {t("again")}
        </Btn>
      )}
    </>
  );
}
