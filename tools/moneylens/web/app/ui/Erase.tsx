// Erasing the vault, as a person sees it (VAULT-5, VAULT-7). Three things. With the vault open, a
// screen that erases it at once, once the word is typed. Without it, from the screen that asks
// for the passphrase, a screen for someone who has lost both the passphrase and the recovery
// code: it asks for the vault to be erased in seven days. And while an erasing is asked for, a
// notice on the screens of every signed-in device, which says when and from where, and how to
// call it off: with the vault open, a button; without it, by opening it (a right proof calls it
// off, src/server/erase.ts). What each asks of the server is src/app/erase.ts.
import { useEffect, useRef, useState } from "preact/hooks";
import type { Failed } from "../../../src/app/devices";
import type { Ask } from "../../../src/app/door";
import { eraseLater, eraseNow, erasing, keepVault, type Pending } from "../../../src/app/erase";
import { t, type Key } from "../i18n";
import { IconBack, Note, Title, dateText, sentences, useLang } from "./common";

const NOT_DONE: Record<Failed, Key> = { offline: "endOffline", busy: "endBusy", server: "endServer" };

/** What an erasing asked for is, in a line: when it will be, and when and from where it was asked for. */
const sayPending = (pending: Pending): string => sentences(t("erasingDue", { due: dateText(pending.due) }), t("erasingAsked", { asked: dateText(pending.asked), who: t(pending.here ? "whoHere" : "whoOther") }));

/**
 * The notice on a screen of a signed-in device while an erasing is asked for. `open`: this device has `vault` open,
 * and can call it off here. Asked of the server when the screen comes up, and again whenever `stamp` changes (the
 * screen asking for the passphrase, after each try: an erasing can be put off meanwhile), so that it says how things
 * stand now. A question that is not answered shows nothing: the screen around it says what it can. `turnedAway`: every
 * proof is being turned away just now, which the person is told puts the erasing off. `startOver`: the vault is gone,
 * or another is there now, and the page asks again where things stand.
 */
export function ErasingNotice({ ask, vault, open, signedOut, startOver, stamp = 0, turnedAway = false }: { ask: Ask; vault: string; open: boolean; signedOut: () => void; startOver: () => void; stamp?: number; turnedAway?: boolean }) {
  useLang();
  const [pending, setPending] = useState<Pending | null>(null);
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState<{ tone: "done" | "error"; key: Key } | null>(null);
  const alive = useRef(true);
  useEffect(() => () => void (alive.current = false), []);
  const ends = useRef({ signedOut, startOver });
  ends.current = { signedOut, startOver };

  useEffect(() => {
    void (async () => {
      const got = await erasing(ask);
      if (!alive.current) return;
      if (got.ok) setPending(got.pending);
      else if (got.why === "signed-out") ends.current.signedOut();
    })();
  }, [ask, stamp]);

  const keep = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setSaid(null);
    const done = await keepVault(ask, vault);
    if (!alive.current) return;
    setBusy(false);
    if (done === "signed-out") return ends.current.signedOut();
    if (done === "gone" || done === "another") return ends.current.startOver();
    // ("none": called off already, from another device, or done; either way it is not asked for any more)
    if (done === "ok" || done === "none") {
      setPending(null);
      return setSaid({ tone: "done", key: "erasingKept" });
    }
    setSaid({ tone: "error", key: done === "locked" ? "erasingKeepLocked" : NOT_DONE[done] });
  };

  if (!pending) return said ? <Note tone={said.tone}>{t(said.key)}</Note> : null;
  return (
    <div class="erasing">
      <Note tone="warn">{sayPending(pending)}</Note>
      {open ? (
        <button type="button" class="btn btn-quiet" onClick={() => void keep()} disabled={busy}>
          {t(busy ? "erasingKeeping" : "erasingKeep")}
        </button>
      ) : (
        <p class="hint">{t(pending.here ? "erasingOpenHint" : "erasingIfNotYou")}</p>
      )}
      {!open && turnedAway && <Note tone="warn">{t("erasingHeld")}</Note>}
      {said && <Note tone={said.tone}>{t(said.key)}</Note>}
    </div>
  );
}

/**
 * Erasing, at once, the vault this device has open. Done only once the word is typed: a press alone does not delete
 * everything. `erased`: it is gone (erased now, or there was none any more). `elsewhere`: the account holds another
 * vault now, and the page has to start over to say so.
 */
