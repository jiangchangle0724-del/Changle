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
 *  9. A ledger that isn't open on the screen sends what it has and doesn't listen.
 * 10. "No signal" is said after the second miss, not the first, and unsaid by the first answer.
 * 11. A trouble that can pass is tried again when the page comes back; one that can't is left.
 * 12. News the phone already has changes nothing; two tabs on one ledger are told once.
 * 13. The ledger is taken off the phone with a request on its way: nothing is written back.
 * 14. A ledger that is a card in the list is asked where it stands, once, and only when nothing else would say.
 * 15. Its owner locks a ledger: nobody records, what was waiting stays on the phone, and goes when it is opened again.
 * 16. Its owner changes the key: the owner's phone carries on, a friend's is shut out until it has the new invitation.
 */
import { accept, type Change, type Sent, type Took } from "../src/split/changes";
import { balances, nextRot, portionsOf, type Expense, type Ledger } from "../src/split/core";
import { startLedger } from "../src/split/ops";
import { heard, hold, holds, join, opened, shown, type Held, type MakeBody, type Pushed, type Snapshot } from "../src/split/sync";
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
type Kept = { key: string; owner?: string; ledger: Ledger; seq: number; seen: Map<string, boolean>; ears: Set<(s: Snapshot) => void>; lines: Set<(status: number) => void> };
class World {
  ledgers = new Map<string, Kept>();
  makes = 0;
  make(key: string, body: MakeBody, owner?: string): Reply<Snapshot> {
    const there = this.ledgers.get(body.id);
    if (there) return there.key === key ? { status: 200, data: { seq: there.seq, ledger: there.ledger } } : { status: 409 };
    const ledger = startLedger(body.id, body.name, body.currency, body.members);
    this.ledgers.set(body.id, { key, owner, ledger, seq: 0, seen: new Map(), ears: new Set(), lines: new Set() });
    this.makes++;
    return { status: 201, data: { seq: 0, ledger } };
  }
  read(id: string, key: string): Reply<Snapshot> {
    const k = this.ledgers.get(id);
    if (!k) return { status: 404 };
    return k.key === key ? { status: 200, data: { seq: k.seq, ledger: k.ledger } } : { status: 403 };
  }
  push(id: string, key: string, changes: Sent[]): Reply<Pushed> {
    const k = this.ledgers.get(id);
    if (!k) return { status: 404 };
    if (k.key !== key) return { status: 403 };
    // locked, it takes nothing new (what it took before it still answers for)
    if (k.ledger.locked !== undefined && changes.some((s) => k.seen.get(s.id) === undefined)) return { status: 423 };
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
  /** The owner changes the key: whoever was listening was let in by the old one, and is let go. */
  rekey(id: string, owner: string, next: string): Reply<Snapshot> {
    const k = this.ledgers.get(id);
    if (!k) return { status: 404 };
    if (!k.owner || k.owner !== owner) return { status: 403 };
    if (k.key !== next) {
      k.key = next;
      for (const drop of [...k.lines]) drop(403);
    }
    return { status: 200, data: { seq: k.seq, ledger: k.ledger } };
  }
  /** The owner locks the ledger, or opens it: a number of its own, and everyone listening is told. */
  lock(id: string, owner: string, locked: boolean): Reply<Snapshot> {
    const k = this.ledgers.get(id);
    if (!k) return { status: 404 };
    if (!k.owner || k.owner !== owner) return { status: 403 };
    if ((k.ledger.locked !== undefined) !== locked) {
      const { locked: _since, ...open } = k.ledger;
      k.ledger = locked ? { ...open, locked: 777 } : open;
      k.seq++;
      for (const ear of [...k.ears]) ear({ seq: k.seq, ledger: k.ledger });
    }
    return { status: 200, data: { seq: k.seq, ledger: k.ledger } };
  }
}

/** What one phone keeps of a ledger (two tabs on one phone share it), and how often it has changed. */
type OnPhone = { held: Held | null; writes: number };
const keeps = (held: Held): OnPhone => ({ held, writes: 0 });

type Phone = ReturnType<typeof phone>;
function phone(world: World, name: string, from: Held | OnPhone, watching?: boolean) {
  const box: OnPhone = "writes" in from ? from : keeps(from);
  const held = () => box.held as Held;
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
    make: (key, body, owner) => answer(() => world.make(key, body, owner), signal.makeSays),
    read: (id, key) => answer(() => world.read(id, key), 0),
    push: (id, key, changes) => answer(() => world.push(id, key, changes), signal.pushSays),
    rekey: (id, owner, next) => answer(() => world.rekey(id, owner, next), 0),
    lock: (id, owner, locked) => answer(() => world.lock(id, owner, locked), 0),
    listen(id, key, on, down) {
      const k = world.ledgers.get(id);
      const refused = !signal.on ? 0 : !k ? 404 : k.key !== key ? 403 : -1;
      if (refused >= 0 || !k) {
        queueMicrotask(() => down(Math.max(refused, 0)));
        return () => undefined;
      }
      k.ears.add(on);
      const drop = (status: number) => {
        k.lines.delete(drop);
        if (k.ears.delete(on)) down(status);
      };
      lines.push(drop);
      k.lines.add(drop);
      queueMicrotask(() => k.ears.has(on) && on({ seq: k.seq, ledger: k.ledger }));
      return () => {
        k.lines.delete(drop);
        k.ears.delete(on);
      };
    },
  };
  const timers: { run: () => void; off: boolean }[] = [];
  let last: SyncState | null = null;
  const told: SyncState[] = [];
  let n = 0;
  let listens = 0;
  let asks = 0;
  let reads = 0;
  const counted: Net = {
    make: (...args) => (asks++, net.make(...args)),
    read: (...args) => (reads++, net.read(...args)),
    push: (...args) => (asks++, net.push(...args)),
    rekey: (...args) => (asks++, net.rekey(...args)),
    lock: (...args) => (asks++, net.lock(...args)),
    listen: (...args) => (listens++, net.listen(...args)),
  };
  const s = syncer({
    read: () => box.held,
    write: (how) => {
      if (!box.held) return;
      const next = how(box.held);
      if (next === box.held) return;
      box.held = next;
      box.writes++;
    },
    net: counted,
    watching,
    changed: (st) => void told.push((last = st)),
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
    box,
    held,
    last: () => last,
    /** every state the screen was told, in order */
    told: () => told,
    /** how many times it has started listening, and how many requests it has made */
    listens: () => listens,
    asks: () => asks,
    /** how many times it has asked where the ledger stands */
    reads: () => reads,
    ledger: () => shown(held()),
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
      s.do({ do: "expense", expense: { kind: "expense", id, at: 1, payer: among[0], amount, note: "", split: { how: "equal", among }, rot: nextRot(shown(held())) } }),
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
  eq([a.held().made, a.s.state().live, world.makes, a.s.state().sending], [true, true, 1, false], "opened with a signal: the server makes the ledger, once, and the phone is listening");
  ok(a.spend("e1") && a.spend("e2", 100) && a.held().waiting.length === 2 && ids(a.ledger()).length === 2, "two expenses are on the screen at once, before any answer");
  await settle();
  const k = world.ledgers.get("ledger-1")!;
  eq([ids(k.ledger), k.seq, a.held().waiting.length, a.held().seq, a.last()?.sending], [["e1", "e2"], 2, 0, 2, false], "and they arrive, in order, with nothing left waiting");
  eq(a.ledger(), k.ledger, "the phone shows the server's ledger");
  ok(!a.s.do({ do: "transfer", transfer: { id: "t", at: 1, from: "s", to: "s", amount: 5 } }) && a.held().waiting.length === 0, "what the ledger doesn't allow isn't recorded, or sent");
}

// ---------- 2. with none ----------
{
  const world = new World();
  const a = phone(world, "a", hold(fresh(), "k"));
  a.away();
  a.s.wake();
  ok(a.spend("e1") && a.spend("e2") && a.spend("e3"), "no signal: three expenses are recorded all the same");
  await settle();
  eq([ids(a.ledger()), a.held().waiting.length, a.held().made, world.makes, a.waits() > 0], [["e1", "e2", "e3"], 3, false, 0, true], "they show, they are kept on the phone, nothing has reached the server, and it means to try again");
  a.back();
  await settle();
  const k = world.ledgers.get("ledger-1")!;
  eq([ids(k.ledger), a.held().waiting.length, a.s.state().live, world.makes], [["e1", "e2", "e3"], 0, true, 1], "the signal is back: the ledger is made and the three go up, each once");
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
  eq([ids(k.ledger), a.held().waiting.length, a.waits()], [["e1"], 1, 1], "the server took it and its answer never came: the phone still holds it, and waits to try again");
  a.spend("e2");
  a.fire();
  await settle();
  eq([ids(k.ledger), k.seq, a.held().waiting.length, a.held().seq], [["e1", "e2"], 2, 0, 2], "sent again with the next one: the first still counts once");
  a.signal.pushSays = 500;
  a.spend("e3");
  await settle();
  eq([a.s.state().trouble, a.held().waiting.length, a.waits()], [null, 1, 1], "the server is down: not a reason to give up, just to try later");
  a.signal.pushSays = 0;
  a.fire();
  await settle();
  eq([ids(k.ledger), a.held().waiting.length], [["e1", "e2", "e3"], 0], "and later it goes through");
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
    const lostBy = (p: Phone) => new Set(p.held().lost.map((s) => (s.change.do === "expense" ? s.change.expense.id : "")));
    const sound =
      phones.every((p) => canon(p.ledger()) === here && p.held().waiting.length === 0 && p.s.state().trouble === null && p.held().seq === k.seq && p.atOnce() === 1) &&
      Object.values(balances(k.ledger)).reduce((a, x) => a + x, 0) === 0 &&
      new Set(ids(k.ledger)).size === k.ledger.entries.length &&
      added.every(([p, id]) => ids(k.ledger).includes(id) || lostBy(p).has(id));
    if (sound) good++;
    else if (why.length < 2)
      why.push(
        `seed ${seed}: ${phones.map((p) => `${p.held().waiting.length} waiting, ${p.s.state().trouble}, same ${canon(p.ledger()) === here}, seq ${p.held().seq}/${k.seq}`).join("; ")}; missing ${added
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
  const lost = b.held().lost;
  eq([lost.map((s) => s.change.do), b.ledger().members.map((m) => m.name), ids(b.ledger()), (b.ledger().entries[0] as Expense).gone], [["rename"], ["Steve", "小王", "Zed"], ["e1", "e2"], 3], "meanwhile the other took that name and took the same expense out: only the rename didn't stick, and only it is said");
  b.s.dismiss(lost[0].id);
  eq(b.held().lost.length, 0, "once the screen has said so, it is off the list");

  // a change to an expense paid in another currency: does the ledger say what the change was for?
  const said = { payer: "s", note: "", split: { how: "equal" as const, among: ["s", "w"] } };
  const usd = { currency: "USD", amount: 3000, rate: "1.40" };
  const abroad: Ledger = { ...fresh(), entries: [{ kind: "expense", id: "x", at: 1, ...said, amount: 4200, rot: 0, paidIn: usd }] };
  const plain: Ledger = { ...fresh(), entries: [{ kind: "expense", id: "x", at: 1, ...said, amount: 4200, rot: 0 }] };
  const to = (paidIn?: Expense["paidIn"] | null): Change => ({ do: "edit", entry: "x", to: { ...said, amount: 4200, ...(paidIn === undefined ? {} : { paidIn }) } });
  eq(
    [holds(abroad, to({ rate: "1.40", amount: 3000, currency: "USD" })), holds(abroad, to({ ...usd, rate: "1.39" })), holds(abroad, to(null)), holds(abroad, to()), holds(plain, to(null)), holds(plain, to(usd)), holds(plain, to())],
    [true, false, false, true, true, false, true],
    "a change that says the other currency is done when the ledger says the same one, one that says there is none when it has none, and one that says nothing whatever it has",
  );
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
  eq([a.s.state().trouble, a.held().waiting.length, a.waits(), world.makes], ["limit", 1, 0, 0], "and it says why it isn't syncing, without trying over and over");

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
  eq([c.s.state().trouble, c.held().waiting.length], ["gone", 1], "the ledger is gone from the server: said");

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
  const kept = JSON.parse(JSON.stringify(a.held())) as Held;
  a.signal.on = true;
  a.fire();
  await settle();
  eq(ids(world.ledgers.get("ledger-1")!.ledger), [], "closed: nothing more is sent from that page");
  const again = phone(world, "a2", kept);
  again.s.wake();
  await settle();
  eq([ids(world.ledgers.get("ledger-1")!.ledger), again.held().waiting.length, again.s.state().live], [["e1", "e2"], 0, true], "opened again from what the phone kept: the two go up");
}

// ---------- 9. a ledger that isn't open on the screen ----------
{
  const world = new World();
  const a = phone(world, "a", hold(fresh(), "k"), false);
  a.s.wake();
  await settle();
  ok(a.spend("e1"), "a ledger that isn't open on the screen still records");
  await settle();
  const k = world.ledgers.get("ledger-1")!;
  eq([a.held().made, ids(k.ledger), a.held().waiting.length, a.s.state().live, a.listens(), k.ears.size], [true, ["e1"], 0, false, 0, 0], "it is made and what was recorded goes up, with no connection held open");
  a.s.watch(true);
  await settle();
  eq([a.s.state().live, a.listens(), k.ears.size], [true, 1, 1], "opened on the screen: it listens");
  const b = phone(world, "b", join({ seq: k.seq, ledger: k.ledger }, "k"));
  b.s.wake();
  await settle();
  b.spend("b1");
  await settle();
  eq(ids(a.ledger()), ["e1", "b1"], "and hears what another phone records");
  a.s.watch(false);
  eq([a.s.state().live, a.last()?.live, k.ears.size], [false, false, 1], "closed: it stops listening, and says so");
  b.spend("b2");
  await settle();
  eq(ids(a.ledger()), ["e1", "b1"], "so it doesn't hear the next one");
  ok(a.spend("e2"), "it still records");
  await settle();
  eq([ids(k.ledger), ids(a.ledger()), a.listens()], [["e1", "b1", "b2", "e2"], ["e1", "b1", "b2", "e2"], 1], "and still sends: the answer brings it up to date, without listening again");
  a.s.watch(true);
  a.s.watch(true);
  await settle();
  eq([a.listens(), k.ears.size, a.s.state().live], [2, 2, true], "opened again, said twice: one connection, not two");
}

// ---------- 10. when "no signal" is said ----------
{
  const world = new World();
  const a = phone(world, "a", hold(fresh(), "k"));
  a.s.wake();
  await settle();
  a.away();
  await settle();
  eq([a.s.state().away, a.s.state().live, a.waits()], [false, false, 1], "the connection drops: one miss says nothing yet, it just tries again");
  a.spend("e1");
  await settle();
  eq([a.s.state().away, a.waits()], [false, 1], "something else failing in the same moment is still the one miss");
  a.fire();
  await settle();
  eq([a.s.state().away, a.last()?.away, a.held().waiting.length], [true, true, 1], "the next try misses too: no signal, said, with what was recorded still waiting");
  a.s.wake();
  await settle();
  eq(a.s.state().away, true, "looking again and finding nothing doesn't unsay it");
  a.back();
  await settle();
  eq([a.s.state().away, a.held().waiting.length, a.s.state().live], [false, 0, true], "the first answer does");

  const b = phone(world, "b", hold(fresh("ledger-2"), "k"));
  b.away();
  b.s.wake();
  await settle();
  b.fire();
  await settle();
  eq([b.s.state().away, b.held().made], [true, false], "a ledger opened with no signal: said the same way, before it was ever made");
  b.signal.on = true;
  b.signal.makeSays = 429;
  b.fire();
  await settle();
  eq([b.s.state().away, b.s.state().trouble], [false, "limit"], "an answer that is a refusal is still an answer: the trouble is what is said now");
}

// ---------- 11. a trouble that can pass ----------
{
  const world = new World();
  const a = phone(world, "a", hold(fresh(), "k"));
  a.signal.makeSays = 429;
  a.s.wake();
  await settle();
  a.spend("e1");
  await settle();
  eq([a.s.state().trouble, a.asks(), a.waits()], ["limit", 1, 0], "too many ledgers today: asked once, and not again by itself");
  let from = a.told().length;
  a.s.wake();
  await settle();
  eq([a.s.state().trouble, a.asks(), a.waits(), a.told().slice(from).every((st) => st.trouble === "limit")], ["limit", 2, 0, true], "the page comes back to the front: asked once more, the same answer, and the trouble was said the whole time");
  a.away();
  from = a.told().length;
  a.s.wake();
  await settle();
  eq([a.s.state().trouble, a.asks(), a.waits()], [null, 3, 1], "asked again and nothing answers: it no longer knows, so it waits and tries like any phone with no signal");
  a.signal.on = true;
  a.signal.makeSays = 0;
  a.fire();
  await settle();
  eq([a.s.state().trouble, world.makes, ids(world.ledgers.get("ledger-1")!.ledger), a.held().waiting.length], [null, 1, ["e1"], 0], "the next day: the ledger is made and what was waiting goes up");

  const b = phone(world, "b", hold(fresh("ledger-2"), "k"));
  b.s.wake();
  await settle();
  b.signal.pushSays = 400;
  b.spend("e1");
  await settle();
  eq([b.s.state().trouble, b.held().waiting.length], ["stuck", 1], "the server won't take what was sent: said");
  b.signal.pushSays = 0;
  b.s.wake();
  await settle();
  eq([b.s.state().trouble, ids(world.ledgers.get("ledger-2")!.ledger), b.s.state().live], [null, ["e1"], true], "the server put right, the page back in front: it goes up, and the phone is listening again");

  const c = phone(world, "c", hold(fresh("ledger-3"), "k"));
  c.s.wake();
  await settle();
  world.ledgers.get("ledger-3")!.key = "changed";
  c.spend("e1");
  await settle();
  const asked = c.asks();
  c.s.wake();
  await settle();
  eq([c.s.state().trouble, c.asks() - asked, c.s.state().live], ["key", 0, false], "a key that no longer opens the ledger is a fact: nothing is asked again");
}

// ---------- 12. news the phone already has ----------
{
  const ledger = fresh();
  const h = join({ seq: 3, ledger }, "k");
  const next = { ...ledger, name: "下一个" };
  ok(heard(h, { seq: 3, ledger: { ...ledger } }) === h && heard(h, { seq: 2, ledger: next }) === h, "the ledger at the number the phone has, or an older one, changes nothing it holds");
  eq([heard(h, { seq: 4, ledger: next }).server.name, heard(h, { seq: 4, ledger: next }).seq], ["下一个", 4], "a newer one is taken");
  const unmade = hold(ledger, "k");
  eq([heard(unmade, { seq: 0, ledger }).made, unmade.made], [true, false], "a ledger just made is marked made, at number 0");

  const world = new World();
  const a = phone(world, "a", hold(fresh(), "k"));
  a.s.wake();
  await settle();
  eq([a.box.writes, a.s.state().live], [1, true], "opening a ledger: what the phone keeps changes once (it is made), not again when the same ledger arrives on the connection");
  a.away();
  a.back();
  await settle();
  eq([a.box.writes, a.s.state().live], [1, true], "nor when the connection is made again");
  a.spend("e1");
  await settle();
  const k = world.ledgers.get("ledger-1")!;

  // two tabs open on one ledger share what the phone keeps, and each sends what is waiting
  const shared = keeps(join({ seq: k.seq, ledger: k.ledger }, "k"));
  const tab1 = phone(world, "t1", shared);
  const tab2 = phone(world, "t2", shared);
  tab1.s.wake();
  tab2.s.wake();
  await settle();
  tab1.away();
  tab2.away();
  ok(tab1.s.do({ do: "rename", member: "w", name: "Zed" }) && tab2.spend("e2"), "two tabs on one phone, no signal: one renames someone, the other records an expense");
  a.s.do({ do: "rename", member: "m", name: "Zed" });
  await settle();
  tab1.back();
  tab2.back();
  await settle();
  eq([(shared.held as Held).lost.map((x) => x.change.do), (shared.held as Held).waiting.length, ids(k.ledger), k.ledger.members.map((m) => m.name)], [["rename"], 0, ["e1", "e2"], ["Steve", "小王", "Zed"]], "both send both: the expense counts once, and the rename that didn't stick is on the list once");
}

// ---------- 13. taken off the phone with a request on its way ----------
{
  const world = new World();
  const a = phone(world, "a", hold(fresh(), "k"));
  a.s.wake();
  await settle();
  a.spend("e1");
  a.box.held = null;
  await settle();
  eq([a.box.held, a.s.state().sending, a.s.state().trouble, ids(world.ledgers.get("ledger-1")!.ledger)], [null, false, null, ["e1"]], "the server has what was sent, and nothing is written back to a ledger the phone no longer holds");
  ok(!a.s.do({ do: "title", name: "又来" }), "and nothing more is recorded for it");
  a.s.wake();
  a.fire();
  await settle();
  eq([a.box.held, a.waits(), a.s.state().sending], [null, 0, false], "or tried");
}

// ---------- 14. a card in the list ----------
{
  const world = new World();
  const a = phone(world, "a", hold(fresh(), "k"));
  a.s.wake();
  await settle();
  a.spend("e1");
  await settle();
  const k = world.ledgers.get("ledger-1")!;

  const b = phone(world, "b", join({ seq: 0, ledger: fresh() }, "k"), false);
  b.s.look();
  await settle();
  eq([ids(b.ledger()), b.held().seq, b.reads(), b.listens(), b.s.state().sending], [["e1"], 1, 1, 0, false], "a ledger that is only a card in the list: asked once where it stands and brought up to date, with no connection held open");
  b.s.look();
  await settle();
  eq([b.reads(), b.box.writes], [2, 1], "asked again with nothing new: nothing on the phone changes");
  b.s.wake();
  await settle();
  eq(b.reads(), 2, "a look is one look: waking later with nothing to send asks nothing");
  a.s.look();
  await settle();
  eq(a.reads(), 0, "a ledger open on the screen isn't asked: its connection brings whatever is new");

  b.signal.on = false;
  b.spend("b1");
  await settle();
  b.signal.on = true;
  b.s.look();
  await settle();
  eq([b.reads(), ids(k.ledger), b.held().waiting.length, ids(b.ledger())], [2, ["e1", "b1"], 0, ["e1", "b1"]], "nor one with something to send: sending it brings the ledger back, and the look sees to the sending");

  b.signal.on = false;
  b.s.look();
  await settle();
  eq([b.reads(), b.waits(), b.s.state().away, b.s.state().trouble], [3, 0, false, null], "no answer to a look is nothing to act on: it isn't tried again, and nothing is said");
  b.signal.on = true;

  const c = phone(world, "c", hold(fresh("ledger-2"), "k"), false);
  c.s.look();
  await settle();
  eq([c.held().made, c.reads(), c.box.writes], [true, 1, 1], "a ledger the server hasn't got yet is made first, then asked after");

  k.key = "changed";
  b.s.look();
  await settle();
  eq([b.s.state().trouble, b.reads()], ["key", 4], "the look finds the key no longer opens the ledger: said");
  b.s.look();
  await settle();
  eq(b.reads(), 4, "and not asked again");
  world.ledgers.delete("ledger-2");
  c.s.look();
  await settle();
  eq(c.s.state().trouble, "gone", "or that the ledger is gone");
}

// ---------- 15. the owner locks the ledger ----------
{
  const world = new World();
  const a = phone(world, "a", hold(fresh(), "k", "own"));
  a.s.wake();
  await settle();
  const k = world.ledgers.get("ledger-1")!;
  eq([k.owner, k.key], ["own", "k"], "the phone that opens a ledger sends an owner's key of its own with it");
  a.spend("e1");
  await settle();
  const b = phone(world, "b", join({ seq: k.seq, ledger: k.ledger }, "k"));
  b.s.wake();
  const c = phone(world, "c", join({ seq: k.seq, ledger: k.ledger }, "k"), false);
  await settle();

  const before = b.asks();
  eq([await b.s.lock(true), b.asks(), k.ledger.locked], [false, before, undefined], "a phone that isn't the owner's has nothing to lock with: nothing is asked");
  a.signal.on = false;
  eq([await a.s.lock(true), a.ledger().locked], [false, undefined], "the owner, with no signal: not locked, and the screen is told so");
  a.signal.on = true;

  // one friend records with no signal, and another's answer is lost, just before the lock
  b.away();
  b.spend("b1");
  c.signal.loseAnswers = 1;
  c.spend("c1");
  await settle();
  eq([ids(k.ledger), c.held().waiting.length], [["e1", "c1"], 1], "(a friend's expense is in, though its phone never heard so)");

  eq([await a.s.lock(true), a.ledger().locked !== undefined, k.seq], [true, true, 3], "the owner locks it: the ledger says so, under a number of its own");
  ok(!a.spend("e2") && a.held().waiting.length === 0, "locked, the owner's own phone records nothing either");
  c.fire();
  await settle();
  eq([c.held().waiting.length, c.held().server.locked !== undefined, c.s.state().trouble], [0, true, null], "the phone whose answer was lost asks again and hears its expense is in: a locked ledger still answers for what it took");
  ok(!c.spend("c2"), "and now it knows the ledger is locked, it records nothing");

  b.back();
  await settle();
  eq([b.held().waiting.length, ids(b.ledger()), b.ledger().locked !== undefined, b.s.state().trouble, b.s.state().away, b.waits(), b.s.state().live], [1, ["e1", "c1", "b1"], true, null, false, 0, true],
    "the one that recorded with no signal comes back: its expense stays on the phone and on its screen, the ledger is seen to be locked, and that is no trouble and nothing to keep trying");
  eq(ids(k.ledger), ["e1", "c1"], "nothing got into the locked ledger");

  // a phone that isn't listening and hadn't heard
  const d = phone(world, "d", join({ seq: 1, ledger: { ...k.ledger, entries: k.ledger.entries.slice(0, 1), locked: undefined } as Ledger }, "k"), false);
  ok(d.spend("d1"), "a phone that hasn't heard records as usual");
  await settle();
  eq([d.held().waiting.length, d.held().server.locked !== undefined, d.reads(), d.s.state().trouble, d.waits()], [1, true, 1, null, 0], "it is turned away, asks once where the ledger stands, and finds it locked: what it recorded waits");
  d.s.wake();
  await settle();
  eq([d.held().waiting.length, d.reads()], [1, 1], "woken while it is still locked: tried once more, and it knows why without asking again");

  const lockedAt = k.seq;
  eq([await a.s.lock(false), a.ledger().locked, k.ledger.locked, k.seq > lockedAt], [true, undefined, undefined, true], "the owner opens it again");
  await settle();
  eq([b.held().waiting.length, ids(k.ledger), b.ledger().locked], [0, ["e1", "c1", "b1"], undefined], "a phone that is listening hears it is open, and what it kept goes up by itself");
  eq(d.held().waiting.length, 1, "(one that isn't listening hasn't heard yet)");
  d.s.wake();
  await settle();
  eq([d.held().waiting.length, ids(k.ledger), d.ledger().locked], [0, ["e1", "c1", "b1", "d1"], undefined], "and sends what it kept the next time it wakes");
  ok(a.spend("e2"), "and the owner records again");
  await settle();

  // the owner's key on a second phone (as it will be once ledgers follow an account), which hadn't heard of a lock
  await a.s.lock(true);
  const o2 = phone(world, "o2", { ...join({ seq: 1, ledger: { ...k.ledger, entries: k.ledger.entries.slice(0, 1), locked: undefined } as Ledger }, "k"), owner: "own" }, false);
  o2.spend("o1");
  await settle();
  eq([o2.held().waiting.length, o2.ledger().locked !== undefined], [1, true], "(the owner's other phone records, is turned away, and sees the lock)");
  eq([await o2.s.lock(false), k.ledger.locked], [true, undefined], "it opens the ledger itself");
  await settle();
  eq([o2.held().waiting.length, ids(k.ledger).includes("o1")], [0, true], "and what it had kept goes up at once, with nothing to wake it");
  eq([a.atOnce(), b.atOnce(), c.atOnce(), d.atOnce()].map((n) => n <= 2), [true, true, true, true], "(the lock is the one request that may go beside another)");
}

// ---------- 16. the owner changes the key ----------
{
  const world = new World();
  const a = phone(world, "a", hold(fresh(), "k", "own"));
  a.s.wake();
  await settle();
  const k = world.ledgers.get("ledger-1")!;
  a.spend("e1");
  await settle();
  const b = phone(world, "b", join({ seq: k.seq, ledger: k.ledger }, "k"));
  b.s.wake();
  await settle();

  b.s.rekey("k9");
  await settle();
  eq([b.held().next, k.key], [undefined, "k"], "a phone that isn't the owner's changes no key");
  a.s.rekey("own");
  a.s.rekey("k");
  eq(a.held().next, undefined, "and the owner's doesn't change it to a key it already has");

  a.s.rekey("k2");
  eq([a.held().key, a.held().next], ["k", "k2"], "the owner asks for a new key: it is kept on the phone before anything is sent");
  a.s.rekey("k3");
  eq(a.held().next, "k2", "one at a time: asking again while one is on its way changes nothing");
  await settle();
  eq([k.key, a.held().key, a.held().next, a.s.state().live, a.s.state().trouble, a.held().owner], ["k2", "k2", undefined, true, null, "own"], "the server has it: it is the phone's key now, and the phone is listening again with it");

  eq([b.s.state().trouble, b.s.state().live], ["key", false], "the friend's phone was let go, and its old key opens nothing: it says so");
  ok(b.spend("b1") && b.held().waiting.length === 1, "it still records, and keeps what it records");
  await settle();
  eq(ids(k.ledger), ["e1"], "(none of which goes anywhere)");
  // the friend opens the new invitation
  b.box.held = opened(b.held(), "k2", world.read("ledger-1", "k2").data!);
  b.s.rekeyed();
  await settle();
  eq([b.s.state().trouble, b.s.state().live, b.held().waiting.length, ids(k.ledger), b.held().key], [null, true, 0, ["e1", "b1"], "k2"], "given the new invitation's key: it is in again, listening, and what it kept goes up");

  // the answer is lost
  a.signal.loseAnswers = 1;
  a.s.rekey("k3");
  await settle();
  eq([k.key, a.held().key, a.held().next, a.waits()], ["k3", "k2", "k3", 1], "the answer is lost: the server has the new key, the phone holds the old one and the new, and will ask again");
  a.fire();
  await settle();
  eq([a.held().key, a.held().next, a.s.state().live, a.s.state().trouble], ["k3", undefined, true, null], "asked again: already so. The new key is the phone's");
  a.signal.loseAnswers = 1;
  a.s.rekey("k3b");
  await settle();
  a.spend("e2");
  await settle();
  eq([k.key, a.held().key, a.held().next, a.held().waiting.length, ids(k.ledger)], ["k3b", "k3b", undefined, 0, ["e1", "b1", "e2"]], "recording something meanwhile asks again at once: the key first, then the expense, sent with the new key and never the old");

  // the page is closed before the answer: the next time 两清 opens, it is seen through first
  const closed: Held = { ...a.held(), next: "k4" };
  k.key = "k4";
  const a2 = phone(world, "a2", closed);
  a2.s.wake();
  await settle();
  eq([a2.held().key, a2.held().next, a2.s.state().trouble, a2.s.state().live], ["k4", undefined, null, true], "a phone that closed with a key on its way opens again and finishes it, before its old key can be refused");

  // no signal: asked for, kept, and done when the signal is back, ahead of what was recorded meanwhile
  a2.away();
  a2.s.rekey("k5");
  ok(a2.spend("e3"), "(with no signal the owner still records)");
  await settle();
  eq([k.key, a2.held().next], ["k4", "k5"], "with no signal the new key waits on the phone");
  a2.back();
  await settle();
  eq([k.key, a2.held().key, a2.held().next, a2.held().waiting.length, ids(k.ledger).includes("e3")], ["k5", "k5", undefined, 0, true], "the signal back: the key is changed first, then what was recorded goes up with it");

  // a phone that thinks it is the owner and isn't
  const x = phone(world, "x", { ...join({ seq: k.seq, ledger: k.ledger }, "k5"), owner: "not-the-owner" });
  x.s.wake();
  await settle();
  x.s.rekey("k6");
  await settle();
  eq([k.key, x.held().key, x.held().next, x.held().owner, x.s.state().trouble, x.s.state().live], ["k5", "k5", undefined, undefined, null, true], "the server won't change the key for a phone that isn't the owner's: its key stays as it was, it carries on, and it stops thinking it is the owner");
  const y = phone(world, "y", { ...join({ seq: k.seq, ledger: k.ledger }, "k5"), owner: "not-the-owner-either" });
  y.s.wake();
  await settle();
  eq([await y.s.lock(true), k.ledger.locked, y.held().owner], [false, undefined, undefined], "nor lock the ledger for one: told so, that phone too has no owner's key any more");
  const asksBefore = y.asks();
  eq([await y.s.lock(true), y.asks()], [false, asksBefore], "and doesn't ask again");
}

if (failed) {
  console.log(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nall passed");
