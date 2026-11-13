// A gathering's page. One grid does two jobs, with a switch above it: "my times" (a tap marks a
// slot free, could-move-things, or not) and "everyone" (how many are free in each slot; a tap shows
// who). Under it the best three with their reasons, and who's in. The host's phone also sets the
// time, marks who must be there, and removes a duplicate row.
import { useEffect, useRef, useState } from "preact/hooks";
import { BASE } from "../../base";
import { best, dateLabel, dayLabel, nextAnswer, partLabel, partsOf, reason, slotKey, slotLabel, tally, vancouverDay, weekday, weekdayLabel } from "../../engine";
import type { Answers, EventState, Person, SlotKey } from "../../engine";
import type { Tally } from "../../engine";
import type { HostAction } from "../../room/event";
import type { Snapshot } from "../../room/protocol";
import { api, ApiFail, forget, remember, savedName, saveName } from "../api";
import { t, type Key } from "../i18n";
import { watch } from "../live";
import { CopyButton, IconCheck, IconQr, IconStar, IconWave, Qr, Sheet, Toast, TopBar, useLang } from "./common";

type Open = { kind: "slot"; slot: SlotKey } | { kind: "person"; id: string } | { kind: "claim" } | { kind: "qr" } | { kind: "created"; adminCode: string } | null;
type SaveState = "idle" | "saving" | "saved" | "failed";

const SAVE_AFTER_MS = 450;
const RETRY_SAVE_MS = 3000;
const same = (a: Answers, b: Answers) => {
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every((key) => a[key] === b[key]);
};
/** 0 to 4: how full a slot is, for its shade. Any one free person is at least 1. */
const heat = (yes: number, total: number) => (yes === 0 || total === 0 ? 0 : Math.max(1, Math.ceil((yes / total) * 4)));

