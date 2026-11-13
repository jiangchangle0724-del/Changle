/*
 * 两清 on a phone that shares its ledger (src/split/sync.ts and syncer.ts), against a server that
 * takes changes by the same rules the real one does, a signal that comes and goes, and answers
 * that get lost. Run with `npx tsx tests/split-sync.test.ts`
 *  1. With a signal: the ledger is made once, and what is recorded arrives.
 *  2. With none: the phone still records, keeps what it recorded, and sends it when it can.
 *  3. The answer is lost: sent again, counted once.
 *  4. Two phones: each sees what the other records, and one that was away catches up.
 *  5. Three phones, hundreds of things done, signals dropping: everyone ends with the server's ledger.
 *  6. What didn't stick is said, and what was merely done already is not.
 *  7. When the phone can't go on, it says why, and still records.
 *  8. The page is closed with changes waiting: they are sent when it opens again.
 */
import { accept, type Change, type Sent, type Took } from "../src/split/changes";
import { balances, nextRot, portionsOf, type Expense, type Ledger } from "../src/split/core";
import { startLedger } from "../src/split/ops";
import { hold, join, shown, type Held, type MakeBody, type Pushed, type Snapshot } from "../src/split/sync";
import { syncer, type Net, type Reply, type SyncState } from "../src/split/syncer";
import { rng } from "./split/ledgers";

let failed = 0;
function ok(cond: unknown, msg: string) {
  if (cond) console.log("ok  ", msg);
  else {
    failed++;
    console.log("FAIL", msg);
  }
}
const canon = (x: unknown): string =>
  JSON.stringify(x, (_k, v: unknown) => (v && typeof v === "object" && !Array.isArray(v) ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => (a < b ? -1 : 1))) : v));
const eq = (got: unknown, want: unknown, msg: string) => ok(canon(got) === canon(want), `${msg}${canon(got) === canon(want) ? "" : ` → ${canon(got)}, wanted ${canon(want)}`}`);
/** Let everything that is on its way arrive. */
const settle = async () => {
  for (let i = 0; i < 12; i++) await new Promise((r) => setTimeout(r, 0));
};

// ---------- a server, as the phones see it ----------
type Kept = { key: string; ledger: Ledger; seq: number; seen: Map<string, boolean>; ears: Set<(s: Snapshot) => void> };
class World {
  ledgers = new Map<string, Kept>();
  makes = 0;
  make(key: string, body: MakeBody): Reply<Snapshot> {
    const there = this.ledgers.get(body.id);
    if (there) return there.key === key ? { status: 200, data: { seq: there.seq, ledger: there.ledger } } : { status: 409 };
    const ledger = startLedger(body.id, body.name, body.currency, body.members);
    this.ledgers.set(body.id, { key, ledger, seq: 0, seen: new Map(), ears: new Set() });
    this.makes++;
    return { status: 201, data: { seq: 0, ledger } };
  }
  push(id: string, key: string, changes: Sent[]): Reply<Pushed> {
    const k = this.ledgers.get(id);
    if (!k) return { status: 404 };
    if (k.key !== key) return { status: 403 };
    const took: Took[] = [];
    for (const s of changes) {
      const got = accept(k.ledger, k.seen, s);
      k.ledger = got.ledger;
      took.push(got.took);
      if (got.took === "new") k.seq++;
    }
    if (took.includes("new")) for (const ear of [...k.ears]) ear({ seq: k.seq, ledger: k.ledger });
    return { status: 200, data: { seq: k.seq, ledger: k.ledger, took } };
  }
}

