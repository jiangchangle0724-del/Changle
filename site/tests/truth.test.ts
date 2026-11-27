/*
 * Truth or dare on the phone (src/games/truthRules.ts). Run with `npx tsx tests/truth.test.ts`
 *  1. A fair bottle: who it may land on.
 *  2. Names on the ring: a long one gets smaller, then cut short.
 *  3. What one phone keeps between games: the table's own cards, and which cards it has dealt.
 *  4. Each player's limits: which cards they skip.
 */
const store = new Map<string, string>();
(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
};

const { fairSeats, fitName, freshFirst, markSeen, OWN_MAX, readOwn, writeOwn } = await import("../src/games/truthRules");
const { DARES, TRUTHS, SECRETS, limitsOf } = await import("../src/data/truthDare");
const { SLIP_MAX, SLIP_TEXT } = await import("../src/shared/engine/games/truth");
const { OWN_TEXT } = await import("../src/games/truthRules");

let failed = 0;
function ok(cond: unknown, msg: string) {
  if (cond) console.log("ok  ", msg);
  else {
    failed++;
    console.log("FAIL", msg);
  }
}

// 1. a fair bottle
const ids = ["a", "b", "c", "d"];
ok(fairSeats(ids, {}).join() === "a,b,c,d", "nobody picked yet and nobody spinning: anyone");
ok(fairSeats(ids, { spinner: "a" }).join() === "b,c,d", "never the one spinning (the one it picked last), so never the same person twice running");
ok(fairSeats(ids, { spinner: "a", picked: { b: 1 } }).join() === "b,c,d", "one turn ahead is fine: it still surprises");
ok(fairSeats(ids, { spinner: "a", picked: { b: 2, c: 1 } }).join() === "c,d", "nobody two turns ahead of whoever has had the fewest");
ok(fairSeats(ids, { spinner: "a", picked: { b: 5, c: 5, d: 5 } }).join() === "b,c,d", "all even again: anyone");
ok(
  fairSeats(ids, {
    spinner: "a",
    away: (id) => id === "d",
    picked: { b: 3, c: 3 },
  }).join() === "b,c",
  "nobody away, and the fewest counted among those here",
);
ok(fairSeats(ids, { spinner: "a", away: (id) => id !== "a" }).join() === "b,c,d", "everyone else away: anyone but the spinner");
ok(fairSeats(["a"], { spinner: "a" }).join() === "a", "a table of one still points somewhere");
// over a long night nobody sits out: whatever the bottle does inside the rule
const night = ["a", "b", "c", "d", "e", "f", "g"];
const times: Record<string, number> = {};
let spinner = "a";
let seed = 3;
let twice = 0;
let spread = 0;
for (let i = 0; i < 300; i++) {
  const may = fairSeats(night, { spinner, picked: times });
  seed = (seed * 16807) % 2147483647;
  const to = may[seed % may.length];
  times[to] = (times[to] ?? 0) + 1;
  if (to === spinner) twice++;
  spinner = to;
  const counts = night.map((id) => times[id] ?? 0);
  spread = Math.max(spread, Math.max(...counts) - Math.min(...counts));
}
ok(twice === 0, "300 spins round 7 people: never the same person twice running");
ok(spread <= 3, `and nobody ever more than ${spread} turns ahead of anyone else`);

// 2. names on the ring
ok(fitName("Steve", 10.5).text === "Steve" && fitName("Steve", 10.5).size === 10.5, "a short name as it is");
ok(fitName("欧阳娜娜", 10.5).text === "欧阳娜娜" && fitName("欧阳娜娜", 10.5).size <= 10.5, "four Chinese characters fit");
const longer = fitName("Christopher", 10.5);
ok(longer.size < 10.5, `a long name gets smaller first (${longer.text} at ${longer.size})`);
const long = fitName("Bartholomew Fitzgerald", 10.5);
ok(long.text.endsWith("…") && long.text.length < 22 && long.size >= 8.5, `a very long name is cut short (${long.text} at ${long.size})`);
ok(fitName("司马相如先生", 9).text === "司马相如…", "six Chinese characters keep four");
ok(fitName("  Ann  ", 9).text === "Ann", "spaces round a name don't count");

