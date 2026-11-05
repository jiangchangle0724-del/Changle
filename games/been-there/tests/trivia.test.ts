// The waiting teams' quiz (抢答): every question in the bank is well formed, and a landing's question is
// picked the way the room promises (about that city; never twice in a game; what the phones haven't
// seen first; not the one the arrival card answers while a big screen shows it).
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { CITIES, type Text } from "../src/engine";
import { random } from "../src/engine/rng";
import { LEGACY_ORDER, SEEN_KEEP, TRIVIA, TRIVIA_BY_ID, TRIVIA_ID, onArrivalCard, pickTrivia, triviaSources, type TriviaQuestion } from "../src/room/trivia";

/** What a phone screen holds: longest question, option and fact, in characters. */
const MAX = {
  q: { zh: 50, en: 140 },
  option: { zh: 16, en: 44 },
  fact: { zh: 80, en: 200 },
};
const DASHES_AND_CURLY_QUOTES = /[\u2012-\u2015\u2018-\u201f\u2032\u2033]/;

test("every question in the bank is ready for a phone: a unique id, a city, three different options, both languages, an https source", () => {
  const cities = new Set(CITIES.map((c) => c.id));
  const ids = new Set<string>();
  const problems: string[] = [];
  for (const q of TRIVIA) {
    const say = (what: string) => problems.push(`${q.id}: ${what}`);
    if (ids.has(q.id)) say("the id is used twice");
    ids.add(q.id);
    if (!TRIVIA_ID.test(q.id) || !q.id.startsWith(`${q.city}-`)) say(`the id should be the city's id and a number, like ${q.city}-01`);
    if (!cities.has(q.city)) say(`no city called ${q.city}`);
    if (q.options.length !== 3) say("needs exactly three options (the prize and the charge are balanced for three)");
    const texts: [string, Text][] = [
      ["question", q.q],
      ["fact", q.fact],
      ...q.options.map((o, i): [string, Text] => [`option ${i + 1}`, o]),
    ];
    for (const lang of ["zh", "en"] as const) {
      for (const [name, text] of texts) {
        const s = text?.[lang];
        if (typeof s !== "string" || !s.trim()) say(`${name} has no ${lang}`);
        else {
          if (s !== s.trim() || /\s{2}/.test(s)) say(`${name} (${lang}) has extra spaces`);
          if (DASHES_AND_CURLY_QUOTES.test(s)) say(`${name} (${lang}) has a dash or a curly quote: use 「」, commas or straight quotes`);
        }
      }
      const opts = q.options.map((o) => o[lang]?.trim().toLowerCase());
      if (new Set(opts).size !== 3) say(`the three options (${lang}) aren't all different`);
      const long = (name: string, s: string, max: number) => {
        if ([...s].length > max) say(`${name} (${lang}) is ${[...s].length} characters; at most ${max} fit a phone`);
      };
      long("question", q.q[lang] ?? "", MAX.q[lang]);
      long("fact", q.fact[lang] ?? "", MAX.fact[lang]);
      q.options.forEach((o, i) => long(`option ${i + 1}`, o[lang] ?? "", MAX.option[lang]));
    }
    let url: URL | null = null;
    try {
      url = new URL(q.source);
    } catch {
      // reported below
    }
    if (!url || url.protocol !== "https:" || !url.hostname.includes(".")) say(`the source should be an https page, not "${q.source}"`);
  }
  assert.deepEqual(problems, []);
  assert.deepEqual(
    CITIES.filter((c) => !TRIVIA.some((q) => q.city === c.id)).map((c) => c.id),
    [],
    "every city has a question",
  );
  assert.equal(TRIVIA_BY_ID.size, TRIVIA.length);
});

test("the 22 questions from before ids keep their old order, so rooms and saves from then still read right", () => {
  assert.equal(LEGACY_ORDER.length, 22);
  for (const id of LEGACY_ORDER) assert.ok(TRIVIA_BY_ID.has(id), id);
  // (their order then: one question per city, in board order)
  assert.deepEqual(
    LEGACY_ORDER.map((id) => TRIVIA_BY_ID.get(id)!.city),
    CITIES.map((c) => c.id),
  );
});

/** A bank the size the quiz is growing to: eight questions for every city. */
function bigBank(): TriviaQuestion[] {
  const t = (zh: string, en: string): Text => ({ zh, en });
  return CITIES.flatMap((c) =>
    Array.from({ length: 8 }, (_, i): TriviaQuestion => {
      const id = `${c.id}-${String(i + 1).padStart(2, "0")}`;
      return { id, city: c.id, q: t(id, id), options: [t("对", "right"), t("错", "wrong"), t("也错", "also wrong")], fact: t("事实", "fact"), source: "https://example.org/" };
    }),
  );
}

test("picking: a question about the city landed on, never one asked already this game; none left about it, no question", () => {
  const bank = bigBank();
  const h = { seed: 3 };
  const asked: string[] = [];
  for (const c of CITIES) {
    for (let i = 0; i < 8; i++) {
      const id = pickTrivia({ bank, city: c.id, asked, cardShown: false, seen: [], random: () => random(h) });
      assert.ok(id, `a question about ${c.id} at pick ${i}`);
      assert.equal(bank.find((q) => q.id === id)!.city, c.id, `${id} isn't about ${c.id}`);
      assert.ok(!asked.includes(id), `${id} came round again`);
      asked.push(id);
    }
    assert.equal(pickTrivia({ bank, city: c.id, asked, cardShown: false, seen: [], random: () => random(h) }), null, `${c.id}: all eight asked`);
  }
  assert.equal(new Set(asked).size, bank.length, "all 176 asked, each once");
  assert.equal(pickTrivia({ bank, city: "atlantis", asked: [], cardShown: false, seen: [], random: () => random(h) }), null, "a city the bank has nothing about");
});