type Phone = ReturnType<typeof phone>;
function phone(world: World, name: string, held: Held) {
  const signal = { on: true, loseAnswers: 0, makeSays: 0, pushSays: 0 };
  const lines: ((status: number) => void)[] = [];
  let flying = 0;
  let mostAtOnce = 0;
  const answer = async <T>(real: () => Reply<T>, says: number): Promise<Reply<T>> => {
    mostAtOnce = Math.max(mostAtOnce, ++flying);
    try {
      await Promise.resolve();
      if (!signal.on) return { status: 0 };
      if (says) return { status: says };
      const reply = real(); // the server has it now, whatever becomes of the answer
      await Promise.resolve();
      if (!signal.on) return { status: 0 };
      if (signal.loseAnswers > 0) {
        signal.loseAnswers--;
        return { status: 0 };
      }
      return reply;
    } finally {
      flying--;
    }
  };
  const net: Net = {
    make: (key, body) => answer(() => world.make(key, body), signal.makeSays),
    push: (id, key, changes) => answer(() => world.push(id, key, changes), signal.pushSays),
    listen(id, key, on, down) {
      const k = world.ledgers.get(id);
      const refused = !signal.on ? 0 : !k ? 404 : k.key !== key ? 403 : -1;
      if (refused >= 0 || !k) {
        queueMicrotask(() => down(Math.max(refused, 0)));
        return () => undefined;
      }
      k.ears.add(on);
      const drop = (status: number) => {
        if (k.ears.delete(on)) down(status);
      };
      lines.push(drop);
      queueMicrotask(() => k.ears.has(on) && on({ seq: k.seq, ledger: k.ledger }));
      return () => void k.ears.delete(on);
    },
  };
  const timers: { run: () => void; off: boolean }[] = [];
  let saved = held;
  let last: SyncState | null = null;
  let n = 0;
  const s = syncer({
    held,
    net,
    save: (h) => (saved = h),
    changed: (st) => (last = st),
    later: (run) => {
      const t = { run, off: false };
      timers.push(t);
      return () => {
        t.off = true;
      };
    },
    newId: () => `${name}-${++n}`,
    now: () => 1000 + n,
  });
  return {
    s,
    signal,
    saved: () => saved,
    last: () => last,
    ledger: () => shown(s.state().held),
    waits: () => timers.filter((t) => !t.off).length,
    /** the most requests this phone ever had on their way at once */
    atOnce: () => mostAtOnce,
    /** the time it was waiting for has come */
    fire: () => timers.splice(0).forEach((t) => t.off || t.run()),
    away: () => {
      signal.on = false;
      lines.splice(0).forEach((drop) => drop(0));
    },
    back: () => {
      signal.on = true;
      s.wake();
    },
    spend: (id: string, amount = 3000, among = ["s", "w", "m"]): boolean =>
      s.do({ do: "expense", expense: { kind: "expense", id, at: 1, payer: among[0], amount, note: "", split: { how: "equal", among }, rot: nextRot(shown(s.state().held)) } }),
  };
}

const people = [
  { id: "s", name: "Steve" },
  { id: "w", name: "小王" },
  { id: "m", name: "阿美" },
];
const fresh = (id = "ledger-1") => startLedger(id, "周末", "CAD", people);
const ids = (l: Ledger) => l.entries.map((e) => e.id);

// ---------- 1. with a signal ----------
{
  const world = new World();
  const a = phone(world, "a", hold(fresh(), "k"));
  a.s.wake();
  await settle();
  eq([a.s.state().held.made, a.s.state().live, world.makes, a.s.state().sending], [true, true, 1, false], "opened with a signal: the server makes the ledger, once, and the phone is listening");
  ok(a.spend("e1") && a.spend("e2", 100) && a.s.state().held.waiting.length === 2 && ids(a.ledger()).length === 2, "two expenses are on the screen at once, before any answer");
  await settle();
  const k = world.ledgers.get("ledger-1")!;
  eq([ids(k.ledger), k.seq, a.s.state().held.waiting.length, a.s.state().held.seq, a.last()?.sending], [["e1", "e2"], 2, 0, 2, false], "and they arrive, in order, with nothing left waiting");
  eq(a.ledger(), k.ledger, "the phone shows the server's ledger");
  ok(!a.s.do({ do: "transfer", transfer: { id: "t", at: 1, from: "s", to: "s", amount: 5 } }) && a.s.state().held.waiting.length === 0, "what the ledger doesn't allow isn't recorded, or sent");
}

