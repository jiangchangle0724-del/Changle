// The app, as far as it goes yet: the door. Signing in, making a vault (a passphrase, then the
// recovery code to keep), opening one, and a first room behind it that says the vault is open.
// What each step does is src/app/door.ts; this file is what a person sees of it. Over the screen
// a signed-in person is on, one more can be laid: the devices and what has happened (Devices.tsx),
// from every such screen; erasing the vault at once, from the open vault; and starting over, from
// the screen that asks for the passphrase (Erase.tsx).
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { askOver, codeIn, draft, enter, keep, leave, lock, open, standing, type Ask, type Draft, type Entered, type Opened } from "../../../src/app/door";
import { browserClock, watchIdle } from "../../../src/app/idle";
import type { OpenVault } from "../../../src/vault/crypto";
import { MemoryCache } from "../../../src/vault/memory";
import { weakness, type Weak } from "../../../src/vault/passphrase";
import { readRecovery } from "../../../src/vault/recovery";
import { Store } from "../../../src/vault/sync";
import { forgetCache, holdCache } from "../../../src/web/idbcache";
import { HttpRemote } from "../../../src/web/remote";
import { t, type Key } from "../i18n";
import { CopyButton, IconLock, Note, SecretField, Title, TopBar, useLang } from "./common";
import { Devices } from "./Devices";
import { EraseNow, ErasingNotice, ResetVault } from "./Erase";

/** The vault locks itself after this long with nothing pressed (VAULT-3). */
export const IDLE_MS = 15 * 60_000;

type View =
  | { at: "starting" }
  | { at: "signed-out"; note?: Key }
  | { at: "trouble"; why: "offline" | "server" | "busy" }
  | { at: "new"; note?: Key }
  | { at: "code"; draft: Draft }
  | { at: "locked"; vault: string; note?: Key }
  | { at: "open"; vault: OpenVault };

const WEAK: Record<Weak, Key> = { "too-short": "weakTooShort", "too-long": "weakTooLong", pattern: "weakPattern", common: "weakCommon", "few-words": "weakFewWords" };
const ENTERED: Partial<Record<Entered, Key>> = { code: "outCode", "not-admitted": "outNotAdmitted", closed: "outClosed", "too-many": "outTooMany", "slow-down": "busy", "try-again": "outTryAgain" };

/** Where the page stands when it opens: a handoff code in the address is traded first, and taken out of the address before anything else. */
async function arrive(ask: Ask): Promise<View> {
  const code = codeIn(location.hash);
  if (location.hash) history.replaceState(null, "", location.pathname + location.search);
  if (code) {
    const entered = await enter(ask, code);
    if (entered === "offline" || entered === "server") return { at: "trouble", why: entered };
    if (entered !== "ok") return { at: "signed-out", note: ENTERED[entered] };
  }
  const stands = await standing(ask);
  if (stands.at === "trouble") return stands;
  if (stands.at === "signed-out") return { at: "signed-out", note: stands.why === "not-admitted" ? "outNotAdmitted" : stands.why === "closed" ? "outClosed" : undefined };
  return stands.at === "no-vault" ? { at: "new" } : { at: "locked", vault: stands.vault };
}

/** The step of the browser's history that is the list of devices, and whether a step is that one. */
/** The screens laid over another, each a step of the browser's history, and the screens each may be laid over. */
const LAID = { devices: ["new", "locked", "open"], erase: ["open"], reset: ["locked"] } as const;
type Laid = keyof typeof LAID;
/** Which laid screen a step of the browser's history is, if it is one. */
const laidOf = (state: unknown): Laid | null => {
  const said = typeof state === "object" && state !== null ? (state as { moneylens?: unknown }).moneylens : undefined;
  return said === "devices" || said === "erase" || said === "reset" ? said : null;
};
const laysOver = (laid: Laid, at: string): boolean => (LAID[laid] as readonly string[]).includes(at);

/** The one way this page asks the server anything. Made once: a new one at every drawing would start the page over each time. */
const SERVER = askOver();

