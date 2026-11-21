// When a new version of the site goes live, a page opened before it still asks for the old
// version's files, and those are gone (their names change with every build): opening a game then
// fails, every game, until the page is reloaded. A page in that state loads the new version
// instead. At most once a minute, so a version that is really broken can't keep a phone reloading.
const KEY = "changle:new-version-at";
let reloading = false;
/**
 * A page that mustn't reload now: the DJ's speaker while it plays (Steve on Nov 21, the shared phone
 * mirrored to the TV: "偶尔还是会突然刷新": the site was updated, the page asked for a file it hadn't
 * yet, and reloading stopped the music). Then the part that wanted the file goes without it (the
 * dancer falls back to the drawn one), and the new version loads once it's let go.
 */
let held = false;
let waiting = false;

/** Hold off (or allow again) loading a new version; let go with one waiting, it loads then. */
export function holdNewVersion(on: boolean) {
  held = on;
  if (!on && waiting) {
    waiting = false;
    loadNewVersion();
  }
}

/** The error is one of the site's own files failing to load (most often: the site was updated). */
export function isStaleBuild(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  return /dynamically imported module|importing a module script failed|not a valid javascript mime type|unable to preload css/i.test(message);
}

/** Load the site afresh, as it is now. False when it already did in the last minute (or can't tell). */
export function loadNewVersion(): boolean {
  if (reloading) return true;
  if (held) {
    waiting = true;
    return false;
  }
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
