/**
 * What is done across objects (src/server/flows.ts): a sign-in, and the accounts service's two
 * notices, with every order their steps can come in.
 *
 * The objects here are the real functions (account.ts, registry.ts) on Node's SQLite, one
 * database for each account and one for the registry, and a small accounts service that does
 * what the real one does in the step before it tells the apps (site/worker/hub.ts): it deletes
 * the account, or drops its waiting codes. Every call a flow makes on another object is a step,
 * and a call into an account's object is three: it arrives, the object's question reaches the
 * registry, and the answer comes back. A sign-in has at most nine steps and a notice four, so
 * there are 715 ways to shuffle the two, and every one of them is run, for each case below.
 * After every step the registry must know of every database there is, and what must be true once
 * both are over is checked each time.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { newId } from "../src/core/ids";
import { isSetUp, signEveryoneOut, signIn, type SignIn } from "../src/server/account";
import type { Db } from "../src/server/chunks";
import { accountChanged, accountGone, same, signInHere, tradeCode, type Doors, type Inside, type Offer, type Traded } from "../src/server/flows";
import { configOf } from "../src/server/gate";
import { countAccounts, forgetAccount, noteAccount, registryTables, setStamp, stampOf } from "../src/server/registry";
import { checkSession, hashOf, newToken } from "../src/server/sessions";
import { sqlite } from "./sqlremote";

const [A, B] = ["uaaaaaa1", "ubbbbbb2"];
const T0 = Date.UTC(2026, 10, 26, 20, 0, 0);
const GATE = configOf({ ORIGIN: "https://money.changle.test", GATE: "list", ALLOWED_ACCOUNTS: `${A},${B}` })!.gate;

/** Something that runs one step at a time: it stops before every step, until it is let go. */
class Thread<T> {
  done = false;
  out: T | undefined;
  failed: unknown;
  private go: (() => void) | null = null;
  private arrived: () => void = () => {};
  private at: Promise<void>;
  constructor(body: (pause: () => Promise<void>) => Promise<T>) {
    this.at = new Promise<void>((resolve) => (this.arrived = resolve));
    const pause = (): Promise<void> =>
      new Promise<void>((resolve) => {
        this.go = resolve;
        this.arrived();
      });
    void (async () => {
      try {
        this.out = await body(pause);
      } catch (error) {
        this.failed = error ?? new Error("failed");
      }
      this.done = true;
      this.arrived();
    })();
  }
  /** One step: up to where it stops before its next one, or to its end. */
  async step(): Promise<void> {
    await this.at;
    if (this.done) return;
    const go = this.go!;
    this.at = new Promise<void>((resolve) => (this.arrived = resolve));
    go();
    await this.at;
  }
}

/** Every way to place `few` steps of one thread among `many` of another: true where the one with few steps goes. */
function* shuffles(many: number, few: number): Generator<boolean[]> {
  const order = new Array<boolean>(many + few).fill(false);
  function* place(from: number, left: number): Generator<boolean[]> {
    if (left === 0) {
      yield order.slice();
      return;
    }
    for (let i = from; i <= order.length - left; i++) {
      order[i] = true;
      yield* place(i + 1, left - 1);
      order[i] = false;
    }
  }
  yield* place(0, few);
}

/** The points of a sign-in that can fail: a call on another object, or the object's own question to the registry ("inside"). */
type Point = keyof Doors | "inside";
type Case = {
  /** The notice, and whose account it is about. */
  notice: "gone" | "changed";
  about: string;
  /** Has the account signing in been here before (one session on another device)? */
  before: boolean;
  /** A change of address drops the codes of the devices it signs out. The device that asked keeps its own when it was the only one. */
  codeSurvivesChange?: boolean;
  /** One step of the sign-in that fails, and which time it is made. */
  fails?: { at: Point; time: number };
  /** The notice fails at its work the first time and is sent again (the accounts service tries until it is heard). */
  noticeRetried?: boolean;
};

const HASHES: Promise<{ old: string; mine: string; other: string }> = (async () => ({ old: (await hashOf(newToken()))!, mine: (await hashOf(newToken()))!, other: (await hashOf(newToken()))! }))();