export function App({ ask = SERVER }: { ask?: Ask }) {
  useLang();
  const [view, setView] = useState<View>({ at: "starting" });
  const start = useCallback(() => {
    setView({ at: "starting" });
    void arrive(ask).then(setView);
  }, [ask]);
  useEffect(start, [start]);

  /**
   * The key is dropped here whatever the server says; the server is told so that it stops counting this session as
   * unlocked. `parting`: the page is going away, and the browser is asked to send that word even so.
   */
  const locking = useRef<Promise<void>>(Promise.resolve());
  const lockUp = useCallback(
    (note?: Key, parting = false) => {
      setView((now) => (now.at === "open" ? { at: "locked", vault: now.vault.id, note } : now));
      locking.current = lock(ask, parting);
    },
    [ask],
  );
  /**
   * How the list of devices asks: after a lock that is on its way has reached the server (or has failed to). Else a
   * list read in the moment a vault locks itself could be told, by a server about to hear otherwise, that this device
   * holds the vault open.
   */
  const askSettled = useCallback<Ask>(
    async (action, body, parting) => {
      await locking.current;
      return ask(action, body, parting);
    },
    [ask],
  );
  // Fifteen minutes with nothing pressed, and the vault locks; and it locks when the page is left (VAULT-3). A vault
  // that is made and not yet kept (the recovery code's screen) has a key in memory too: after the same fifteen minutes
  // the key and the code are dropped and the person starts over. Nothing of it was on the server.
  const held = view.at === "open" ? "open" : view.at === "code" ? "made" : null;
  useEffect(() => {
    if (!held) return;
    const quiet = (): void => (held === "open" ? lockUp("autoLocked") : setView((now) => (now.at === "code" ? { at: "new", note: "newTimedOut" } : now)));
    const watch = watchIdle(IDLE_MS, quiet, browserClock);
    const pressed = ["pointerdown", "keydown", "wheel", "touchstart"] as const;
    for (const name of pressed) window.addEventListener(name, watch.touch, { passive: true });
    // (seen again after the browser was put away or the machine slept: the timer may have stood still meanwhile)
    const seen = (): void => {
      if (document.visibilityState === "visible") watch.look();
    };
    document.addEventListener("visibilitychange", seen);
    window.addEventListener("focus", watch.look);
    window.addEventListener("pageshow", watch.look);
    // (the tab is closed, or the page is left for another: a page that comes back from the browser's own keeping comes
    // back locked. A vault not yet kept has nothing on the server to lock; the fifteen minutes still run for it.)
    const left = (): void => {
      if (held === "open") lockUp(undefined, true);
    };
    window.addEventListener("pagehide", left);
    return () => {
      watch.stop();
      for (const name of pressed) window.removeEventListener(name, watch.touch);
      document.removeEventListener("visibilitychange", seen);
      window.removeEventListener("focus", watch.look);
      window.removeEventListener("pageshow", watch.look);
      window.removeEventListener("pagehide", left);
    };
  }, [held, lockUp]);

  // A screen laid over the one a signed-in person is on, which stays as it is behind it (an open vault stays open, and
  // its fifteen minutes run on). The browser's own "back" closes it, as it closes a sheet on changle.ca: opening it is
  // one step of the browser's history, and closing it is going back that step. Whether it is shown is whether the step
  // the browser stands on is that step: so a page that is loaded again on it shows it again, and "back" never needs
  // pressing twice.
  const [laid, setLaid] = useState<Laid | null>(() => laidOf(history.state));
  const lay = useCallback((what: Laid) => {
    history.pushState({ moneylens: what }, "");
    setLaid(what);
  }, []);
  const unlay = useCallback(() => {
    // (when the browser does not stand on that step, there is nothing to go back from, and going back would leave the page)
    if (laidOf(history.state)) history.back();
    else setLaid(null);
  }, []);
  useEffect(() => {
    // (back from that step closes it, and forward to it again opens it again)
    const moved = (event: PopStateEvent): void => setLaid(laidOf(event.state));
    window.addEventListener("popstate", moved);
    return () => window.removeEventListener("popstate", moved);
  }, []);

  // A step is its screen only while a screen it may be laid over is behind it. Come to from any other (signed out
  // meanwhile; "forward" on the recovery code's screen; the vault erased, or opened, under it), the page goes back off
  // it, as "back" would: nothing is laid over a later screen that nobody asked for then, and the step is not left
  // behind as one more "back" to press before the page is left. (A page that is still starting is no screen yet.) Done
  // as the screen is drawn, not some time after it; once for each coming to the step, because `laid` is put out with it.
  useLayoutEffect(() => {
    if (!laid || laysOver(laid, view.at) || view.at === "starting") return;
    setLaid(null);
    if (laidOf(history.state)) history.back();
  }, [laid, view.at]);

  // No vault on the server: this device's copy of one goes too (it was erased, here or elsewhere; idbcache.ts).
  useEffect(() => {
    if (view.at === "new") void forgetCache();
  }, [view.at]);

  const signedOut = (note?: Key): void => setView({ at: "signed-out", note });
  /** Ends the session on the server. Only when the server says it is over is this browser said to be signed out. */
  const signOut = useCallback(async (): Promise<boolean> => {
    const over = await leave(ask);
    if (over) setView({ at: "signed-out", note: "outLeft" });
    return over;
  }, [ask]);
  const over = laid !== null && laysOver(laid, view.at) ? laid : null;
  return (
    <div class="page">
      <TopBar />
      <main class="main" key={over ? "devices" : view.at}>
        {/* (asked again when the screen behind it changes: a vault that locked itself meanwhile is not shown as open) */}
        {over === "devices" && <Devices key={view.at} ask={askSettled} back={unlay} signedOut={() => signedOut()} />}
        {over === "erase" && view.at === "open" && <EraseNow ask={ask} vault={view.vault.id} back={unlay} erased={() => setView({ at: "new", note: "newErased" })} elsewhere={start} signedOut={() => signedOut()} />}
        {over === "reset" && view.at === "locked" && <ResetVault ask={ask} vault={view.vault} back={unlay} elsewhere={start} signedOut={() => signedOut()} />}
        {!over && view.at === "starting" && <Starting />}
        {!over && view.at === "signed-out" && <SignedOut note={view.note} />}
        {!over && view.at === "trouble" && <Trouble why={view.why} again={start} />}
        {!over && view.at === "new" && <NewVault note={view.note} made={(made) => setView({ at: "code", draft: made })} signOut={signOut} devices={() => lay("devices")} />}
        {!over && view.at === "code" && <RecoveryCode ask={ask} draft={view.draft} done={() => setView((now) => (now.at === "code" && now.draft === view.draft ? { at: "open", vault: now.draft.vault } : now))} another={start} signedOut={() => signedOut()} />}
        {!over && view.at === "locked" && <Unlock ask={ask} vault={view.vault} note={view.note} opened={(vault) => setView({ at: "open", vault })} signedOut={() => signedOut()} signOut={signOut} devices={() => lay("devices")} reset={() => lay("reset")} />}
        {/* (the server no longer counts this device as having the vault open: locked from another tab, or erased elsewhere; where things stand is asked again) */}
        {!over && view.at === "open" && <Home ask={ask} vault={view.vault} lock={() => lockUp()} locked={() => (lockUp(), start())} signedOut={() => signedOut()} signOut={signOut} devices={() => lay("devices")} erase={() => lay("erase")} />}
      </main>
      <footer class="foot">
        <a href="/licences.txt">{t("licences")}</a>
      </footer>
    </div>
  );
}