// 3a. the table's own cards, kept on this phone
ok(readOwn().length === 0, "no cards of your own to start with");
writeOwn([{ id: "x", k: "dare", text: "学猫叫" }]);
ok(readOwn().length === 1 && readOwn()[0].text === "学猫叫", "kept for next time");
store.set("changle.truth.own.v1", "not json");
ok(readOwn().length === 0, "a broken copy is no cards, not a crash");
store.set(
  "changle.truth.own.v1",
  JSON.stringify([
    { id: 1, k: "dare", text: "x" },
    { id: "y", k: "song", text: "x" },
    { id: "z", k: "truth", text: "ok" },
  ]),
);
ok(readOwn().length === 1 && readOwn()[0].id === "z", "only cards that make sense are read back");
ok(OWN_MAX === SLIP_MAX && OWN_TEXT === SLIP_TEXT, "one phone and the rooms server take the same number and length of cards");

// 3b. cards this phone dealt in earlier games come last
const mild = DARES.filter((p) => p.heat === 1);
const order = freshFirst("dare", mild);
ok(order.length === mild.length && new Set(order).size === mild.length, "every card once");
for (const i of [order.at(-1)!, order.at(-2)!, order.at(-3)!]) markSeen("dare", mild[i]);
const next = freshFirst("dare", mild);
const dealtFirst = next.slice(-(mild.length - 3)).map((i) => mild[i].zh);
ok(!dealtFirst.some((zh) => [order.at(-1), order.at(-2), order.at(-3)].some((i) => mild[i!].zh === zh)), "the next game deals the other cards first");
for (const p of mild) markSeen("dare", p);
const again = freshFirst("dare", mild);
ok(again.length === mild.length, "once every card has come up, it starts over with all of them");
const seen = JSON.parse(store.get("changle.truth.seen.v1") ?? "{}") as {
  dare?: string[];
};
ok((seen.dare ?? []).length === 0, "and forgets which it had dealt");

// 4. 每人底线: which cards each limit skips, read off their words
const tags = (text: string, kind: "truth" | "dare" | "secret") => limitsOf(text, kind).join();
ok(tags("挑一个愿意的人，给 TA 捏肩一分钟。", "dare") === "touch", "a dare with someone willing touches");
ok(tags("邀请一个人跳 30 秒慢舞。", "dare") === "touch" && tags("让右边的人用笔在你手臂上画个纹身，今晚不许洗。", "dare") === "touch", "so do a slow dance and drawing on an arm");
ok(!TRUTHS.some((p) => limitsOf(p.zh, "truth").includes("touch")), "no truth touches anyone");
ok(
  tags("给通讯录第三个人打电话，只说一句“我想你了”就挂。", "dare") === "phone" && tags("学家里长辈打电话的样子。", "dare") === "",
  "calling someone uses the phone; acting out a call doesn't",
);
ok(
  tags("你手机里谁的备注名最奇怪？念出来。", "truth") === "phone" && tags("你相册里最奇怪的一张照片是什么？讲讲来历。", "truth") === "",
  "a truth uses the phone only when it's shown or read from",
);
ok(tags("你劈过腿吗？或者被劈过？", "truth") === "love" && tags("你有没有吊着过一个人？为什么？", "truth") === "love", "love lives, however they're put");
ok(tags("你最长多少天没洗澡？", "truth") === "", "and not everything is about love");
ok(
  SECRETS.filter((p) => p.heat === 2).every((p) => limitsOf(p.zh, "secret").includes("love")),
  "every spicy whisper is about love lives",
);
ok(tags("Kiss the person on your left", "dare") === "touch,love" && tags("Text your ex", "dare") === "phone,love", "the table's own cards in English too");
const clearOfAll = (list: typeof TRUTHS, kind: "truth" | "dare" | "secret") => list.filter((p) => p.heat === 1 && !limitsOf(p.zh, kind).length).length;
ok(
  clearOfAll(TRUTHS, "truth") >= 30 && clearOfAll(DARES, "dare") >= 30 && clearOfAll(SECRETS, "secret") >= 30,
  `with every limit on, still plenty: ${clearOfAll(TRUTHS, "truth")} truths, ${clearOfAll(DARES, "dare")} dares, ${clearOfAll(SECRETS, "secret")} whispers`,
);

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