async function run(c: Case, order: boolean[], hashes: { old: string; mine: string; other: string }) {
  // ----- the world -----
  const registry = sqlite();
  registryTables(registry);
  type Obj = { db: Db; noticed: number };
  const objects = new Map<string, Obj>();
  const object = (account: string): Obj => {
    if (!objects.has(account)) objects.set(account, { db: sqlite(), noticed: 0 });
    return objects.get(account)!;
  };
  let clock = T0;
  const deleted = new Set<string>();
  const code = newToken();
  const nonce = newToken();
  const codes = new Map([[code, { id: A, master: false, nonce }]]);
  let step = 0;
  let redeemedAt = -1;
  let changedAt = -1;

  // who was here before
  if (c.before) {
    noteAccount(registry, A, clock);
    assert.equal(signIn(object(A).db, { account: A, session: newId(), hash: hashes.old, label: "Safari on iPhone", owner: false }, clock++, GATE), "ok");
  }
  if (c.about === B) {
    noteAccount(registry, B, clock);
    assert.equal(signIn(object(B).db, { account: B, session: newId(), hash: hashes.other, label: "Chrome on Windows", owner: false }, clock++, GATE), "ok");
  }

  // ----- the doors, each call a step -----
  const times = new Map<Point, number>();
  const doors = (pause: () => Promise<void>, failing?: Case["fails"]): Doors => {
    const next = async (at: Point): Promise<void> => {
      await pause();
      step++;
      if (failing?.at !== at) return;
      const time = (times.get(at) ?? 0) + 1;
      times.set(at, time);
      if (time === failing.time) throw new Error(`${at} failed`);
    };
    const stepped =
      <P extends unknown[], R>(at: keyof Doors, work: (...args: P) => R) =>
      async (...args: P): Promise<R> => {
        await next(at);
        return work(...args);
      };
    return {
      stampNow: stepped("stampNow", () => stampOf(registry)),
      newStamp: stepped("newStamp", () => setStamp(registry, newId())),
      note: stepped("note", (account: string) => noteAccount(registry, account, clock++)),
      forget: stepped("forget", (account: string) => forgetAccount(registry, account)),
      redeem: stepped("redeem", (given: string) => {
        const stood = codes.get(given) ?? null;
        codes.delete(given);
        if (stood) redeemedAt = step;
        return stood;
      }),
      exists: stepped("exists", (account: string) => !deleted.has(account)),
      // Into the account's own object, as worker.ts's VaultDO does it: the call arrives (a step), the object asks the
      // registry (a step), and the answer comes back (a step), with nothing waiting after that.
      signIn: async (made: SignIn, stamp: string) => {
        await next("signIn");
        const here = object(made.account);
        const inside: Inside = {
          noticed: () => here.noticed,
          stampNow: async () => {
            await next("inside");
            const read = stampOf(registry);
            await pause();
            step++;
            return read;
          },
          open: () => signIn(here.db, made, clock++, GATE),
        };
        return signInHere(inside, stamp);
      },
      signEveryoneOut: stepped("signEveryoneOut", (account: string) => {
        const here = object(account);
        here.noticed++;
        signEveryoneOut(here.db, clock++);
      }),
      // (a Durable Object's deleteAll: nothing is left, not even the tables)
      erase: stepped("erase", (account: string) => {
        const here = object(account);
        here.noticed++;
        here.db = sqlite();
      }),
    };
  };

  // ----- the two threads -----
  const offer: Offer = { code, nonce, gate: GATE, session: newId(), hash: hashes.mine, label: "Firefox on Linux" };
  const signingIn = new Thread<Traded>((pause) => tradeCode(doors(pause, c.fails), offer));
  const notice = new Thread<void>(async (pause) => {
    // What the accounts service does itself, before it tells anyone (hub.ts): the account is deleted, or its other
    // devices are signed out and their waiting codes dropped.
    await pause();
    step++;
    changedAt = step;
    if (c.notice === "gone") deleted.add(c.about);
    if (c.notice === "gone" || !c.codeSurvivesChange) for (const [key, value] of codes) if (value.id === c.about) codes.delete(key);
    const tell = c.notice === "gone" ? accountGone : accountChanged;
    if (c.noticeRetried) await assert.rejects(tell(doors(pause, { at: c.notice === "gone" ? "erase" : "signEveryoneOut", time: 1 }), c.about));
    await tell(doors(pause), c.about);
  });
  const where = (): string => `${JSON.stringify(c)} ${order.map((n) => (n ? "N" : "s")).join("")} at step ${step}`;
  const registered = (account: string): boolean => registry.sql.exec(`SELECT 1 AS there FROM accounts WHERE id = ?`, account).toArray().length === 1;
  // never a database the registry does not know of, at any moment
  const known = (): void => {
    for (const [account, here] of objects) assert.ok(!isSetUp(here.db) || registered(account), `unregistered database: ${where()}`);
  };
  for (const pick of order) {
    await (pick ? notice : signingIn).step();
    known();
  }
  for (const rest of [signingIn, notice]) {
    while (!rest.done) {
      await rest.step();
      known();
    }
  }

  // ----- what must be true now -----
  assert.equal(notice.failed, undefined, where());
  if (!c.fails) assert.equal(signingIn.failed, undefined, where());
  const traded = signingIn.out;
  const failed = signingIn.failed !== undefined;
  assert.notEqual(traded === undefined, !failed, where());
  const now = clock + 1;
  const live = (account: string, hash: string): boolean => isSetUp(object(account).db) && checkSession(object(account).db, hash, now) !== null;
  const mine = live(A, hashes.mine);

  // a session is there exactly when the sign-in said ok, or a notice has ended it since: none that nobody was given
  if (!traded?.ok) assert.equal(mine, false, `a session nobody was given: ${where()}`);
  if (traded?.ok) assert.equal(traded.account, A, where());
  if (traded && !traded.ok) assert.ok([401, 503].includes(traded.status), `${traded.status} ${where()}`);

  if (c.about === A && c.notice === "gone") {
    // everything of the account is gone, whatever the order
    assert.equal(isSetUp(object(A).db), false, `a deleted account's database: ${where()}`);
    assert.equal(mine, false, where());
    // (off the registry too, unless the sign-in was made to fail after it had noted the account: left for the sweep)
    if (!c.fails) assert.equal(registered(A), false, `a deleted account on the registry: ${where()}`);
  }
  if (c.about === A && c.notice === "changed") {
    // nobody who was signed in before the change still is, and no code traded before it gave a session
    assert.equal(live(A, hashes.old), false, `the old session outlived the change: ${where()}`);
    if (redeemedAt === -1 || redeemedAt < changedAt) assert.equal(mine, false, `a code traded before the change gave a session: ${where()}`);
  }
  if (c.about === B) {
    // someone else's notice: this account is as it was, with the new session or without it
    if (c.before) assert.equal(live(A, hashes.old), true, `another account's notice ended a session here: ${where()}`);
    assert.equal(mine, traded?.ok === true, where());
    if (!c.fails) assert.equal(registered(A), true, where());
    assert.equal(live(B, hashes.other), false, where());
    assert.equal(isSetUp(object(B).db), c.notice === "changed", where());
    assert.equal(registered(B), c.notice === "changed", where());
  }
  return { traded, mine, failed };
}