// ---------- 2. with none ----------
{
  const world = new World();
  const a = phone(world, "a", hold(fresh(), "k"));
  a.away();
  a.s.wake();
  ok(a.spend("e1") && a.spend("e2") && a.spend("e3"), "no signal: three expenses are recorded all the same");
  await settle();
  eq([ids(a.ledger()), a.saved().waiting.length, a.s.state().held.made, world.makes, a.waits() > 0], [["e1", "e2", "e3"], 3, false, 0, true], "they show, they are kept on the phone, nothing has reached the server, and it means to try again");
  a.back();
  await settle();
  const k = world.ledgers.get("ledger-1")!;
  eq([ids(k.ledger), a.s.state().held.waiting.length, a.s.state().live, world.makes], [["e1", "e2", "e3"], 0, true, 1], "the signal is back: the ledger is made and the three go up, each once");
}

// ---------- 3. the answer is lost ----------
{
  const world = new World();
  const a = phone(world, "a", hold(fresh(), "k"));
  a.s.wake();
  await settle();
  a.signal.loseAnswers = 1;
  a.spend("e1", 10001);
  await settle();
  const k = world.ledgers.get("ledger-1")!;
  eq([ids(k.ledger), a.s.state().held.waiting.length, a.waits()], [["e1"], 1, 1], "the server took it and its answer never came: the phone still holds it, and waits to try again");
  a.spend("e2");
  a.fire();
  await settle();
  eq([ids(k.ledger), k.seq, a.s.state().held.waiting.length, a.s.state().held.seq], [["e1", "e2"], 2, 0, 2], "sent again with the next one: the first still counts once");
  a.signal.pushSays = 500;
  a.spend("e3");
  await settle();
  eq([a.s.state().trouble, a.s.state().held.waiting.length, a.waits()], [null, 1, 1], "the server is down: not a reason to give up, just to try later");
  a.signal.pushSays = 0;
  a.fire();
  await settle();
  eq([ids(k.ledger), a.s.state().held.waiting.length], [["e1", "e2", "e3"], 0], "and later it goes through");
}

// ---------- 4. two phones ----------
{
  const world = new World();
  const a = phone(world, "a", hold(fresh(), "k"));
  a.s.wake();
  await settle();
  const k = world.ledgers.get("ledger-1")!;
  const b = phone(world, "b", join({ seq: k.seq, ledger: k.ledger }, "k"));
  b.s.wake();
  await settle();
  a.spend("a1");
  await settle();
  eq([ids(b.ledger()), b.s.state().live], [["a1"], true], "what one phone records, the other sees without asking");
  b.away();
  b.spend("b1", 10000);
  b.spend("b2", 10001);
  const shownOnB = (b.ledger().entries.slice(-2) as Expense[]).map((e) => portionsOf(e, b.ledger()));
  a.spend("a2");
  await settle();
  eq([ids(a.ledger()), ids(b.ledger())], [["a1", "a2"], ["a1", "b1", "b2"]], "one of them away: each has its own until it is back");
  b.back();
  await settle();
  eq([ids(k.ledger), canon(a.ledger()) === canon(k.ledger), canon(b.ledger()) === canon(k.ledger)], [["a1", "a2", "b1", "b2"], true, true], "back: both show the server's ledger, with everything in it once");
  eq((k.ledger.entries.slice(-2) as Expense[]).map((e) => portionsOf(e, k.ledger)), shownOnB, "and what was recorded away is shared exactly as that phone showed it");
}

