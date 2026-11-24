import { useSyncExternalStore } from "react";

/** Long-press editing of the site's words, for the master account (account/CopyEditor.tsx): on unless he turned it off on this phone. */
const EDIT = "changle.copyEdit";
const subs = new Set<() => void>();
export function copyEditOn() {
  try {
    return localStorage.getItem(EDIT) !== "off";
  } catch {
    return true;
  }
}
export function setCopyEditOn(on: boolean) {
  try {
    if (on) localStorage.removeItem(EDIT);
    else localStorage.setItem(EDIT, "off");
  } catch {
    /* fine */
  }
  subs.forEach((f) => f());
}
export function useCopyEditOn() {
  return useSyncExternalStore(
    (f) => {
      subs.add(f);
      return () => subs.delete(f);
    },
    copyEditOn,
    () => true,
  );
}
