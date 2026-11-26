import { API } from "../config";
import { copyCount, type CopyMap } from "../shared/copy";

/**
 * The owner's edits to the site's words (src/shared/copy.ts): the ones this phone kept from last
 * time go in at once, the latest a moment after the page is up. ./copyPatch.ts, which does the
 * swapping, only downloads when there is something to swap.
 */
const KEPT = "changle.copy";
let loaded = false;
let last = "";

function kept(): CopyMap | null {
  try {
    const m = JSON.parse(localStorage.getItem(KEPT) ?? "null") as CopyMap | null;
    return m && typeof m === "object" && m.zh && m.en ? m : null;
  } catch {
    return null;
  }
}

export function startCopy() {
  const m = kept();
  if (m) setCopy(m, false);
  const fresh = () =>
    void fetch(`${API}/copy`)
      .then((r) => (r.ok ? (r.json() as Promise<CopyMap>) : null))
      .then((m) => m && m.zh && m.en && setCopy(m))
      .catch(() => {});
  if ("requestIdleCallback" in window) requestIdleCallback(fresh, { timeout: 4000 });
  else setTimeout(fresh, 2000);
}

/** New edits, from the server or the owner's own save: kept on this phone and swapped in. */
export function setCopy(m: CopyMap, keep = true) {
  const s = JSON.stringify(m);
  if (s === last) return;
  last = s;
  const any = copyCount(m) > 0;
  if (keep)
    try {
      if (any) localStorage.setItem(KEPT, s);
      else localStorage.removeItem(KEPT);
    } catch {
      /* fine */
    }
  if (!any && !loaded) return;
  loaded = true;
  void import("./copyPatch").then((p) => p.applyCopy(m));
}
