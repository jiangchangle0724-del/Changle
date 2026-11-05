// The waiting teams' quiz (抢答): every question in the bank is well formed, and the next question is
// picked the way the room promises (never twice in a game; what the phones haven't seen first).
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { CITIES, type Text } from "../src/engine";
import { random } from "../src/engine/rng";
import { LEGACY_ORDER, SEEN_KEEP, TRIVIA, TRIVIA_BY_ID, TRIVIA_ID, pickTrivia, triviaSources, type TriviaQuestion } from "../src/room/trivia";

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

test("picking: never a question asked already this game; none left, no question", () => {
  const bank = bigBank();
  const h = { seed: 3 };
  const asked: string[] = [];
  for (let i = 0; i < bank.length; i++) {
    const id = pickTrivia({ bank, asked, near: new Set(), seen: [], random: () => random(h) });
    assert.ok(id, `a question at pick ${i}`);
    assert.ok(!asked.includes(id), `${id} came round again`);
    asked.push(id);
  }
  assert.equal(new Set(asked).size, bank.length, "all 176 asked, each once");
  assert.equal(pickTrivia({ bank, asked, near: new Set(), seen: [], random: () => random(h) }), null);
});

test("picking: not about a city the team on turn could land on, then what the fewest phones have seen, spread over the cities", () => {
  const bank = bigBank();
  const h = { seed: 8 };
  const near = new Set(CITIES.slice(0, 20).map((c) => c.id));
  for (let i = 0; i < 50; i++) {
    const id = pickTrivia({ bank, asked: [], near, seen: [], random: () => random(h) })!;
    assert.ok(!near.has(TRIVIA_BY_ID.get(id)?.city ?? bank.find((q) => q.id === id)!.city), `${id} is about a city in reach`);
  }
  // Every city in reach: still a question (the nearest ones are better than none).
  const all = new Set(CITIES.map((c) => c.id));
  assert.ok(pickTrivia({ bank, asked: [], near: all, seen: [], random: () => random(h) }));

  // Two phones have seen everything but Tokyo's 3rd question; one of them hasn't seen Venice's 1st.
  const everything = bank.map((q) => q.id);
  const seen = [everything.filter((id) => id !== "tokyo-03"), everything.filter((id) => id !== "tokyo-03" && id !== "venice-01")];
  assert.equal(pickTrivia({ bank, asked: [], near: new Set(), seen, random: () => random(h) }), "tokyo-03");
  assert.equal(pickTrivia({ bank, asked: ["tokyo-03"], near: new Set(), seen, random: () => random(h) }), "venice-01");
  // …but never at the cost of a city in reach.
  assert.notEqual(pickTrivia({ bank, asked: [], near: new Set(["tokyo"]), seen, random: () => random(h) }), "tokyo-03");

  // With nothing else to choose by, the cities take turns: 22 questions in a row, 22 different cities.
  const asked: string[] = [];
  for (let i = 0; i < CITIES.length; i++) asked.push(pickTrivia({ bank, asked, near: new Set(), seen: [], random: () => random(h) })!);
  assert.equal(new Set(asked.map((id) => id.split("-")[0])).size, CITIES.length);
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