export function EraseNow({ ask, vault, back, erased, elsewhere, signedOut }: { ask: Ask; vault: string; back: () => void; erased: () => void; elsewhere: () => void; signedOut: () => void }) {
  useLang();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Key | null>(null);
  const alive = useRef(true);
  useEffect(() => () => void (alive.current = false), []);
  const word = t("eraseWord");
  const ready = typed.trim().toLowerCase() === word.toLowerCase();

  const submit = async (event: Event): Promise<void> => {
    event.preventDefault();
    if (busy || !ready) return;
    setBusy(true);
    setProblem(null);
    const done = await eraseNow(ask, vault);
    if (!alive.current) return;
    setBusy(false);
    if (done === "ok" || done === "gone") return erased();
    if (done === "signed-out") return signedOut();
    if (done === "another") return elsewhere();
    setProblem(done === "locked" ? "eraseLocked" : NOT_DONE[done]);
  };

  return (
    <form class="hero" onSubmit={submit} noValidate>
      <button type="button" class="link-btn back" onClick={back}>
        <IconBack />
        {t("back")}
      </button>
      <Title>{t("eraseTitle")}</Title>
      <p class="lead">{t("eraseLead")}</p>
      <p class="hint">{t("eraseAfter")}</p>
      <div class="field">
        <label class="field-label" for="erase-word">
          {t("eraseConfirm", { word })}
        </label>
        <input id="erase-word" type="text" value={typed} onInput={(event) => setTyped((event.target as HTMLInputElement).value)} autoComplete="off" autoCapitalize="none" autoCorrect="off" spellcheck={false} disabled={busy} aria-describedby={problem ? "erase-problem" : undefined} />
      </div>
      {problem && (
        <div id="erase-problem">
          <Note tone="error">{t(problem)}</Note>
        </div>
      )}
      <button type="submit" class="btn btn-danger btn-lg btn-block" disabled={!ready || busy}>
        {t(busy ? "erasingNow" : "eraseNow")}
      </button>
    </form>
  );
}

/**
 * For someone who cannot open the vault: what losing both secrets means (VAULT-5), and asking for the vault to be
 * erased in seven days. Once it is asked for, the same screen says when. `elsewhere`: the account holds another vault,
 * or none, and the page has to start over to say so.
 */
export function ResetVault({ ask, vault, back, elsewhere, signedOut }: { ask: Ask; vault: string; back: () => void; elsewhere: () => void; signedOut: () => void }) {
  useLang();
  /** The erasing asked for: being read (undefined), none (null), or one. */
  const [pending, setPending] = useState<Pending | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<Key | null>(null);
  const alive = useRef(true);
  useEffect(() => () => void (alive.current = false), []);
  const ends = useRef({ elsewhere, signedOut });
  ends.current = { elsewhere, signedOut };

  useEffect(() => {
    void (async () => {
      const got = await erasing(ask);
      if (!alive.current) return;
      if (got.ok) return got.vault === vault ? setPending(got.pending) : ends.current.elsewhere();
      if (got.why === "signed-out") return ends.current.signedOut();
      // (not read: the button is there all the same, and asking again is harmless: an erasing asked for stays as it was)
      setPending(null);
    })();
  }, [ask, vault]);

  const askIt = async (): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    const done = await eraseLater(ask, vault);
    if (!alive.current) return;
    setBusy(false);
    if (done.ok) return setPending(done.pending);
    if (done.why === "signed-out") return signedOut();
    if (done.why === "gone" || done.why === "another") return elsewhere();
    setProblem(NOT_DONE[done.why]);
  };

  return (
    <section class="hero" aria-busy={pending === undefined}>
      <button type="button" class="link-btn back" onClick={back}>
        <IconBack />
        {t("back")}
      </button>
      <Title>{t("resetTitle")}</Title>
      <p class="lead">{t("resetLead")}</p>
      <p class="hint">{sentences(t("resetHow"), t("erasingHolds"))}</p>
      {pending ? (
        <Note tone="warn">{sayPending(pending)}</Note>
      ) : (
        <button type="button" class="btn btn-danger btn-lg btn-block" onClick={() => void askIt()} disabled={busy || pending === undefined}>
          {t(busy ? "resetAsking" : "resetAsk")}
        </button>
      )}
      {problem && <Note tone="error">{t(problem)}</Note>}
    </section>
  );
}
