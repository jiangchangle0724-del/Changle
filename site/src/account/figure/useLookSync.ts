import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";
import { useAccount } from "../AccountContext";
import { checkLook, type Look } from "./look";

/** where the look is kept: this phone only (signed out), or the account too */
export type Kept = "phone" | "loading" | "account" | "saving" | "failed";

/**
 * The look on the account, when signed in (Steve on Nov 14: 存进账号). Opening the page fetches
 * the account's, which wins over this phone's (a new phone gets your figure); if the account has
 * none yet, or the look changed here meanwhile, this phone's goes up. Each change after that goes
 * up a moment after the last, and one still waiting when the page closes goes as it closes.
 * Signed out, it stays on this phone (the page keeps it there either way).
 */
export function useLookSync(look: Look, setLook: (l: Look) => void): Kept {
  const { status } = useAccount();
  const [kept, setKept] = useState<Kept>("phone");
  const now = useRef(look);
  now.current = look;
  // the look the account has (as JSON), once it's known; null until then
  const onAccount = useRef<string | null>(null);
  const signedIn = status === "in";

  const save = useCallback(async (l: Look, keepalive = false) => {
    setKept("saving");
    try {
      const r = await api<{ look: unknown }>("/me/look", { method: "PUT", body: { look: l }, keepalive });
      onAccount.current = JSON.stringify(checkLook(r.look));
      setKept(JSON.stringify(now.current) === onAccount.current ? "account" : "saving");
    } catch {
      setKept("failed");
    }
  }, []);

  // signed in: the account's look
  useEffect(() => {
    onAccount.current = null;
    if (!signedIn) {
      setKept("phone");
      return;
    }
    let gone = false;
    const before = JSON.stringify(now.current);
    setKept("loading");
    api<{ look: unknown }>("/me/look")
      .then((r) => {
        if (gone) return;
        const theirs = r.look ? checkLook(r.look) : null;
        if (theirs && JSON.stringify(now.current) === before) {
          onAccount.current = JSON.stringify(theirs);
          setLook(theirs);
          setKept("account");
          return;
        }
        // nothing on the account yet, or changed here while it came: this phone's goes up
        onAccount.current = theirs ? JSON.stringify(theirs) : "";
        if (JSON.stringify(now.current) === onAccount.current) setKept("account");
        else void save(now.current);
      })
      .catch(() => {
        if (!gone) setKept("failed");
      });
    return () => {
      gone = true;
    };
  }, [signedIn, save, setLook]);

  // each change, a moment after the last
  useEffect(() => {
    if (!signedIn || onAccount.current === null || JSON.stringify(look) === onAccount.current) return;
    const t = window.setTimeout(() => void save(look), 1200);
    return () => window.clearTimeout(t);
  }, [look, signedIn, save]);

  // one still waiting when the page closes
  useEffect(
    () => () => {
      if (onAccount.current !== null && JSON.stringify(now.current) !== onAccount.current) void save(now.current, true);
    },
    [save],
  );

  return kept;
}
