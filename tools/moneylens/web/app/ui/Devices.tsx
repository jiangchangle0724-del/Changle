// The devices signed in to this account, and what has happened on it. What is asked of the server
// and how its answers are read is src/app/devices.ts; this file is what a person sees of it.
//
// It is the screen on which the owner of an account finds out that somebody else is in it, so it
// is reachable from every screen a signed-in person has (with a vault or without, open or locked),
// and wrong tries at the passphrase stand on it apart from everything else, at the top.
import { useCallback, useEffect, useRef, useState } from "preact/hooks";
import { deviceOf, endDevice, endOthers, listing, openedOf, outcomeOf, partsOf, restOf, wrongOf, type Device, type Failed, type Kind, type Line, type Listing, type Trouble } from "../../../src/app/devices";
import type { Ask } from "../../../src/app/door";
import type { Pending } from "../../../src/app/erase";
import { t, type Key } from "../i18n";
import { IconBack, Note, Title, dateText, useLang } from "./common";

const HAPPENED: Record<Kind, Key> = {
  "sign-in": "evSignIn",
  "sign-out": "evSignOut",
  "session-ended": "evSessionEnded",
  "sessions-ended": "evSessionsEnded",
  "vault-started": "evVaultStarted",
  "email-changed": "evEmailChanged",
  unlocked: "evUnlocked",
  "unlock-failed": "evUnlockFailed",
  "erase-asked": "evEraseAsked",
  "erase-cancelled": "evEraseCancelled",
  "vault-erased": "evVaultErased",
  other: "evOther",
};
/** The list could not be read; and: what was asked for was not done. */
const UNREAD: Record<Failed, Key> = { offline: "listOffline", busy: "busy", server: "listServer" };
const NOT_DONE: Record<Failed, Key> = { offline: "endOffline", busy: "endBusy", server: "endServer" };

/** A moment, said as a time too, for whoever does not read it off the screen. */
function When({ at }: { at: number }) {
  return <time dateTime={new Date(at).toISOString()}>{dateText(at)}</time>;
}

/** A device's name in the page's language. The server sends a few fixed words ("Chrome on Windows"); anything else is shown as it came, as text. */
function named(label: string): string {
  const parts = partsOf(label);
  if (!parts) return label;
  if (parts.browser && parts.system) return t("deviceOn", { browser: parts.browser, system: parts.system });
  return parts.browser ?? parts.system ?? t("deviceBrowser");
}

/** Which device a line is about, in words. */
function where(line: Line, devices: readonly Device[]): string | null {
  const on = deviceOf(line, devices);
  return on.at === "here" ? t("deviceHere") : on.at === "listed" ? named(on.label) : on.at === "gone" ? t("onGone") : null;
}