/**
 * The way out. It says "signed out" only once the server has said the session is over; when nothing came back, it
 * says so, and the session is still there.
 */
function SignOut({ signOut, quiet = false }: { signOut: () => Promise<boolean>; quiet?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const alive = useRef(true);
  useEffect(() => () => void (alive.current = false), []);
  const go = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setFailed(false);
    const over = await signOut();
    // (signed out, this screen is gone, and there is nothing left to say on it)
    if (over || !alive.current) return;
    setBusy(false);
    setFailed(true);
  };
  return (
    <>
      <button type="button" class={quiet ? "link-btn" : "btn btn-quiet"} onClick={go} disabled={busy}>
        {t(busy ? "signingOut" : "signOut")}
      </button>
      {failed && <Note tone="error">{t("signOutFailed")}</Note>}
    </>
  );
}

function Starting() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), 2000);
    return () => clearTimeout(timer);
  }, []);
  return (
    <section class="hero" aria-busy="true">
      <p class="lead" role="status">
        {t(slow ? "slow" : "starting")}
      </p>
      <div class="skeleton" aria-hidden="true" />
      <div class="skeleton skeleton-short" aria-hidden="true" />
    </section>
  );
}

function SignedOut({ note }: { note?: Key }) {
  return (
    <section class="hero">
      <Title>{t("outTitle")}</Title>
      <p class="lead">{t("outLead")}</p>
      {note && <Note tone={note === "outLeft" ? "plain" : "warn"}>{t(note)}</Note>}
      <a class="btn btn-primary btn-lg btn-block" href="/enter">
        {t("signIn")}
      </a>
      <p class="hint">{t("outBeta")}</p>
    </section>
  );
}

