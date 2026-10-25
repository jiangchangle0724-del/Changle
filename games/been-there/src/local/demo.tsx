// Single-device demo: the whole room runs inside this page (no server). One device plays every
// human team in turn; the rest are computer teams. Progress is kept in this browser.
import { render } from "preact";
import type { ClientMsg } from "../room/protocol";
import { Room, type RoomState } from "../room/room";
import { setLang } from "../client/i18n";
import { identity, prefs } from "../client/prefs";
import { installAudioUnlock, setMuted } from "../client/sound";
import { onServer, setConn, update } from "../client/store";
import { disableWeather } from "../client/weather";
import { App } from "../client/ui/App";
import { setReduced, toggleMute } from "../client/ui/Settings";

const KEY = "bt.demo.room";
const env = { now: () => Date.now(), random: () => crypto.getRandomValues(new Uint32Array(1))[0] / 2 ** 32 };
const me = identity(".demo");
let room!: Room;
let timer: ReturnType<typeof setTimeout> | undefined;

function fresh() {
  room = Room.create("DEMO", env, { hotseat: true });
  room.join(me.cid, me.key, { name: prefs.name || (prefs.lang === "en" ? "Me" : "我"), lang: prefs.lang });
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

// No server here to ask for the weather.
disableWeather();
setLang(prefs.lang);
setMuted(prefs.muted);
setReduced(prefs.reduced);
installAudioUnlock();
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
