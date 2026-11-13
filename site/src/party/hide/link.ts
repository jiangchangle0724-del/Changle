/**
 * The way from a table into 藏在人群里 · Hide in the Crowd and back. The game lives at changle.ca/hide
 * (games/hide-crowd in the changle-ca repository; same site, so it shares this phone's storage): the
 * host's phone opens a room there, carrying the table's number and the table's own penalty; every
 * phone goes there with its name and language, and the big screen goes to the game's big screen.
 * The game's back buttons lead to the table again; when the host takes everyone back, each page
 * leaves a note so the host's phone ends the game here and everyone lands in the table's lobby.
 */

export const HIDE = "/hide";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function write(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {
    // private mode: the game asks again
  }
}
function session(key: string, value?: string | null): string | null {
  try {
    if (value === undefined) return sessionStorage.getItem(key);
    if (value === null) sessionStorage.removeItem(key);
    else sessionStorage.setItem(key, value);
  } catch {
    // no session storage: every visit counts as the first
  }
  return null;
}

function hex(bytes: number) {
  const values = new Uint8Array(bytes);
  crypto.getRandomValues(values);
  return Array.from(values, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** This phone's id in the game (it keeps the seat there), made the way the game makes it. */
export function hideIdentity(screen = false): string {
  const key = screen ? "hc.cid.tv" : "hc.cid";
  let id = read(key);
  if (!id || !/^[0-9a-f]{24}$/.test(id)) {
    id = hex(12);
    write(key, id);
  }
  return id;
}

/** What the game should know about this phone before it gets there: its name, its language, and whether the site's sound is on. */
export function handOff(name: string, lang: "zh" | "en", sound: boolean) {
  const clean = name.replace(/\s+/g, " ").trim().slice(0, 16);
  if (clean) write("hc.name", clean);
  write("hc.lang", lang);
  write("hc.sound", sound ? "1" : "0");
}

type Opened = { code: string } | { error: string };

/** The host opens a room for this table (this phone is kept its host there), with the table's own penalty. */
export async function openHide(table: string, penalty: string): Promise<Opened> {
  try {
    const response = await fetch(`${HIDE}/api/rooms`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ host: hideIdentity(), table, penalty: penalty.trim().slice(0, 60) }),
    });
    const data = (await response.json().catch(() => ({}))) as { code?: unknown; error?: unknown };
    if (response.ok && typeof data.code === "string" && /^\d{4}$/.test(data.code)) return { code: data.code };
    return { error: typeof data.error === "string" ? data.error : "busy" };
  } catch {
    return { error: "offline" };
  }
}

/** Where the game is: a phone's seat, or the big screen. */
export const hideUrl = (code: string, table: string, screen = false) => `${HIDE}/${screen ? "tv" : "r"}/${code}?table=${table}`;

/** Each phone (and the big screen) goes into a game by itself once; after that (it came back to the table) it asks. */
export const wentTo = (code: string, screen = false) => session(`hide.went${screen ? ".tv" : ""}`) === code;
export const markWent = (code: string, screen = false) => void session(`hide.went${screen ? ".tv" : ""}`, code);

/** The game sent this page back because the game is over. (Read once.) */
export function cameBackFromEnd(code: string, screen = false): boolean {
  const key = screen ? "hide.over.tv" : "hide.over";
  if (session(key) !== code) return false;
  session(key, null);
  return true;
}

/** How the game is going, from its server. */
export async function hidePhase(code: string): Promise<"lobby" | "playing" | "over" | "gone" | null> {
  try {
    const response = await fetch(`${HIDE}/api/rooms/${code}`);
    if (!response.ok) return null;
    const data = (await response.json()) as { exists?: boolean; phase?: string };
    if (!data.exists) return "gone";
    return data.phase === "lobby" || data.phase === "playing" || data.phase === "over" ? data.phase : null;
  } catch {
    return null;
  }
}