type Seen = { ok: number; again: number; code: number; failed: number; runs: number };
/** The steps a sign-in has at most: all nine, or as far as the step that is made to fail (a sign-in that ends sooner just has steps left over). */
const STEPS: Point[] = ["stampNow", "redeem", "note", "signIn", "inside", "inside", "exists", "erase", "forget"];
async function everyOrder(c: Case, noticeSteps = 4): Promise<Seen> {
  const hashes = await HASHES;
  const seen: Seen = { ok: 0, again: 0, code: 0, failed: 0, runs: 0 };
  const most = c.fails && !["exists", "erase", "forget"].includes(c.fails.at) ? STEPS.indexOf(c.fails.at) + 1 : 9;
  for (const order of shuffles(most, noticeSteps)) {
    const { traded, failed } = await run(c, order, hashes);
    seen.runs++;
    if (failed) seen.failed++;
    else if (traded?.ok) seen.ok++;
    else if (traded?.status === 503) seen.again++;
    else if (traded?.status === 401) seen.code++;
  }
  return seen;
}

test("the shuffles are all of them, each once", () => {
  const all = [...shuffles(9, 4)].map((order) => order.map((n) => (n ? "N" : "s")).join(""));
  assert.equal(all.length, 715);
  assert.equal(new Set(all).size, 715);
  for (const one of all) assert.equal(one.replace(/s/g, "").length, 4);
});

test("an account deleted while it signs in: in every order, nothing of it is left", async () => {
  for (const before of [true, false]) {
    const seen = await everyOrder({ notice: "gone", about: A, before });
    assert.equal(seen.runs, 715);
    // all three ends happen: signed in and then emptied, turned away, and a code that no longer trades
    assert.ok(seen.ok > 0 && seen.again > 0 && seen.code > 0, JSON.stringify(seen));
    assert.equal(seen.ok + seen.again + seen.code, 715);
  }
});