function Trouble({ why, again }: { why: "offline" | "server" | "busy"; again: () => void }) {
  return (
    <section class="hero">
      <Title>{t(why === "offline" ? "offlineTitle" : why === "busy" ? "busyTitle" : "serverTitle")}</Title>
      <p class="lead">{t(why === "offline" ? "offlineBody" : why === "busy" ? "busy" : "serverBody")}</p>
      <button type="button" class="btn btn-primary btn-lg" onClick={again}>
        {t("retry")}
      </button>
    </section>
  );
}

function NewVault({ note, made, signOut, devices }: { note?: Key; made: (draft: Draft) => void; signOut: () => Promise<boolean>; devices: () => void }) {
  const [first, setFirst] = useState("");
  const [second, setSecond] = useState("");
  const [problem, setProblem] = useState<Key | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (event: Event): Promise<void> => {
    event.preventDefault();
    if (busy) return;
    const weak = weakness(first);
    if (weak) return setProblem(WEAK[weak]);
    if (first !== second) return setProblem("mismatch");
    setProblem(null);
    setBusy(true);
    const result = await draft(first);
    setBusy(false);
    if (result.ok) made(result.draft);
    else setProblem(WEAK[result.why]);
  };
  return (
    <form class="hero" onSubmit={submit} noValidate>
      <Title>{t("newTitle")}</Title>
      <p class="lead">{t("newLead")}</p>
      {note && !problem && <Note>{t(note)}</Note>}
      <div class="panel">
        <SecretField id="passphrase" label="passphrase" value={first} onInput={setFirst} autoComplete="new-password" invalid={problem !== null && problem !== "mismatch"} describedBy="passphrase-hint" disabled={busy} />
        <p class="hint" id="passphrase-hint">
          {t("passphraseHint")}
        </p>
        <SecretField id="passphrase-again" label="passphraseAgain" value={second} onInput={setSecond} autoComplete="new-password" invalid={problem === "mismatch"} disabled={busy} />
        {problem && <Note tone="error">{t(problem)}</Note>}
      </div>
      <button type="submit" class="btn btn-primary btn-lg btn-block" disabled={busy || !first || !second}>
        {t(busy ? "makingKey" : "next")}
      </button>
      <div class="ways-out">
        <button type="button" class="link-btn" onClick={devices} disabled={busy}>
          {t("devices")}
        </button>
        <SignOut signOut={signOut} quiet />
      </div>
    </form>
  );
}

function RecoveryCode({ ask, draft: made, done, another, signedOut }: { ask: Ask; draft: Draft; done: () => void; another: () => void; signedOut: () => void }) {
  const [kept, setKept] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Key | null>(null);
  const create = async (): Promise<void> => {
    if (busy || !kept) return;
    setBusy(true);
    setProblem(null);
    const said = await keep(ask, made);
    setBusy(false);
    if (said === "ok") done();
    else if (said === "signed-out") signedOut();
    else setProblem(said === "offline" ? "keepOffline" : said === "another" ? "keepAnother" : said === "busy" ? "keepBusy" : "keepServer");
  };
  return (
    <section class="hero">
      <Title>{t("codeTitle")}</Title>
      <p class="lead">{t("codeLead")}</p>
      <div class="panel">
        <p class="field-label" id="code-label">
          {t("codeLabel")}
        </p>
        {/* (in its groups, so that a line never breaks inside one; read out and copied, it is the code as it is) */}
        <p class="code" role="group" aria-labelledby="code-label" translate={false}>
          {made.recoveryCode.split("-").map((group, at) => (
            <span key={at}>{group}</span>
          ))}
        </p>
        <CopyButton text={made.recoveryCode} />
      </div>
      <Note tone="warn">{t("codeWarn")}</Note>
      <label class="check">
        <input type="checkbox" checked={kept} onChange={(event) => setKept(event.currentTarget.checked)} disabled={busy} />
        <span>{t("codeKept")}</span>
      </label>
      {problem && <Note tone="error">{t(problem)}</Note>}
      {problem === "keepAnother" ? (
        <button type="button" class="btn btn-primary btn-lg btn-block" onClick={another}>
          {t("openTitle")}
        </button>
      ) : (
        <button type="button" class="btn btn-primary btn-lg btn-block" disabled={!kept || busy} onClick={create}>
          {t(busy ? "keeping" : "codeDone")}
        </button>
      )}
    </section>
  );
}

