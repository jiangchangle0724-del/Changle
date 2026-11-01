// When a new version of the site goes live, a page opened before it still asks for the old
// version's files, and those are gone (their names change with every build): opening a game then
// fails, every game, until the page is reloaded. A page in that state loads the new version
// instead. At most once a minute, so a version that is really broken can't keep a phone reloading.
const KEY = "changle:new-version-at";
let reloading = false;

/** The error is one of the site's own files failing to load (most often: the site was updated). */
export function isStaleBuild(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /dynamically imported module|importing a module script failed|not a valid javascript mime type|unable to preload css/i.test(message);
}

/** Load the site afresh, as it is now. False when it already did in the last minute (or can't tell). */
export function loadNewVersion(): boolean {
  if (reloading) return true;
  try {
    if (Date.now() - Number(sessionStorage.getItem(KEY) ?? 0) < 60_000) return false;
    sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    // (no session storage: it couldn't tell a second time from the first, so it doesn't try)
    return false;
  }
  reloading = true;
  location.reload();
  return true;
}

/** The new version is on its way. */
export const loadingNewVersion = () => reloading;
