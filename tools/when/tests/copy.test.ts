import assert from "node:assert/strict";
import test from "node:test";
import { inviteText, nudgeText, resultText, type InviteWords, type NudgeWords, type ResultWords, type Tone } from "../src/engine/copy";
import { reason, type Tally } from "../src/engine/rank";
import { dateLabel, slotLabel } from "../src/engine/slots";
import type { Lang, Part, Person } from "../src/engine/types";

const tones: Tone[] = ["plain", "easy", "funny"];
const languages: Lang[] = ["zh", "en"];
const picks = [0, 1, 2];
// Eight code points in the title; three in each name; seven in the deadline.
// Every field includes punctuation and an emoji, which must survive without escaping.
const title = '周末，"一起聚🙂';
const names = ['，"🙂', '"🙂，', '🙂，"'];
const deadlines: Record<Lang, string> = { zh: "周四晚上八点半", en: "Thu 8pm" };
const url = "https://example.com/when/abcd2345?from=chat&lang=zh#times";
const days = ["2026-11-13", "2026-11-21", "2026-11-26"];
const invite: InviteWords = { title, url, days };
const nudge: NudgeWords = { title, url, missing: names };
const result: ResultWords = { title, url, day: "2026-11-21", part: "eve", coming: 7, asked: 10, maybe: names };

type Kind = "invite" | "nudge" | "result";
function render(kind: Kind, tone: Tone, lang: Lang, pick?: number): string {
  if (kind === "invite") return inviteText({ ...invite, deadline: deadlines[lang] }, tone, lang, pick);
  if (kind === "nudge") return nudgeText({ ...nudge, deadline: deadlines[lang] }, tone, lang, pick);
  return resultText(result, tone, lang, pick);
}

function checkMessage(text: string, lang: Lang, expectedNames: string[] = []): void {
  assert.ok(text.includes(title), "the exact title survives");
  assert.equal(text.split("\n").at(-1), url, "the URL is alone on the last line");
  assert.equal(text.split(url).length, 2, "the link appears exactly once");
  for (const name of expectedNames) assert.ok(text.includes(name), `the exact name survives: ${name}`);
  const body = text.slice(0, -(url.length + 1));
  const limit = lang === "zh" ? 70 : 220;
  assert.ok([...body].length <= limit, `${[...body].length}/${limit}: ${body}`);
  // Stay within the limit even for callers counting UTF-16 units instead of code points.
  assert.ok(body.length <= limit, `${body.length}/${limit} UTF-16 units: ${body}`);
  let authored = body.replace(title, "");
  for (const name of expectedNames) authored = authored.replaceAll(name, "");
  assert.doesNotMatch(authored, /\p{Extended_Pictographic}/u, "these templates add no emoji");
  assert.doesNotMatch(authored, /[!！]{2}/u);
}

for (const kind of ["invite", "nudge", "result"] as const) {
  for (const tone of tones) {
    for (const lang of languages) {
      test(`${kind} / ${tone} / ${lang}: three short, distinct, repeatable variants with literal user text`, () => {
        const texts = picks.map((pick) => render(kind, tone, lang, pick));
        assert.equal(new Set(texts).size, 3);
        assert.equal(render(kind, tone, lang), texts[0], "the default is variant zero");
        for (const pick of picks) {
          checkMessage(texts[pick], lang, kind === "invite" ? [] : names);
          assert.equal(render(kind, tone, lang, pick), texts[pick]);
          for (const lap of [1, 2, 100]) assert.equal(render(kind, tone, lang, pick + 3 * lap), texts[pick]);
        }
      });
    }
  }
}

test("ordinary eight-character titles, three three-character names and seven-character deadlines fit too", () => {
  for (const lang of languages) for (const tone of tones) for (const pick of picks) {
    const ordinaryTitle = lang === "zh" ? "周末一起出来聚聚" : "Catch-up";
    const ordinaryNames = lang === "zh" ? ["阿小陈", "阿小李", "阿小王"] : ["Amy", "May", "Sam"];
    for (const text of [
      inviteText({ ...invite, title: ordinaryTitle, deadline: deadlines[lang] }, tone, lang, pick),
      nudgeText({ ...nudge, title: ordinaryTitle, missing: ordinaryNames, deadline: deadlines[lang] }, tone, lang, pick),
      resultText({ ...result, title: ordinaryTitle, maybe: ordinaryNames }, tone, lang, pick),
    ]) {
      assert.ok(text.includes(ordinaryTitle));
      assert.equal(text.split("\n").at(-1), url);
      assert.ok(text.slice(0, -(url.length + 1)).length <= (lang === "zh" ? 70 : 220), text);
    }
  }
});

test("invitations use the shared labels for a single day and the ends of each range", () => {
  for (const lang of languages) for (const tone of tones) for (const pick of picks) {
    for (const dates of [["2026-11-13"], days, ["2026-12-31", "2027-01-01"], ["2028-02-29"]]) {
      const text = inviteText({ ...invite, days: dates }, tone, lang, pick);
      const range = dates.length === 1 ? dateLabel(dates[0], lang) : `${dateLabel(dates[0], lang)}${lang === "zh" ? "到" : " to "}${dateLabel(dates.at(-1)!, lang)}`;
      assert.ok(text.includes(range), text);
      if (dates.length > 2) assert.ok(!text.includes(dateLabel(dates[1], lang)), "don't list every day");
      checkMessage(text, lang);
    }
  }
});