/** What to say when a vault did not open. Never that the vault is lost, and a wrapper that does not fit is never a wrong passphrase. */
function sayOf(result: Exclude<Opened, { ok: true }>, byCode: boolean): { key: Key; values?: Record<string, number>; more?: { key: Key; values?: Record<string, number> } } {
  switch (result.why) {
    case "wrong-secret": {
      const key: Key = byCode ? "wrongCode" : "wrongPassphrase";
      if (result.left === null || result.left > 3) return { key };
      return { key, more: result.left === 0 ? { key: "triesNone" } : { key: "triesLeft", values: { n: result.left } } };
    }
    case "too-many": {
      const minutes = Math.ceil(result.again / 60_000);
      return minutes > 90 ? { key: "tooManyHours", values: { n: Math.ceil(minutes / 60) } } : { key: "tooManyMinutes", values: { n: Math.max(1, minutes) } };
    }
    case "no-secret":
      return { key: "codeTypo" };
    case "no-way":
      return { key: "noWay" };
    case "unsupported":
      return { key: "unsupported" };
    case "changed":
      return { key: "changed" };
    case "busy":
      return { key: "busy" };
    case "offline":
      return { key: "offlineBody" };
    default:
      return { key: "serverBody" };
  }
}

function Unlock({ ask, vault, note, opened, signedOut, signOut, devices, reset }: { ask: Ask; vault: string; note?: Key; opened: (vault: OpenVault) => void; signedOut: () => void; signOut: () => Promise<boolean>; devices: () => void; reset: () => void }) {
  const [byCode, setByCode] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ReturnType<typeof sayOf> | null>(null);
  const submit = async (event: Event): Promise<void> => {
    event.preventDefault();
    if (busy || !typed) return;
    if (byCode) {
      // (what is not a code at all is said here, without asking the server anything)
      const read = readRecovery(typed);
      if (!read.ok) return setProblem(read.why === "wrong-length" ? { key: "codeLength", values: { n: read.symbols } } : { key: read.why === "typo" ? "codeTypo" : "codeMalformed" });
    }
    setBusy(true);
    setProblem(null);
    const result = await open(ask, vault, byCode ? { kind: "recovery", code: typed } : { kind: "passphrase", passphrase: typed });
    setBusy(false);
    if (result.ok) return opened(result.vault);
    if (result.why === "signed-out") return signedOut();
    setProblem(sayOf(result, byCode));
  };
  const swap = (): void => {
    setByCode(!byCode);
    setTyped("");
    setProblem(null);
  };
  return (
    <form class="hero" onSubmit={submit} noValidate>
      <Title>{t("openTitle")}</Title>
      <p class="lead">{t(byCode ? "openLeadCode" : "openLead")}</p>
      <ErasingNotice ask={ask} open={false} signedOut={signedOut} />
      {note && !problem && <Note>{t(note)}</Note>}
      <div class="panel">
        <SecretField key={byCode ? "code" : "passphrase"} id="secret" label={byCode ? "codeLabel" : "passphrase"} value={typed} onInput={setTyped} autoComplete={byCode ? "off" : "current-password"} plain={byCode} invalid={problem !== null} focus disabled={busy} />
        {problem && (
          <Note tone="error">
            {t(problem.key, problem.values)}
            {problem.more && ` ${t(problem.more.key, problem.more.values)}`}
          </Note>
        )}
      </div>
      <button type="submit" class="btn btn-primary btn-lg btn-block" disabled={busy || !typed}>
        {t(busy ? "opening" : "openDo")}
      </button>
      <button type="button" class="link-btn" onClick={swap} disabled={busy}>
        {t(byCode ? "usePassphrase" : "useCode")}
      </button>
      <div class="ways-out">
        <button type="button" class="link-btn" onClick={devices} disabled={busy}>
          {t("devices")}
        </button>
        <button type="button" class="link-btn" onClick={reset} disabled={busy}>
          {t("resetLink")}
        </button>
        <SignOut signOut={signOut} quiet />
      </div>
    </form>
  );
}