export function EventPage({ code }: { code: string }) {
  const lang = useLang();
  const link = `${location.origin}${BASE}/${code}`;
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [gone, setGone] = useState(false);
  /** false after a request couldn't reach the server at all, until one does */
  const [reach, setReach] = useState(true);
  const [name, setName] = useState(savedName);
  const [naming, setNaming] = useState(false);
  const [draft, setDraft] = useState<Answers | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [mode, setMode] = useState<"fill" | "all">("fill");
  const [open, setOpen] = useState<Open>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [nudge, setNudge] = useState(false);
  const nameField = useRef<HTMLInputElement>(null);

  // the latest of everything, for the timers and callbacks that outlive a render
  const now = useRef({ snap, draft, name });
  now.current = { snap, draft, name };
  const saveTimer = useRef<ReturnType<typeof setTimeout>>();
  const saving = useRef(false);
  const firstLook = useRef(true);

  const say = (key: Key) => {
    setToast(t(key));
    setTimeout(() => setToast(null), 2600);
  };

  /** Take a state of the gathering, never an older one than the page already has. */
  const take = (state: EventState, more: Partial<Pick<Snapshot, "host" | "me">> = {}) =>
    setSnap((before) => (before ? { ...before, ...more, state: state.v >= before.state.v ? state : before.state } : before));

  const refresh = () =>
    api.get(code).then(
      (fresh) => {
        setReach(true);
        setSnap((before) => (before && fresh.state.v < before.state.v ? { ...fresh, state: before.state } : fresh));
        remember({ code, title: fresh.state.title, mine: fresh.host, at: Date.now() });
        if (firstLook.current) {
          firstLook.current = false;
          const mine = fresh.me && fresh.state.people.find((p) => p.id === fresh.me);
          if (mine) setName(mine.name);
          // someone coming back to look, or a time already set: show everyone first
          if (fresh.state.settled || (mine && Object.keys(mine.answers).length > 0)) setMode("all");
        }
      },
      (error) => {
        if (error instanceof ApiFail && error.status === 404) {
          forget(code);
          setGone(true);
        } else if (error instanceof ApiFail && error.code === "network") setReach(false);
      },
    );

  useEffect(() => {
    void refresh();
    try {
      const adminCode = sessionStorage.getItem(`when.fresh.${code}`);
      if (adminCode) {
        sessionStorage.removeItem(`when.fresh.${code}`);
        setOpen({ kind: "created", adminCode });
      }
    } catch {
      // private mode
    }
    return watch(code, { state: (state) => take(state), gone: () => setGone(true), live: () => undefined, refresh: () => void refresh() });
  }, [code]);

  // ---------- saving my row ----------
  async function flush() {
    clearTimeout(saveTimer.current);
    if (saving.current) return;
    const { snap: at, draft: answers, name: typed } = now.current;
    const mine = at?.me ? at.state.people.find((p) => p.id === at.me) : undefined;
    const sending = answers ?? mine?.answers ?? {};
    const as = typed.trim();
    if (!at || !as) return;
    saving.current = true;
    setSaveState("saving");
    try {
      const saved = await api.save(code, { id: at.me ?? undefined, name: as, answers: sending });
      saveName(as);
      setReach(true);
      take(saved.state, { me: saved.id });
      saving.current = false;
      // taps made while this was on its way go out next
      if (now.current.draft && !same(now.current.draft, sending)) return void flush();
      setDraft(null);
      setSaveState("saved");
    } catch (error) {
      saving.current = false;
      const why = error instanceof ApiFail ? error.code : "network";
      if (why === "full") return setSaveState("idle"), say("full");
      if (why === "notfound" || why === "gone") return setGone(true);
      if (why === "network") setReach(false);
      setSaveState("failed");
      saveTimer.current = setTimeout(() => void flush(), RETRY_SAVE_MS);
    }
  }
  const saveSoon = () => {
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void flush(), SAVE_AFTER_MS);
  };
  useEffect(() => () => clearTimeout(saveTimer.current), []);

  if (gone) {
    return (
      <div class="page">
        <TopBar />
        <div class="empty">
          <h1>{t("goneTitle")}</h1>
          <p>{t("goneBody")}</p>
          <a class="btn btn-primary" href={`${BASE}/`}>
            {t("goneAction")}
          </a>
        </div>
      </div>
    );
  }
  if (!snap) {
    return (
      <div class="page">
        <TopBar />
        <p class="loading" role="status">
          {t("loading")}
        </p>
      </div>
    );
  }

  const { state, host } = snap;
  const me = snap.me ? state.people.find((p) => p.id === snap.me) : undefined;
  const joined = !!me;
  const mine: Answers = draft ?? me?.answers ?? {};
  // everyone as shown: my row carries what I've tapped, saved or not yet
  const people: Person[] = me ? state.people.map((p) => (p.id === me.id ? { ...p, answers: mine } : p)) : state.people;
  const tallies = tally({ days: state.days, grain: state.grain, people, minPeople: state.minPeople });
  const top = best(tallies);
  const rankOf = (slot: SlotKey) => top.findIndex((x) => x.slot === slot) + 1;
  const parts = partsOf(state.grain);
  const settledSlot = state.settled ? slotKey(state.settled.day, state.settled.part) : null;
  const settledTally = settledSlot ? tallies.find((x) => x.slot === settledSlot) : undefined;
  // nothing to offer: because nobody has answered, or because every slot people can make is ruled out
  const anyone = tallies.some((x) => x.yes.length + x.maybe.length > 0);
  const noBest: string = !anyone ? t("bestEmpty") : tallies.some((x) => x.out === "must") ? t("bestWaitMust") : t("bestFew", { n: state.minPeople });

  const act = (action: HostAction) =>
    api.host(code, action).then(
      (done) => take(done.state),
      () => say("failed"),
    );

  function tap(slot: SlotKey) {
    if (mode === "all") return setOpen({ kind: "slot", slot });
    if (!name.trim()) {
      setNudge(true);
      setNaming(true);
      nameField.current?.focus();
      return;
    }
    const next = { ...mine };
    const to = nextAnswer(next[slot]);
    if (to) next[slot] = to;
    else delete next[slot];
    setDraft(next);
    setSaveState("saving");
    saveSoon();
  }

  function submitName(event: Event) {
    event.preventDefault();
    if (!name.trim()) return setNudge(true);
    setNudge(false);
    setNaming(false);
    void flush();
  }

  const showNameField = !joined || naming;
  const first = state.days[0];
  const lastDay = state.days[state.days.length - 1];

  return (
    <div class="page">
      <TopBar />

      <div class="event-head">
        <h1>{state.title}</h1>
        <p class="meta">
          <span>{state.days.length === 1 ? dayLabel(first, lang) : t("rangeTo", { from: dateLabel(first, lang), to: dateLabel(lastDay, lang) })}</span>
          <span>{state.people.length ? t("answered", { n: state.people.length }) : t("answeredNone")}</span>
        </p>
        <div class="row">
          <CopyButton text={link} label={t("copyLink")} />
          <button type="button" class="btn btn-quiet" onClick={() => setOpen({ kind: "qr" })}>
            <IconQr />
            {t("qr")}
          </button>
        </div>
      </div>

      {state.settled && settledTally && (
        <section class="set" aria-live="polite">
          <span class="set-tag">{t("settledTitle")}</span>
          <strong>{slotLabel(state.settled.day, state.settled.part, lang)}</strong>
          <p>{reason(settledTally, people, lang)}</p>
          {host && (
            <button type="button" class="link-btn on-gel" onClick={() => act({ do: "reopen" })}>
              {t("reopen")}
            </button>
          )}
        </section>
      )}

      <section class="panel">
        {showNameField ? (
          <form class="name-form" onSubmit={submitName}>
            <label class="field">
              <span class="field-label">{t("nameLabel")}</span>
              <input ref={nameField} type="text" value={name} maxLength={16} placeholder={t("namePlaceholder")} autocomplete="nickname" enterkeyhint="done" aria-invalid={nudge && !name.trim()} onInput={(event) => (setName(event.currentTarget.value), setNudge(false))} />
            </label>
            <button type="submit" class="btn btn-primary">
              {joined ? t("nameSave") : t("nameStart")}
            </button>
            {nudge && (
              <p class="problem" role="alert">
                {t("nameNeeded")}
              </p>
            )}
          </form>
        ) : (
          <div class="row-between">
            <p class="you">
              {t("youAre")} <b>{me!.name}</b>
            </p>
            <button type="button" class="link-btn" onClick={() => setNaming(true)}>
              {t("rename")}
            </button>
          </div>
        )}

        <div class="seg" role="group" aria-label={`${t("modeFill")} / ${t("modeAll")}`}>
          <button type="button" aria-pressed={mode === "fill"} onClick={() => setMode("fill")}>
            {t("modeFill")}
          </button>
          <button type="button" aria-pressed={mode === "all"} onClick={() => setMode("all")}>
            {t("modeAll")}
          </button>
        </div>
        <p class="hint">{mode === "fill" ? t("fillHint") : t("allHint")}</p>

        <div class={`grid grid-${state.grain} grid-${mode}`}>
          {state.grain === "half" && (
            <div class="grid-row grid-heads" aria-hidden="true">
              <span />
              {parts.map((part) => (
                <span key={part}>{partLabel(part, lang)}</span>
              ))}
            </div>
          )}
          {state.days.map((day) => (
            <div class="grid-row" key={day} data-weekend={weekday(day) % 6 === 0 ? "" : undefined}>
              <span class="grid-date">
                <b>{weekdayLabel(day, lang)}</b>
                <small>{dateLabel(day, lang)}</small>
              </span>
              {parts.map((part) => {
                const slot = slotKey(day, part);
                const tl = tallies.find((x) => x.slot === slot)!;
                const answer = mine[slot];
                const rank = rankOf(slot);
                const label = `${slotLabel(day, part, lang)}: ${mode === "fill" ? t(answer === 2 ? "legendFree" : answer === 1 ? "legendMaybe" : "legendNo") : reason(tl, people, lang)}`;
                return (
                  <button
                    type="button"
                    key={slot}
                    class="cell"
                    data-heat={heat(tl.yes.length, people.length)}
                    data-mine={answer === 2 ? "yes" : answer === 1 ? "maybe" : "no"}
                    data-set={slot === settledSlot ? "" : undefined}
                    aria-label={label}
                    aria-pressed={mode === "fill" ? answer !== undefined : undefined}
                    onClick={() => tap(slot)}
                  >
                    {mode === "fill" ? (
                      <>
                        {answer === 2 ? <IconCheck size={22} /> : answer === 1 ? <IconWave size={22} /> : null}
                        {tl.yes.length > 0 && <small class="cell-count">{tl.yes.length}</small>}
                      </>
                    ) : (
                      <>
                        {(tl.yes.length > 0 || tl.maybe.length > 0) && <b>{tl.yes.length}</b>}
                        {tl.maybe.length > 0 && <small>+{tl.maybe.length}</small>}
                        {rank > 0 && <i class="cell-rank">{rank}</i>}
                      </>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {mode === "fill" ? (
          <ul class="legend" aria-hidden="true">
            <li>
              <i data-mine="yes">
                <IconCheck size={14} />
              </i>
              {t("legendFree")}
            </li>
            <li>
              <i data-mine="maybe">
                <IconWave size={14} />
              </i>
              {t("legendMaybe")}
            </li>
            <li>
              <i data-mine="no" />
              {t("legendNo")}
            </li>
          </ul>
        ) : null}
        <p class="status" role="status" data-state={saveState === "failed" ? "failed" : !reach ? "offline" : saveState}>
          {saveState === "failed" ? t("saveFailed") : !reach ? t("offline") : saveState === "saving" ? t("saving") : saveState === "saved" ? t("saved") : ""}
        </p>
      </section>

      <section class="panel">
        <h2 class="panel-title">{t("bestTitle")}</h2>
        {top.length === 0 ? (
          <p class="hint">{noBest}</p>
        ) : (
          <ol class="best">
            {top.map((x, i) => (
              <li key={x.slot} data-set={x.slot === settledSlot ? "" : undefined}>
                <i class="best-rank" aria-hidden="true">
                  {i + 1}
                </i>
                <button type="button" class="best-what" onClick={() => setOpen({ kind: "slot", slot: x.slot })}>
                  <b>{slotLabel(x.day, x.part, lang)}</b>
                  <span>{reason(x, people, lang)}</span>
                </button>
                {host && x.slot !== settledSlot && (
                  <button type="button" class="btn btn-primary btn-sm" onClick={() => act({ do: "settle", slot: x.slot })}>
                    {t("pick")}
                  </button>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      {people.length > 0 && (
        <section class="panel">
          <h2 class="panel-title">{t("peopleTitle")}</h2>
          <ul class="people">
            {people.map((p) => {
              const inner = (
                <>
                  {p.must && (
                    <span class="must" title={t("must")}>
                      <IconStar />
                    </span>
                  )}
                  <b>{p.name}</b>
                  {p.id === me?.id && <small>{t("you")}</small>}
                  <small>{t("slotsPicked", { n: Object.keys(p.answers).length })}</small>
                  {p.must && <span class="sr-only">{t("must")}</span>}
                </>
              );
              return (
                <li key={p.id}>
                  {host ? (
                    <button type="button" class="person" onClick={() => setOpen({ kind: "person", id: p.id })}>
                      {inner}
                    </button>
                  ) : (
                    <span class="person">{inner}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {host ? (
        <section class="panel">
          <h2 class="panel-title">{t("hostTitle")}</h2>
          <p class="hint">{t("hostNote")}</p>
          <div class="row-between">
            <span id="min-label">{t("minPeople")}</span>
            <div class="stepper" role="group" aria-labelledby="min-label">
              <button type="button" aria-label={t("fewer")} disabled={state.minPeople <= 1} onClick={() => act({ do: "edit", minPeople: state.minPeople - 1 })}>
                −
              </button>
              <output aria-live="polite">{state.minPeople}</output>
              <button type="button" aria-label={t("more")} disabled={state.minPeople >= 40} onClick={() => act({ do: "edit", minPeople: state.minPeople + 1 })}>
                +
              </button>
            </div>
          </div>
        </section>
      ) : (
        <button type="button" class="link-btn center" onClick={() => setOpen({ kind: "claim" })}>
          {t("iAmHost")}
        </button>
      )}

      <p class="foot">{t("deletedOn", { day: dayLabel(vancouverDay(state.expiresAt), lang) })}</p>

      {open?.kind === "slot" && <SlotSheet tl={tallies.find((x) => x.slot === open.slot)!} state={state} people={people} host={host} settled={open.slot === settledSlot} onPick={() => (setOpen(null), void act({ do: "settle", slot: open.slot }))} onClose={() => setOpen(null)} />}
      {open?.kind === "person" && people.some((p) => p.id === open.id) && <PersonSheet person={people.find((p) => p.id === open.id)!} onAct={(action) => (setOpen(null), void act(action))} onClose={() => setOpen(null)} />}
      {open?.kind === "claim" && <ClaimSheet code={code} onDone={() => (setOpen(null), setSnap((before) => before && { ...before, host: true }), say("claimOk"))} onClose={() => setOpen(null)} />}
      {open?.kind === "qr" && (
        <Sheet title={t("qr")} onClose={() => setOpen(null)}>
          <Qr text={link} label={t("qr")} />
          <p class="hint center">{t("qrNote")}</p>
          <CopyButton text={link} label={t("copyLink")} />
        </Sheet>
      )}
      {open?.kind === "created" && (
        <Sheet
          title={t("createdTitle")}
          onClose={() => setOpen(null)}
          footer={
            <button type="button" class="btn btn-quiet btn-block" onClick={() => setOpen(null)}>
              {t("goFill")}
            </button>
          }
        >
          <p>{t("createdLine")}</p>
          <CopyButton text={link} label={t("copyLink")} kind="primary" />
          <div class="admin">
            <span class="field-label">{t("adminLabel")}</span>
            <output class="admin-code">{open.adminCode}</output>
            <p class="hint">{t("adminNote")}</p>
            <CopyButton text={open.adminCode} label={t("copyAdmin")} />
          </div>
        </Sheet>
      )}
      <Toast text={toast} />
    </div>
  );
}

function Names({ ids, people }: { ids: string[]; people: Person[] }) {
  if (!ids.length) return <p class="hint">{t("slotNobody")}</p>;
  return (
    <ul class="names">
      {ids.map((id) => {
        const p = people.find((x) => x.id === id);
        return (
          p && (
            <li key={id}>
              {p.must && <IconStar />}
              {p.name}
            </li>
          )
        );
      })}
    </ul>
  );
}

function SlotSheet({ tl, state, people, host, settled, onPick, onClose }: { tl: Tally; state: EventState; people: Person[]; host: boolean; settled: boolean; onPick: () => void; onClose: () => void }) {
  const lang = useLang();
  return (
    <Sheet
      title={slotLabel(tl.day, tl.part, lang)}
      onClose={onClose}
      footer={
        host && !settled ? (
          <button type="button" class="btn btn-primary btn-block" onClick={onPick}>
            {t("pick")}
          </button>
        ) : undefined
      }
    >
      {tl.out && <p class="note">{tl.out === "must" ? t("outMust") : t("outFew", { n: state.minPeople })}</p>}
      <h3 class="list-title">
        {t("slotFree")} <small>{tl.yes.length}</small>
      </h3>
      <Names ids={tl.yes} people={people} />
      <h3 class="list-title">
        {t("slotMaybe")} <small>{tl.maybe.length}</small>
      </h3>
      <Names ids={tl.maybe} people={people} />
      <h3 class="list-title">
        {t("slotNo")} <small>{tl.no.length}</small>
      </h3>
      <Names ids={tl.no} people={people} />
    </Sheet>
  );
}

function PersonSheet({ person, onAct, onClose }: { person: Person; onAct: (action: HostAction) => void; onClose: () => void }) {
  useLang();
  const [asking, setAsking] = useState(false);
  return (
    <Sheet title={person.name} onClose={onClose}>
      <button type="button" class="btn btn-quiet btn-block" aria-pressed={person.must} onClick={() => onAct({ do: "must", id: person.id, must: !person.must })}>
        <IconStar size={16} />
        {person.must ? t("unmarkMust") : t("markMust")}
      </button>
      <p class="hint">{t("mustNote")}</p>
      {asking ? (
        <div class="confirm" role="alert">
          <p>{t("removeAsk", { name: person.name })}</p>
          <div class="row">
            <button type="button" class="btn btn-danger" onClick={() => onAct({ do: "remove", id: person.id })}>
              {t("removeYes")}
            </button>
            <button type="button" class="btn btn-quiet" onClick={() => setAsking(false)}>
              {t("cancel")}
            </button>
          </div>
        </div>
      ) : (
        <button type="button" class="link-btn danger" onClick={() => setAsking(true)}>
          {t("remove")}
        </button>
      )}
    </Sheet>
  );
}

function ClaimSheet({ code, onDone, onClose }: { code: string; onDone: () => void; onClose: () => void }) {
  useLang();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Key | null>(null);
  async function submit(event: Event) {
    event.preventDefault();
    if (busy || typed.length !== 6) return;
    setBusy(true);
    setProblem(null);
    try {
      await api.claim(code, typed);
      onDone();
    } catch (error) {
      const why = error instanceof ApiFail ? error.code : "network";
      setProblem(why === "wrong" ? "claimWrong" : why === "locked" ? "claimLocked" : why === "limit" ? "claimLimit" : "failed");
      setBusy(false);
    }
  }
  return (
    <Sheet title={t("claimTitle")} onClose={onClose}>
      <form class="claim" onSubmit={submit}>
        <label class="field">
          <span class="field-label">{t("claimHint")}</span>
          <input class="code-input" data-autofocus type="text" inputMode="numeric" pattern="[0-9]*" maxLength={6} autocomplete="off" value={typed} onInput={(event) => (setTyped(event.currentTarget.value.replace(/\D/g, "").slice(0, 6)), setProblem(null))} />
        </label>
        {problem && (
          <p class="problem" role="alert">
            {t(problem)}
          </p>
        )}
        <button type="submit" class="btn btn-primary btn-block" disabled={busy || typed.length !== 6}>
          {t("claimDo")}
        </button>
      </form>
    </Sheet>
  );
}