test("an address changed while its account signs in: in every order, no code traded before the change gives a session", async () => {
  for (const before of [true, false]) {
    for (const codeSurvivesChange of [false, true]) {
      const seen = await everyOrder({ notice: "changed", about: A, before, codeSurvivesChange });
      assert.ok(seen.ok > 0 && seen.again > 0, JSON.stringify(seen));
      // (the device that asked for the change keeps its code, so only a dropped code fails to trade)
      assert.equal(seen.code > 0, !codeSurvivesChange, JSON.stringify(seen));
      assert.equal(seen.ok + seen.again + seen.code, 715);
    }
  }
});

test("someone else's notice while an account signs in: it is asked to try again, and loses nothing", async () => {
  for (const notice of ["gone", "changed"] as const) {
    const seen = await everyOrder({ notice, about: B, before: true });
    assert.ok(seen.ok > 0 && seen.again > 0, JSON.stringify(seen));
    assert.equal(seen.code, 0);
    assert.equal(seen.ok + seen.again, 715);
  }
});

test("a notice that fails at its work and is sent again: the same holds", async () => {
  // (the notice then has six steps: the accounts service's own, a stamp, the work that fails, and the three again)
  const seen = await everyOrder({ notice: "gone", about: A, before: true, noticeRetried: true }, 6);
  assert.equal(seen.runs, 5005);
  assert.ok(seen.ok > 0 && seen.again > 0 && seen.code > 0, JSON.stringify(seen));
});

test("any step of a sign-in failing, in every order: no session nobody was given, no database the registry does not know of", async () => {
  const points: NonNullable<Case["fails"]>[] = [
    { at: "stampNow", time: 1 },
    { at: "redeem", time: 1 },
    { at: "note", time: 1 },
    { at: "signIn", time: 1 },
    { at: "inside", time: 1 },
    { at: "exists", time: 1 },
    { at: "erase", time: 1 },
    { at: "forget", time: 1 },
  ];
  for (const notice of ["gone", "changed"] as const) {
    for (const fails of points) {
      const seen = await everyOrder({ notice, about: A, before: true, fails });
      const told = JSON.stringify({ notice, fails, seen });
      // what fails before the session could be opened fails the sign-in, in every order that gets that far
      if (fails.at === "stampNow") assert.equal(seen.failed, seen.runs, told);
      if (["redeem", "note", "signIn", "inside"].includes(fails.at)) assert.ok(seen.failed > 0, told);
      // what fails while the registry is being tidied after a sign-in was turned away fails nothing: it is asked to try again
      if (["exists", "erase", "forget"].includes(fails.at)) assert.equal(seen.failed, 0, told);
    }
  }
});