type Room = { cache: "ok" | "taken" | "none"; records: number; sync: "syncing" | "done" | "offline" | { pending: number } | { why: string } };

/** The first room behind the door: the vault is open, its records are read from this device's cache, and brought into line with the server once. */
function Home({ ask, vault, lock: lockNow, locked, signedOut, signOut, devices, erase }: { ask: Ask; vault: OpenVault; lock: () => void; locked: () => void; signedOut: () => void; signOut: () => Promise<boolean>; devices: () => void; erase: () => void }) {
  const [room, setRoom] = useState<Room | null>(null);
  const ends = useRef({ locked, signedOut });
  ends.current = { locked, signedOut };
  useEffect(() => {
    let over = false;
    let release: (() => void) | null = null;
    void (async () => {
      const held = await holdCache();
      if (over) return void (typeof held === "object" && held.release());
      if (held === "taken") return setRoom({ cache: "taken", records: 0, sync: "done" });
      if (held !== "unavailable") release = held.release;
      const store = await Store.open(vault, held === "unavailable" ? new MemoryCache() : held.cache);
      if (over) return;
      const cache = held === "unavailable" ? "none" : "ok";
      setRoom({ cache, records: store.status().records, sync: "syncing" });
      const remote = new HttpRemote();
      const result = await store.sync(remote);
      if (over) return;
      if (remote.signedOut !== null) return ends.current.signedOut();
      if (remote.locked) return ends.current.locked();
      const { records, pending } = store.status();
      setRoom({ cache, records, sync: result.ok ? (pending > 0 ? { pending } : "done") : result.why === "offline" ? "offline" : { why: result.why } });
    })();
    return () => {
      over = true;
      release?.();
    };
  }, [vault, ask]);

  if (room?.cache === "taken")
    return (
      <section class="hero">
        <Title>{t("homeTitle")}</Title>
        <Note tone="warn">{t("cacheTaken")}</Note>
        <button type="button" class="btn btn-quiet" onClick={lockNow}>
          <IconLock />
          {t("lockNow")}
        </button>
      </section>
    );
  const sync = room?.sync;
  return (
    <section class="hero" aria-busy={room === null || sync === "syncing"}>
      <Title>{t("homeTitle")}</Title>
      <p class="lead">{room && room.records > 0 ? t("homeRecords", { n: room.records }) : t("homeEmpty")}</p>
      <ErasingNotice ask={ask} open signedOut={signedOut} />
      {sync === undefined || sync === "syncing" ? (
        <p class="hint" role="status">
          {t("working")}
        </p>
      ) : sync === "done" ? (
        <p class="hint" role="status">
          {t("syncDone")}
        </p>
      ) : sync === "offline" ? (
        <Note tone="warn">{t("syncOffline")}</Note>
      ) : "pending" in sync ? (
        <Note tone="warn">{t("syncPending", { n: sync.pending })}</Note>
      ) : (
        <Note tone="warn">{t("syncTrouble", { why: sync.why })}</Note>
      )}
      {room?.cache === "none" && <Note>{t("cacheNone")}</Note>}
      <div class="row">
        <button type="button" class="btn btn-quiet" onClick={lockNow}>
          <IconLock />
          {t("lockNow")}
        </button>
        <button type="button" class="btn btn-quiet" onClick={devices}>
          {t("devices")}
        </button>
        <SignOut signOut={signOut} />
      </div>
      <button type="button" class="link-btn" onClick={erase}>
        {t("eraseLink")}
      </button>
    </section>
  );
}
