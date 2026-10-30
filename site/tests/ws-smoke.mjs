// Smoke test against a running room server: node tests/ws-smoke.mjs [baseUrl]
const BASE = process.argv[2] || "ws://127.0.0.1:8787";
const CODE = "T" + "ABCDEFGHJKMN"[Math.floor(Math.random() * 12)] + "Q" + "23456789"[Math.floor(Math.random() * 8)];

function client(pid, name, create) {
  const ws = new WebSocket(`${BASE}/room/${CODE}/ws`, { headers: { Origin: "http://localhost:5173" } });
  const st = { ws, room: null, events: [], errors: [], strokes: [] };
  ws.addEventListener("open", () => ws.send(JSON.stringify({ t: "hello", pid, name, create })));
  ws.addEventListener("message", (e) => {
    const m = JSON.parse(e.data);
    if (m.t === "room") st.room = m.room;
    if (m.t === "event") st.events.push(m.e);
    if (m.t === "error") st.errors.push(m.code);
    if (m.t === "stroke") st.strokes.push(m.op);
  });
  st.act = (a) => ws.send(JSON.stringify({ t: "act", a }));
  st.g = (x, rest = {}) => st.act({ a: "g", g: { x, ...rest } });
  return st;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
let fails = 0;
const ok = (c, m) => {
  console.log((c ? "ok   " : "FAIL ") + m);
  if (!c) fails++;
};

const a = client("pa", "Alice", true);
await wait(400);
const b = client("pb", "Bob", false);
const c = client("pc", "Cat", false);
await wait(500);
ok(a.room?.seats.length === 3, `three seated (${a.room?.seats.length})`);
ok(b.room?.you === "pb" && b.room.host === "pa", "views are per player; Alice hosts");

const info = await (await fetch(`${BASE.replace(/^ws/, "http")}/room/${CODE}/info`, { headers: { Origin: "http://localhost:5173" } })).json();
ok(info.exists && info.seated === 3, "info endpoint");

a.act({ a: "start", game: "draw" });
await wait(200);
a.g("pick", { d: 1 });
await wait(200);
ok(a.room.game.word && !b.room.game.word, "draw word only on drawer phone");
a.ws.send(JSON.stringify({ t: "stroke", op: { o: "b", id: "k1", c: "#1f3f8e", w: 0.01, p: [0.2, 0.2] } }));
a.ws.send(JSON.stringify({ t: "stroke", op: { o: "p", id: "k1", p: [0.3, 0.3, 0.4, 0.4] } }));
await wait(200);
ok(b.strokes.length >= 2 && c.strokes.length >= 2, "strokes relayed to guessers");
b.g("guess", { text: a.room.game.word.zh });
await wait(200);
ok(c.room.game.solved.includes("pb"), "guess solved");
ok(c.events.some((e) => e.k === "fx" && e.fx === "correct"), "correct fx to all");

// reconnect keeps the seat
b.ws.close();
await wait(300);
ok(a.room.seats.find((s) => s.id === "pb")?.on === false, "Bob shows offline");
const b2 = client("pb", "Bob", false);
await wait(400);
ok(a.room.seats.find((s) => s.id === "pb")?.on === true && b2.room?.game?.id === "draw", "Bob back in the same seat and game");

// origin check
const bad = await fetch(`${BASE.replace(/^ws/, "http")}/room/${CODE}/info`, { headers: { Origin: "https://evil.example" } });
ok(bad.status === 403, "foreign origin refused");

for (const x of [a, b2, c]) x.ws.close();
await wait(200);
console.log(fails ? `${fails} failed` : "smoke passed");
process.exit(fails ? 1 : 0);