test("deadlines are optional and used literally in every invitation and nudge", () => {
  for (const lang of languages) for (const tone of tones) for (const pick of picks) {
    const calls = [
      (deadline?: string) => inviteText({ ...invite, deadline }, tone, lang, pick),
      (deadline?: string) => nudgeText({ ...nudge, deadline }, tone, lang, pick),
    ];
    for (const call of calls) {
      const without = call();
      assert.equal(without, call(""));
      assert.doesNotMatch(without, /截止|之前|前填|deadline|reply by/i);
      for (const deadline of [deadlines[lang], '周四，"🙂 8 点', "Thursday 8 p.m."]) {
        const withDeadline = call(deadline);
        assert.equal(withDeadline.split(deadline).length, 2);
        assert.ok(withDeadline.includes(lang === "zh" ? `${deadline}前` : `by ${deadline}`));
      }
    }
  }
});

test("an English deadline that ends in a full stop doesn't get a second one", () => {
  for (const tone of tones) for (const pick of picks) {
    const text = inviteText({ ...invite, deadline: "Thursday 8 p.m." }, tone, "en", pick);
    assert.ok(text.includes("by Thursday 8 p.m.\n"), text);
    assert.ok(inviteText({ ...invite, deadline: "Thu 8pm" }, tone, "en", pick).includes("by Thu 8pm.\n"));
  }
});

test("nudges address unknown guests, name up to five, and count six or more", () => {
  const six = ["小陈", "Alex", ...names, "Sam"];
  for (const lang of languages) for (const tone of tones) for (const pick of picks) {
    for (const missing of [[], [six[0]], six.slice(0, 5), six, Array.from({ length: 40 }, (_, i) => `guest-${i}`)]) {
      const text = nudgeText({ ...nudge, missing, deadline: deadlines[lang] }, tone, lang, pick);
      checkMessage(text, lang, missing.length <= 5 ? missing : []);
      if (!missing.length) assert.ok(text.includes(lang === "zh" ? "还没填的朋友" : "Anyone who hasn't answered yet"));
      if (missing.length > 5) {
        assert.ok(text.includes(lang === "zh" ? `${missing.length} 位朋友` : `${missing.length} replies`));
        for (const name of missing) assert.ok(!text.includes(name), "a long list is counted, not partly named");
      }
    }
  }
});

test("every result uses the shared date/part label and agrees with rank's attendance reason", () => {
  for (const lang of languages) for (const tone of tones) for (const pick of picks) {
    for (const part of ["am", "pm", "eve", "day"] as Part[]) for (const count of [0, 1, 3, 4, 40]) {
      const maybe = Array.from({ length: count }, (_, i) => names[i % names.length]);
      const people: Person[] = Array.from({ length: count + 7 }, (_, i) => ({ id: String(i), name: maybe[i - 7] ?? `person-${i}`, must: false, proxy: false, answers: {}, at: 0 }));
      const tally: Tally = { slot: `${result.day}:${part}`, day: result.day, part, yes: people.slice(0, 7).map((p) => p.id), maybe: people.slice(7).map((p) => p.id), no: [], meet: null, out: null };
      const text = resultText({ ...result, part, asked: people.length, maybe }, tone, lang, pick);
      assert.ok(text.includes(slotLabel(result.day, part, lang)), text);
      assert.ok(text.includes(reason(tally, people, lang)), text);
      if (count <= 3) for (const name of maybe) assert.ok(text.includes(name));
      else for (const name of names) assert.ok(!text.includes(name), "four or more maybes are counted");
      checkMessage(text, lang, count <= 3 ? maybe : []);
    }
  }
});

test("zero free and all free are reported literally, without adding maybes to the free count", () => {
  for (const lang of languages) for (const tone of tones) for (const pick of picks) {
    for (const coming of [0, 7]) {
      const text = resultText({ ...result, coming, asked: 7, maybe: coming ? [] : names }, tone, lang, pick);
      assert.ok(text.includes(lang === "zh" ? `7 个人里 ${coming} 个有空` : `${coming} of 7 free`));
      if (!coming) assert.ok(text.includes(lang === "zh" ? "可以调" : "could move things"));
      else assert.doesNotMatch(text, /可以调|could move things/);
    }
  }
});

test("user text is never trimmed, interpreted as placeholders, escaped, or truncated", () => {
  const literal = '  ，"🙂 ${title} <b>&\n下一行  ';
  for (const lang of languages) for (const tone of tones) for (const pick of picks) {
    for (const text of [
      inviteText({ ...invite, title: literal }, tone, lang, pick),
      nudgeText({ ...nudge, title: literal, missing: [literal] }, tone, lang, pick),
      resultText({ ...result, title: literal, maybe: [literal] }, tone, lang, pick),
    ]) {
      assert.ok(text.includes(literal));
      assert.equal(text.split("\n").at(-1), url);
      assert.ok(!text.includes("&lt;"));
    }
    assert.ok(nudgeText({ ...nudge, missing: [literal] }, tone, lang, pick).includes(literal));
    assert.ok(resultText({ ...result, maybe: [literal] }, tone, lang, pick).includes(literal));
  }
});

test("variant selection is deterministic for negative, fractional, and non-finite picks too", () => {
  for (const kind of ["invite", "nudge", "result"] as const) for (const lang of languages) for (const tone of tones) {
    assert.equal(render(kind, tone, lang, -1), render(kind, tone, lang, 2));
    assert.equal(render(kind, tone, lang, 4.9), render(kind, tone, lang, 1));
    for (const pick of [NaN, Infinity, -Infinity]) assert.equal(render(kind, tone, lang, pick), render(kind, tone, lang, 0));
  }
});
