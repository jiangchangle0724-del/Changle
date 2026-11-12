// Single-device demo: the whole room runs inside this page (no server). One device plays every
// human team in turn; the rest are computer teams. Progress is kept in this browser.
import { render } from "preact";
import { WORLD_IDS, type WorldId } from "../engine/world";
import type { ClientMsg } from "../room/protocol";
import { Room, type RoomState } from "../room/room";
import { triviaSources } from "../room/trivia";
import { setLang } from "../client/i18n";
import { identity, prefs, seenTrivia } from "../client/prefs";
import { setTriviaSources } from "../client/triviaSources";
import { installAudioUnlock, setMuted } from "../client/sound";
import { installKeyboard } from "../client/keyboard";
import { installReports } from "../client/report";
import { onServer, setConn, update } from "../client/store";
import { disableWeather } from "../client/weather";
import { App } from "../client/ui/App";
import { setReduced, toggleMute } from "../client/ui/Settings";

const KEY = "bt.demo.room";
const env = { now: () => Date.now(), random: () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32 };
const me = identity(".demo");
let room!: Room;
let timer: ReturnType<typeof setTimeout> | undefined;

/**
 * Tests only: a browser test can script the dice (thrown in the order the teams were made), the pace
 * and the world events (how often, in ms, and which) before the page loads,
 * `window.__demoTest = { dice: [4, 5], speed: 0.3, worldEvery: 4000, worldOrder: ["meteor"] }`, as it
 * fixes the map's sun with `__sunAt`. Anything else there is ignored.
 */
function testSettings(): { dice?: number[]; inOrder?: boolean; speed?: number; worldEvery?: number; worldOrder?: WorldId[] } {
  const t = (globalThis as { __demoTest?: { dice?: unknown; speed?: unknown; worldEvery?: unknown; worldOrder?: unknown } }).__demoTest;
  if (!t || typeof t !== "object") return {};
  const dice = Array.isArray(t.dice) && t.dice.length && t.dice.every((d) => Number.isInteger(d) && d >= 1 && d <= 6) ? (t.dice as number[]) : null;
  const speed = typeof t.speed === "number" && t.speed > 0 && t.speed <= 1 ? t.speed : null;
  const every = typeof t.worldEvery === "number" && t.worldEvery > 0 ? t.worldEvery : null;
  const order = Array.isArray(t.worldOrder) ? t.worldOrder.filter((id): id is WorldId => WORLD_IDS.includes(id)) : [];
  return {
    ...(dice ? { dice, inOrder: true } : {}),
    ...(speed ? { speed } : {}),
    ...(every ? { worldEvery: every } : {}),
    ...(order.length ? { worldOrder: order } : {}),
  };
}

function fresh() {
  room = Room.create("DEMO", env, { hotseat: true, ...testSettings() });
  room.join(me.cid, me.key, { name: prefs.name || (prefs.lang === "en" ? "Me" : "我"), lang: prefs.lang });
  room.handle(me.cid, { t: "seen", ids: seenTrivia() });
  room.handle(me.cid, { t: "team", op: "create" });
  room.handle(me.cid, { t: "bot", op: "add", style: "balanced" });
  room.handle(me.cid, { t: "bot", op: "add", style: "gambler" });
  room.handle(me.cid, { t: "bot", op: "add", style: "tycoon" });
}

function restore() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return false;
    const st = JSON.parse(raw) as RoomState;
    room = new Room(st, env);
    room.presence([]);
    return room.join(me.cid, me.key, { lang: prefs.lang });
  } catch {
    return false;
  }
}

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(room.st));
  } catch {
    // storage full or blocked: the demo still works, it just won't survive a reload
  }
}

function pump() {
  const out = room.flush();
  for (const [id, msg] of out.direct) if (id === me.cid) onServer(msg);
  if (out.changed) {
    onServer({ t: "view", view: room.view(me.cid) });
    persist();
  }
  clearTimeout(timer);
  const wake = room.nextWake();
  if (wake !== null && wake - Date.now() < 2 ** 30)
    timer = setTimeout(() => {
      room.tick();
      pump();
    }, Math.max(0, wake - Date.now()));
}

function reset() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // ignore
  }
  fresh();
  pump();
}

// No server here to ask for the weather; the quiz's sources are in the page already (the room is).
disableWeather();
setTriviaSources(triviaSources());
setLang(prefs.lang);
setMuted(prefs.muted);
setReduced(prefs.reduced);
installAudioUnlock();
installKeyboard();
// (only at changle.ca/trip/demo: the page opened from a file or in an artifact has no server to tell)
installReports(() => ({
  screen: "demo",
  phase: !room?.st.game ? "lobby" : room.st.game.s.over ? "over" : "playing",
  lang: prefs.lang,
  online: true,
}));
// iPhone Safari only shows a button pressed (:active) when the page listens for touches.
document.addEventListener("touchstart", () => {}, { passive: true });
document.addEventListener("keydown", (e) => {
  const el = e.target as HTMLElement;
  if (e.key.toLowerCase() === "m" && !/^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) toggleMute();
});

if (!restore()) fresh();
setConn({
  send(msg: ClientMsg) {
    room.handle(me.cid, msg);
    pump();
  },
  close() {},
});
update({ status: "open" });
render(<App home={reset} demo />, document.getElementById("app")!);
pump();
onServer({ t: "view", view: room.view(me.cid) });