// ---------- 5. three phones, hundreds of things done ----------
{
  let good = 0;
  let done = 0;
  const why: string[] = [];
  for (let seed = 1; seed <= 20; seed++) {
    const r = rng(seed * 31);
    const pick = <X>(xs: X[]): X => xs[Math.floor(r() * xs.length)];
    const world = new World();
    const first = phone(world, "p0", hold(fresh(), "k"));
    first.s.wake();
    await settle();
    const k = world.ledgers.get("ledger-1")!;
    const phones: Phone[] = [first, phone(world, "p1", join({ seq: 0, ledger: k.ledger }, "k")), phone(world, "p2", join({ seq: 0, ledger: k.ledger }, "k"))];
    phones.slice(1).forEach((p) => p.s.wake());
    const added: [Phone, string][] = [];
    for (let step = 0; step < 150; step++) {
      const p = pick(phones);
      const l = p.ledger();
      const who = () => pick(l.members).id;
      const entry = () => (l.entries.length ? pick(l.entries).id : "none");
      const roll = r();
      let change: Change | null = null;
      if (roll < 0.45) {
        const among = [...new Set([who(), who(), who()])];
        const id = `e${seed}-${step}`;
        if (p.spend(id, 1 + Math.floor(r() * 20000), among)) added.push([p, id]);
      } else if (roll < 0.55) change = { do: "edit", entry: entry(), to: { payer: who(), amount: 1 + Math.floor(r() * 9000), note: "改", split: { how: "equal", among: [who()] } } };
      else if (roll < 0.63) change = { do: "out", entry: entry(), at: step };
      else if (roll < 0.67) change = { do: "back", entry: entry() };
      else if (roll < 0.75) change = { do: "transfer", transfer: { id: `t${seed}-${step}`, at: step, from: who(), to: who(), amount: 1 + Math.floor(r() * 5000) } };
      else if (roll < 0.8) change = { do: "member", member: { id: `n${step}`, name: pick(["Ann", "Bo", "Cy", "Di"]) } };
      else if (roll < 0.84) change = { do: "rename", member: who(), name: pick(["Ann", "Bo", "Eve", "Fay"]) };
      else if (roll < 0.92) (p.signal.on ? p.away : p.back)();
      else p.signal.loseAnswers = 1;
      if (change) p.s.do(change);
      done++;
      if (r() < 0.5) await settle();
      if (r() < 0.2) phones.forEach((q) => q.fire());
    }
    // everyone gets a signal, and time passes
    for (let round = 0; round < 6; round++) {
      phones.forEach((p) => p.back());
      await settle();
      phones.forEach((p) => p.fire());
      await settle();
    }
    const here = canon(k.ledger);
    const lostBy = (p: Phone) => new Set(p.s.state().held.lost.map((s) => (s.change.do === "expense" ? s.change.expense.id : "")));
    const sound =
      phones.every((p) => canon(p.ledger()) === here && p.s.state().held.waiting.length === 0 && p.s.state().trouble === null && p.s.state().held.seq === k.seq && p.atOnce() === 1) &&
      Object.values(balances(k.ledger)).reduce((a, x) => a + x, 0) === 0 &&
      new Set(ids(k.ledger)).size === k.ledger.entries.length &&
      added.every(([p, id]) => ids(k.ledger).includes(id) || lostBy(p).has(id));
    if (sound) good++;
    else if (why.length < 2)
      why.push(
        `seed ${seed}: ${phones.map((p) => `${p.s.state().held.waiting.length} waiting, ${p.s.state().trouble}, same ${canon(p.ledger()) === here}, seq ${p.s.state().held.seq}/${k.seq}`).join("; ")}; missing ${added
          .filter(([p, id]) => !ids(k.ledger).includes(id) && !lostBy(p).has(id))
          .map(([, id]) => id)
          .join(",")}`,
      );
  }
  ok(good === 20, `20 ledgers on three phones, ${done} things done with signals dropping and answers lost: everyone ends with the server's ledger, nothing waiting, every expense there once or on the list of what didn't stick, and no phone ever had two requests on their way at once → ${good}${why.length ? ` (${why.join(" | ")})` : ""}`);
}