test("a sign-in on its own: what is asked, in which order, and what each answer leads to", async () => {
  const registry = sqlite();
  registryTables(registry);
  const mine = sqlite();
  const asked: string[] = [];
  const hash = (await hashOf(newToken()))!;
  const code = newToken();
  const nonce = newToken();
  const doors: Doors = {
    stampNow: async () => (asked.push("stampNow"), stampOf(registry)),
    newStamp: async () => void asked.push("newStamp"),
    note: async (account) => (asked.push(`note ${account}`), noteAccount(registry, account, T0)),
    forget: async (account) => void asked.push(`forget ${account}`),
    redeem: async (given) => (asked.push("redeem"), given === code ? { id: A, master: false, nonce } : null),
    exists: async (account) => (asked.push(`exists ${account}`), true),
    signIn: async (made, stamp) => (asked.push(`signIn ${made.account} ${JSON.stringify(stamp)}`), signIn(mine, made, T0, GATE)),
    signEveryoneOut: async () => void asked.push("signEveryoneOut"),
    erase: async (account) => void asked.push(`erase ${account}`),
  };
  const offer: Offer = { code, nonce, gate: GATE, session: newId(), hash, label: "Chrome on Windows" };
  setStamp(registry, "AAAAAAAAAAAAAAAAAAAAAA");
  assert.deepEqual(await tradeCode(doors, offer), { ok: true, account: A });
  // the stamp is read before the code is traded, and goes into the object with the sign-in
  assert.deepEqual(asked, ["stampNow", "redeem", `note ${A}`, `signIn ${A} "AAAAAAAAAAAAAAAAAAAAAA"`]);
  assert.equal(countAccounts(registry), 1);
  assert.ok(checkSession(mine, hash, T0 + 1));
  assert.equal(mine.sql.exec(`SELECT label FROM sessions`).toArray()[0]?.label, "Chrome on Windows");

  // what does not trade, and who is not let in, reaches neither the registry's list nor a database
  for (const [wrong, status, why] of [
    [{ ...offer, code: newToken() }, 401, "code"],
    [{ ...offer, nonce: newToken() }, 401, "code"],
    [{ ...offer, nonce: `${nonce}x` }, 401, "code"],
    [{ ...offer, nonce: nonce.slice(0, -1) }, 401, "code"],
    [{ ...offer, gate: { mode: "owner" } as const }, 403, "not-admitted"],
    [{ ...offer, gate: { mode: "closed" } as const }, 403, "not-admitted"],
  ] as const) {
    asked.length = 0;
    assert.deepEqual(await tradeCode(doors, wrong), { ok: false, status, why });
    assert.deepEqual(asked, ["stampNow", "redeem"]);
  }
  // the owner's mark is what the accounts service said, and with it the owner's gate lets the owner in
  asked.length = 0;
  const owners = sqlite();
  const owner = await tradeCode({ ...doors, redeem: async () => ({ id: A, master: true, nonce }), signIn: async (made) => (asked.push(`owner ${made.owner}`), signIn(owners, made, T0, { mode: "owner" })) }, { ...offer, gate: { mode: "owner" } });
  assert.deepEqual(owner, { ok: true, account: A });
  assert.deepEqual(asked, ["stampNow", `note ${A}`, "owner true"]);
  // an answer from the accounts service that is not an account with a nonce is no account
  for (const odd of [null, { id: "not an id", master: false, nonce }, { id: A, master: "yes", nonce }, { id: A, master: false, nonce: 5 }, { id: A, master: false }, {}]) {
    asked.length = 0;
    assert.deepEqual(await tradeCode({ ...doors, redeem: async () => odd as never }, offer), { ok: false, status: 401, why: "code" });
    assert.deepEqual(asked, ["stampNow"]);
  }
  // what the object says is passed on, and only "ok" is ok
  for (const [said, status, why] of [
    ["too-many", 429, "too-many"],
    ["not-admitted", 403, "not-admitted"],
    ["refused", 500, "unavailable"],
    ["something else", 500, "unavailable"],
    [undefined, 500, "unavailable"],
  ] as const) {
    asked.length = 0;
    assert.deepEqual(await tradeCode({ ...doors, signIn: async () => said as never }, offer), { ok: false, status, why });
    assert.deepEqual(asked, ["stampNow", "redeem", `note ${A}`]);
  }
  // an account the registry will not note is not signed in
  asked.length = 0;
  assert.deepEqual(await tradeCode({ ...doors, note: async () => false }, offer), { ok: false, status: 500, why: "unavailable" });
  assert.deepEqual(asked, ["stampNow", "redeem"]);
});

test("a sign-in turned away: the person tries again, and a deleted account is taken off the registry, its database emptied first", async () => {
  const nonce = newToken();
  const hash = (await hashOf(newToken()))!;
  for (const there of [true, false, "cannot say", "cannot erase", "cannot forget"] as const) {
    const asked: string[] = [];
    const doors: Doors = {
      stampNow: async () => "",
      newStamp: async () => void asked.push("newStamp"),
      note: async (account) => (asked.push(`note ${account}`), true),
      forget: async (account) => {
        asked.push(`forget ${account}`);
        if (there === "cannot forget") throw new Error("registry");
      },
      redeem: async () => ({ id: A, master: false, nonce }),
      exists: async (account) => {
        asked.push(`exists ${account}`);
        if (there === "cannot say") throw new Error("accounts");
        return there === true;
      },
      signIn: async () => (asked.push("signIn"), "try-again"),
      signEveryoneOut: async () => void asked.push("signEveryoneOut"),
      erase: async (account) => {
        asked.push(`erase ${account}`);
        if (there === "cannot erase") throw new Error("object");
      },
    };
    const answer = await tradeCode(doors, { code: newToken(), nonce, gate: GATE, session: newId(), hash, label: "Chrome on Windows" });
    assert.deepEqual(answer, { ok: false, status: 503, why: "try-again" });
    const start = [`note ${A}`, "signIn", `exists ${A}`];
    assert.deepEqual(asked, there === true || there === "cannot say" ? start : there === "cannot erase" ? [...start, `erase ${A}`] : [...start, `erase ${A}`, `forget ${A}`]);
  }
});

