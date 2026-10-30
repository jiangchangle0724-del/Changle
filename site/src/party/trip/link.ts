/**
 * The way from a table into 到此一游 and back. The game lives at changle.ca/trip (same site, so it
 * shares this phone's storage): the host's phone opens a room there, the table keeps its number,
 * and every phone goes there carrying its name, language and sound setting. The game's back
 * buttons lead to the table again; its last screen leaves a note so the host's phone ends the game
 * here and everyone lands in the table's lobby.
 */

export const TRIP = "/trip";

function read(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function write(k: string, v: string) {
  try {
    localStorage.setItem(k, v);
  } catch {
    // private mode: the game asks again
  }
}
function session(k: string, v?: string | null): string | null {
  try {
    if (v === undefined) return sessionStorage.getItem(k);
    if (v === null) sessionStorage.removeItem(k);
    else sessionStorage.setItem(k, v);
  } catch {
    // no session storage: every visit counts as the first
  }
  return null;
}

function hex(bytes: number) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, "0")).join("");
}

/** This phone's id in the game (it keeps the seat there), made the way the game makes it. */
export function tripIdentity(screen = false): { cid: string; key: string } {
  const scope = screen ? ".tv" : "";
  let cid = read(`bt.cid${scope}`);
  let key = read(`bt.key${scope}`);
  if (!cid || !key) {
    cid = hex(12);
    key = hex(24);
    write(`bt.cid${scope}`, cid);
    write(`bt.key${scope}`, key);
  }
  return { cid, key };
}

/** What the game should know about this phone before it gets there. */
export function handOff(name: string, lang: "zh" | "en", sound: boolean) {
  const n = name.replace(/\s+/g, " ").trim().slice(0, 16);
  if (n) write("bt.name", n);
  write("bt.lang", lang);
  write("bt.muted", sound ? "0" : "1");
}

type Opened = { code: string } | { error: string };

async function post(path: string, body: unknown): Promise<Opened> {
  try {
    const r = await fetch(`${TRIP}/api${path}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const d = (await r.json().catch(() => ({}))) as { code?: unknown; error?: unknown };
    if (r.ok && typeof d.code === "string" && /^\d{4}$/.test(d.code)) return { code: d.code };
    return { error: typeof d.error === "string" ? d.error : "busy" };
  } catch {
    return { error: "offline" };
  }
}

/** The host opens a room for this table; this phone is kept the host there. */
export const openTrip = (table: string) => post("/rooms", { host: tripIdentity().cid, table });

/** Carry on a saved game (its 6-letter code) in a new room for this table. */
export const loadTrip = (save: string, table: string) => post(`/saves/${encodeURIComponent(save.trim().toUpperCase())}/load`, { host: tripIdentity().cid, table });

/** Where the game is: a phone's seat, or the big screen. */
export const tripUrl = (code: string, table: string, screen = false) => `${TRIP}/${screen ? "tv" : "r"}/${code}?table=${table}`;

/** Each phone goes into a game by itself once; after that (it came back to the table) it asks. */
export const wentTo = (code: string, screen = false) => session(`trip.went${screen ? ".tv" : ""}`) === code;
export const markWent = (code: string, screen = false) => void session(`trip.went${screen ? ".tv" : ""}`, code);

/** The game's last screen sent this phone back: the game is over. (Read once.) */
export function cameBackFromEnd(code: string): boolean {
  const over = session("trip.over");
  if (over !== code) return false;
  session("trip.over", null);
  return true;
}

/** How the game is going, from its server. */
export async function tripPhase(code: string): Promise<"lobby" | "playing" | "over" | "gone" | null> {
  try {
    const r = await fetch(`${TRIP}/api/rooms/${code}`);
    if (!r.ok) return null;
    const d = (await r.json()) as { exists?: boolean; phase?: string };
    if (!d.exists) return "gone";
    return d.phase === "lobby" || d.phase === "playing" || d.phase === "over" ? d.phase : null;
  } catch {
    return null;
  }
}