// ---------- 6. what didn't stick ----------
{
  const world = new World();
  const a = phone(world, "a", hold(fresh(), "k"));
  a.s.wake();
  await settle();
  a.spend("e1");
  await settle();
  const k = world.ledgers.get("ledger-1")!;
  const b = phone(world, "b", join({ seq: k.seq, ledger: k.ledger }, "k"));
  b.s.wake();
  await settle();
  b.away();
  ok(b.s.do({ do: "rename", member: "w", name: "Zed" }) && b.s.do({ do: "out", entry: "e1", at: 5 }) && b.spend("e2", 900, ["w", "m"]), "away, one phone renames someone, takes an expense out and records another");
  a.s.do({ do: "rename", member: "m", name: "Zed" });
  a.s.do({ do: "out", entry: "e1", at: 3 });
  await settle();
  b.back();
  await settle();
  const lost = b.s.state().held.lost;
  eq([lost.map((s) => s.change.do), b.ledger().members.map((m) => m.name), ids(b.ledger()), (b.ledger().entries[0] as Expense).gone], [["rename"], ["Steve", "小王", "Zed"], ["e1", "e2"], 3], "meanwhile the other took that name and took the same expense out: only the rename didn't stick, and only it is said");
  b.s.dismiss(lost[0].id);
  eq([b.s.state().held.lost.length, b.saved().lost.length], [0, 0], "once the screen has said so, it is off the list");
}

// ---------- 7. when the phone can't go on ----------
{
  const world = new World();
  const a = phone(world, "a", hold(fresh(), "k"));
  a.signal.makeSays = 429;
  a.s.wake();
  await settle();
  ok(a.spend("e1"), "too many ledgers made today: the phone records anyway");
  await settle();
  eq([a.s.state().trouble, a.s.state().held.waiting.length, a.waits(), world.makes], ["limit", 1, 0, 0], "and it says why it isn't syncing, without trying over and over");

  const b = phone(world, "b", hold(fresh("ledger-2"), "k"));
  b.s.wake();
  await settle();
  world.ledgers.get("ledger-2")!.key = "changed";
  b.spend("e1");
  await settle();
  eq([b.s.state().trouble, b.s.state().live, ids(b.ledger())], ["key", false, ["e1"]], "the key no longer opens the ledger: said, the connection dropped, what was recorded still on the phone");

  const c = phone(world, "c", hold(fresh("ledger-3"), "k"));
  c.s.wake();
  await settle();
  world.ledgers.delete("ledger-3");
  c.spend("e1");
  await settle();
  eq([c.s.state().trouble, c.s.state().held.waiting.length], ["gone", 1], "the ledger is gone from the server: said");

  const d = phone(world, "d", join({ seq: 0, ledger: fresh("ledger-2") }, "old key"));
  d.s.wake();
  await settle();
  eq([d.s.state().trouble, d.s.state().live], ["key", false], "an old link: the live connection is refused, and that is said too");

  const e = phone(world, "e", hold(fresh("ledger-2"), "another key"));
  e.s.wake();
  await settle();
  eq(e.s.state().trouble, "taken", "an id someone else's key already holds");
}

// ---------- 8. the page is closed with changes waiting ----------
{
  const world = new World();
  const a = phone(world, "a", hold(fresh(), "k"));
  a.s.wake();
  await settle();
  a.away();
  a.spend("e1");
  a.spend("e2");
  await settle();
  a.s.stop();
  const kept = JSON.parse(JSON.stringify(a.saved())) as Held;
  a.signal.on = true;
  a.fire();
  await settle();
  eq(ids(world.ledgers.get("ledger-1")!.ledger), [], "closed: nothing more is sent from that page");
  const again = phone(world, "a2", kept);
  again.s.wake();
  await settle();
  eq([ids(world.ledgers.get("ledger-1")!.ledger), again.s.state().held.waiting.length, again.s.state().live], [["e1", "e2"], 0, true], "opened again from what the phone kept: the two go up");
}

if (failed) {
  console.log(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nall passed");