test("inside the object: the count, the stamp, the count again, and only then the session", async () => {
  const stamp = newId();
  const asked: string[] = [];
  const inside = (over: Partial<{ count: number[]; now: unknown; said: ReturnType<Inside["open"]> }> = {}): Inside => {
    const count = [...(over.count ?? [3, 3])];
    return {
      noticed: () => (asked.push("noticed"), count.shift()!),
      stampNow: async () => (asked.push("stampNow"), ("now" in over ? over.now : stamp) as string),
      open: () => (asked.push("open"), over.said ?? "ok"),
    };
  };
  assert.equal(await signInHere(inside(), stamp), "ok");
  assert.deepEqual(asked, ["noticed", "stampNow", "noticed", "open"]);
  // what the database says is what is answered
  for (const said of ["not-admitted", "too-many", "refused"] as const) assert.equal(await signInHere(inside({ said }), stamp), said);
  // a stamp that is not the one the sign-in began under, or is none: nothing is opened
  for (const [began, now] of [
    [stamp, newId()],
    [newId(), stamp],
    ["", stamp],
    [stamp, ""],
    [`${stamp}x`, stamp],
    [stamp, `${stamp}x`],
    [undefined, stamp],
    [null, stamp],
    [5, 5],
    [stamp, undefined],
    [stamp, null],
    [[stamp], stamp],
  ] as const) {
    asked.length = 0;
    assert.equal(await signInHere(inside({ now }), began), "try-again", JSON.stringify([began, now]));
    assert.equal(asked.includes("open"), false);
  }
  // before any notice at all, the stamp is the empty one on both sides
  assert.equal(await signInHere(inside({ now: "" }), ""), "ok");
  // a notice did its work here while the object waited for the registry: nothing is opened
  for (const count of [
    [3, 4],
    [0, 1],
    [4, 3],
  ]) {
    asked.length = 0;
    assert.equal(await signInHere(inside({ count }), stamp), "try-again");
    assert.deepEqual(asked, ["noticed", "stampNow", "noticed"]);
  }
  // the registry does not answer: the sign-in fails, and nothing is opened
  asked.length = 0;
  await assert.rejects(signInHere({ ...inside(), stampNow: async () => Promise.reject(new Error("registry")) }, stamp));
  assert.equal(asked.includes("open"), false);
});

test("the notices: the stamp first, then the work, and a notice whose stamp was not set does nothing", async () => {
  const asked: string[] = [];
  const doors = {
    newStamp: async () => void asked.push("newStamp"),
    erase: async (account: string) => void asked.push(`erase ${account}`),
    forget: async (account: string) => void asked.push(`forget ${account}`),
    signEveryoneOut: async (account: string) => void asked.push(`signEveryoneOut ${account}`),
  } as Doors;
  await accountGone(doors, A);
  assert.deepEqual(asked, ["newStamp", `erase ${A}`, `forget ${A}`]);
  asked.length = 0;
  await accountChanged(doors, A);
  assert.deepEqual(asked, ["newStamp", `signEveryoneOut ${A}`]);
  asked.length = 0;
  const stuck = { ...doors, newStamp: async () => Promise.reject(new Error("registry")) } as Doors;
  await assert.rejects(accountGone(stuck, A));
  await assert.rejects(accountChanged(stuck, A));
  assert.deepEqual(asked, []);
  // an account whose database could not be emptied stays on the registry, for the notice to come again
  const full = { ...doors, erase: async () => Promise.reject(new Error("object")) } as Doors;
  await assert.rejects(accountGone(full, A));
  assert.deepEqual(asked, ["newStamp"]);
});

test("two texts are the same when every character is", () => {
  assert.equal(same("", ""), true);
  assert.equal(same("abc", "abc"), true);
  for (const [a, b] of [
    ["abc", "abd"],
    ["abc", "xbc"],
    ["abc", "ab"],
    ["ab", "abc"],
    ["abc", ""],
    ["", "abc"],
    ["abc", "abcabc"],
    ["aa", "a"],
    ["a", "aa"],
  ] as const)
    assert.equal(same(a, b), false, `${a} / ${b}`);
});