test("picking: what the fewest of the phones have seen comes first", () => {
  const bank = bigBank();
  const h = { seed: 8 };
  const tokyo = bank.filter((q) => q.city === "tokyo").map((q) => q.id);
  // Two phones have seen all of Tokyo's but its 3rd question; one of them hasn't seen its 5th either.
  const seen = [tokyo.filter((id) => id !== "tokyo-03"), tokyo.filter((id) => id !== "tokyo-03" && id !== "tokyo-05")];
  const pick = (asked: string[]) => pickTrivia({ bank, city: "tokyo", asked, cardShown: false, seen, random: () => random(h) });
  assert.equal(pick([]), "tokyo-03");
  assert.equal(pick(["tokyo-03"]), "tokyo-05");
  // One every phone has seen is still better than none.
  const third = pick(["tokyo-03", "tokyo-05"]);
  assert.ok(third && tokyo.includes(third) && third !== "tokyo-03" && third !== "tokyo-05");
  // With nothing to choose by, any of the city's: over many picks, every one of them.
  const got = new Set<string>();
  for (let i = 0; i < 400; i++) got.add(pickTrivia({ bank, city: "tokyo", asked: [], cardShown: false, seen: [], random: () => random(h) })!);
  assert.deepEqual([...got].sort(), tokyo);
});

test("the question a city's arrival card answers: one a city, never asked about a landing there while a big screen has the card up", () => {
  // (the card prints the fact behind the city's rule, and that question comes from the same page)
  for (const c of CITIES) {
    const mine = TRIVIA.filter((q) => q.city === c.id);
    assert.deepEqual(mine.filter(onArrivalCard).map((q) => q.id), [`${c.id}-01`], c.id);
    assert.ok(mine.length >= 6, `${c.id}: at least five questions its card doesn't answer`);
  }
  const h = { seed: 4 };
  for (const c of CITIES)
    for (let i = 0; i < 40; i++) assert.notEqual(pickTrivia({ city: c.id, asked: [], cardShown: true, seen: [], random: () => random(h) }), `${c.id}-01`);
  // With no big screen nothing shows that fact on a landing: it can be asked. With one, once the others have been, none.
  const others = TRIVIA.filter((q) => q.city === "bangkok" && q.id !== "bangkok-01").map((q) => q.id);
  assert.equal(pickTrivia({ city: "bangkok", asked: others, cardShown: false, seen: [], random: () => random(h) }), "bangkok-01");
  assert.equal(pickTrivia({ city: "bangkok", asked: others, cardShown: true, seen: [], random: () => random(h) }), null);
});

test("the credits page's sources: grouped by city in board order, each listed once", () => {
  const list = triviaSources(bigBank());
  assert.deepEqual(
    list.map((x) => x.city),
    CITIES.map((c) => c.id),
  );
  for (const x of list) assert.deepEqual(x.sources, ["https://example.org/"], `${x.city}: one source, once`);
  const real = triviaSources();
  assert.equal(real.reduce((n, x) => n + x.sources.length, 0), new Set(TRIVIA.map((q) => `${q.city} ${q.source}`)).size);
  for (const x of real) for (const s of x.sources) assert.ok(s.startsWith("https://"), s);
  assert.ok(SEEN_KEEP >= 176, "a phone remembers at least a whole bank of eight questions a city");
});

test("the pop-up is stacked over everything on a phone but a party forfeit (and the speed test's readout, which takes no taps)", () => {
  // (the landing scene used to cover it: a team that landed somewhere new couldn't answer)
  const css = readFileSync("src/client/styles.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const layers: { sel: string; z: number }[] = [];
  const open: string[] = [];
  let from = 0;
  for (let i = 0; i < css.length; i++) {
    if (css[i] === "{") open.push(css.slice(from, i).trim());
    else if (css[i] === "}") open.pop();
    else if (css[i] === ";") {
      const z = css.slice(from, i).match(/^\s*z-index\s*:\s*(-?\d+)\s*$/);
      if (z) layers.push({ sel: open[open.length - 1] ?? "", z: Number(z[1]) });
    }
    if ("{};".includes(css[i])) from = i + 1;
  }
  const pop = layers.filter((l) => l.sel === ".quizpop");
  assert.equal(pop.length, 1, "the pop-up has one layer");
  const above = layers.filter((l) => l.z >= pop[0].z && l.sel !== ".quizpop").map((l) => `${l.sel} (${l.z})`);
  assert.deepEqual(above.sort(), [".forfeit-hold (70)", ".speed-meter (61)"]);
  assert.ok(layers.some((l) => l.sel === ".touchdown" && l.z < pop[0].z), "the landing scene is under it");
});

test("phones never hold the answers: nothing the game's own pages load imports the question bank", () => {
  // (only the room does: on the server, and in the one-phone demo, which runs the room in the page)
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const p = join(dir, name);
      return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(name) ? [p] : [];
    });
  const importsBank = walk("src/client").filter((f) => /from\s+["'][^"']*room\/trivia(Bank)?["']/.test(readFileSync(f, "utf8")));
  assert.deepEqual(importsBank, []);
});