function Lines({ lines, devices }: { lines: readonly Line[]; devices: readonly Device[] }) {
  return (
    <ul class="list">
      {lines.map((line, at) => {
        const on = where(line, devices);
        return (
          <li key={at} class="list-item">
            {/* (a vault erased in no session's name was erased by its seven days) */}
            <span class="list-main">{t(line.kind === "vault-erased" && line.session === null ? "evVaultErasedLater" : HAPPENED[line.kind])}</span>
            <span class="list-sub facts">
              <When at={line.at} />
              {on && <span>{on}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

/** Who asked for an erasing, in words: this device, one still signed in (its name), or one that has signed out since. */
function askedBy(pending: Pending, devices: readonly Device[]): string {
  if (pending.here) return t("whoHere");
  const found = devices.find((device) => device.id === pending.session);
  return found ? named(found.label) : pending.session === null ? t("whoOther") : t("onGone");
}

export function Devices({ ask, back, signedOut }: { ask: Ask; back: () => void; signedOut: () => void }) {
  useLang();
  const [state, setState] = useState<Listing | null>(null);
  /** What is being done: the id of the device being signed out, or "others". */
  const [doing, setDoing] = useState<string | null>(null);
  /** What came of the last press: done, or not done. */
  const [said, setSaid] = useState<{ tone: "done" | "error"; key: Key; values?: Record<string, number> } | null>(null);
  const alive = useRef(true);
  useEffect(() => () => void (alive.current = false), []);
  const ends = useRef(signedOut);
  ends.current = signedOut;
  // (what came of a press is said above the list it changed; with a long list that may be off the screen, so it is brought into sight)
  const saidAt = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (said) saidAt.current?.scrollIntoView({ block: "nearest" });
  }, [said]);

  /** The list as the server has it now. Null: this screen is gone, or is going (not signed in any more). */
  const load = useCallback(async (): Promise<Listing | null> => {
    const got = await listing(ask);
    if (!alive.current) return null;
    // (no longer signed in, or no longer let in: the screen behind this one says which)
    if (!got.ok && got.why === "signed-out") {
      ends.current();
      return null;
    }
    setState(got);
    return got;
  }, [ask]);
  useEffect(() => void load(), [load]);

  const again = (): void => {
    setState(null);
    // (what was done stays said; what went wrong is asked again)
    setSaid((now) => (now?.tone === "done" ? now : null));
    void load();
  };
  /** After a device (its id), or all the others ("others"), were asked to be signed out: the list as the server now has it, and what came of the asking (devices.ts, `outcomeOf`). */
  const settle = async (asked: string, result: "ok" | "gone" | Trouble | { ended: number }): Promise<void> => {
    if (!alive.current) return;
    if (result === "signed-out") return ends.current();
    const now = await load();
    if (!now || !alive.current) return;
    setDoing(null);
    const came = outcomeOf(asked, result, now);
    if (came.said === "one") setSaid({ tone: "done", key: "endedOne" });
    else if (came.said === "others") setSaid({ tone: "done", key: "endedOthers", values: { n: came.ended } });
    else if (came.said === "none") setSaid({ tone: "done", key: "endedNone" });
    // ("nothing": the list as it now stands says it all, or could not be read and says that)
    else setSaid(came.said === "not-done" ? { tone: "error", key: NOT_DONE[came.why] } : null);
  };
  const endOne = async (id: string): Promise<void> => {
    if (doing) return;
    setDoing(id);
    setSaid(null);
    await settle(id, await endDevice(ask, id));
  };
  const endRest = async (): Promise<void> => {
    if (doing) return;
    setDoing("others");
    setSaid(null);
    const done = await endOthers(ask);
    await settle("others", done.ok ? { ended: done.ended } : done.why);
  };

  const top = (
    <>
      <button type="button" class="link-btn back" onClick={back}>
        <IconBack />
        {t("back")}
      </button>
      <Title>{t("devices")}</Title>
    </>
  );
  if (state === null)
    return (
      <section class="hero" aria-busy="true">
        {top}
        <p class="hint" role="status">
          {t("working")}
        </p>
        <div class="skeleton" aria-hidden="true" />
        <div class="skeleton skeleton-short" aria-hidden="true" />
      </section>
    );
  if (!state.ok)
    return (
      <section class="hero">
        {top}
        {said?.tone === "done" && <Note tone="done">{t(said.key, said.values)}</Note>}
        <Note tone="warn">{t(UNREAD[state.why === "signed-out" ? "server" : state.why])}</Note>
        <button type="button" class="btn btn-primary btn-lg" onClick={again}>
          {t("retry")}
        </button>
      </section>
    );

  const wrong = wrongOf(state.lines);
  const opened = openedOf(state.lines);
  const rest = restOf(state.lines);
  const others = state.devices.filter((device) => !device.here).length;
  // (without a vault, no device is said to hold one open or to have opened it)
  const vault = state.vault;
  return (
    <section class="hero">
      {top}
      <p class="lead">{t("devicesLead")}</p>

      {state.pending && (
        <section class="panel" aria-labelledby="erasing-title">
          <h2 class="sub" id="erasing-title">
            {t("erasingTitle")}
          </h2>
          <Note tone="warn">
            {t("erasingDue", { due: dateText(state.pending.due) })} {t("erasingAsked", { asked: dateText(state.pending.asked), who: askedBy(state.pending, state.devices) })}
          </Note>
          <p class="hint">{t(state.pending.here ? "erasingOpenHint" : "erasingIfNotYou")}</p>
        </section>
      )}

      {(state.wrong > 0 || wrong.length > 0) && (
        <section class="panel" aria-labelledby="wrong-title">
          <h2 class="sub" id="wrong-title">
            {t("wrongTitle")}
          </h2>
          {/* (said as a count, with its sign, and never by a color alone) */}
          {state.wrong > 0 ? <Note tone="warn">{t("wrongToday", { n: state.wrong })}</Note> : <Note>{t("wrongNone")}</Note>}
          <p class="hint">{t("wrongAdvice")}</p>
          <Lines lines={wrong} devices={state.devices} />
        </section>
      )}

      {/* (said where another device has opened the vault, listed or signed out since: whether it is the person's own is theirs to know) */}
      {(opened.length > 0 || (vault && state.devices.some((device) => !device.here && device.opened))) && (
        <section class="panel" aria-labelledby="opened-title">
          <h2 class="sub" id="opened-title">
            {t("otherOpenedTitle")}
          </h2>
          <p class="hint">{t("openedHint")}</p>
          {opened.length > 0 && <Lines lines={opened} devices={state.devices} />}
        </section>
      )}

      <section class="panel" aria-labelledby="devices-title">
        <h2 class="sub" id="devices-title">
          {t("devicesTitle")}
        </h2>
        {said && (
          <div ref={saidAt}>
            <Note tone={said.tone}>{t(said.key, said.values)}</Note>
          </div>
        )}
        <ul class="list">
          {state.devices.map((device) => (
            <li key={device.id} class="list-item device">
              <span class="list-main">
                {named(device.label)}
                {device.here && <span class="badge">{t("deviceHere")}</span>}
              </span>
              {/* (what the server knows of it and the vault: "locked" is never said, for that is only the device's word) */}
              {vault && <span class="list-sub">{t(device.unlocked ? "deviceOpen" : device.opened ? "deviceOpened" : "deviceNotOpened")}</span>}
              <span class="list-sub facts">
                <span>
                  {t("deviceMade")} <When at={device.made} />
                </span>
                <span>
                  {t("deviceSeen")} <When at={device.seen} />
                </span>
              </span>
              {!device.here && (
                <button type="button" class="btn btn-quiet btn-small" onClick={() => void endOne(device.id)} disabled={doing !== null}>
                  {t(doing === device.id ? "signingOut" : "deviceEnd")}
                </button>
              )}
            </li>
          ))}
        </ul>
        {others > 0 && (
          <button type="button" class="btn btn-quiet" onClick={() => void endRest()} disabled={doing !== null}>
            {t(doing === "others" ? "signingOut" : "othersEnd")}
          </button>
        )}
      </section>

      <section class="panel" aria-labelledby="events-title">
        <h2 class="sub" id="events-title">
          {t("eventsTitle")}
        </h2>
        {rest.length > 0 ? <Lines lines={rest} devices={state.devices} /> : <p class="hint">{t("eventsEmpty")}</p>}
      </section>
    </section>
  );
}
