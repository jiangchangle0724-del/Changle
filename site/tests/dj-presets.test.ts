/* 打碟 · DJ Booth: the 12 style presets (task card C1), checked against the card's table and
   Google's prompt guide. Run with `npx tsx tests/dj-presets.test.ts`. */
import { PRESETS, presetFor } from "../src/shared/dj/presets";
import { STYLE_IDS, type Scale, type StyleId } from "../src/shared/dj/types";
import WORDS from "./fixtures/dj/lyria-prompt-words.json";

let failures = 0;
function ok(cond: unknown, msg: string) {
  if (!cond) {
    failures++;
    console.log("  FAIL:", msg);
  }
}
function test(name: string, fn: () => void) {
  const before = failures;
  try {
    fn();
  } catch (e) {
    failures++;
    console.log("  THREW:", (e as Error).stack);
  }
  console.log(`${failures === before ? "ok  " : "FAIL"} ${name}`);
}

/** The card's table: each style's names and BPM range. */
const TABLE: Record<StyleId, { zh: string; en: string; bpm: [number, number] }> = {
  latin: { zh: "拉丁", en: "Latin", bpm: [95, 105] },
  house: { zh: "浩室", en: "House", bpm: [120, 126] },
  techno: { zh: "科技", en: "Techno", bpm: [128, 135] },
  trance: { zh: "迷幻", en: "Trance", bpm: [136, 140] },
  bass: { zh: "低音", en: "Bass", bpm: [140, 150] },
  dnb: { zh: "鼓打贝斯", en: "Drum & Bass", bpm: [170, 176] },
  hiphop: { zh: "说唱", en: "Hip-hop", bpm: [70, 80] },
  rnb: { zh: "R&B", en: "R&B", bpm: [85, 95] },
  afro: { zh: "非洲节拍", en: "Afrobeats", bpm: [105, 115] },
  kpop: { zh: "韩流", en: "K-pop club", bpm: [120, 128] },
  cpop: { zh: "华语夜店", en: "C-pop club", bpm: [120, 128] },
  bhangra: { zh: "旁遮普", en: "Bhangra", bpm: [100, 110] },
};

/** Lyria's real keys: every Scale but SCALE_UNSPECIFIED (that one lets the model choose). */
const KEYS: Scale[] = [
  "C_MAJOR_A_MINOR",
  "D_FLAT_MAJOR_B_FLAT_MINOR",
  "D_MAJOR_B_MINOR",
  "E_FLAT_MAJOR_C_MINOR",
  "E_MAJOR_D_FLAT_MINOR",
  "F_MAJOR_D_MINOR",
  "G_FLAT_MAJOR_E_FLAT_MINOR",
  "G_MAJOR_E_MINOR",
  "A_FLAT_MAJOR_F_MINOR",
  "A_MAJOR_G_FLAT_MINOR",
  "B_FLAT_MAJOR_G_MINOR",
  "B_MAJOR_A_FLAT_MINOR",
];

const GENRES = new Set<string>(Object.values(WORDS.genres).flat());
const INSTRUMENTS = new Set<string>(Object.values(WORDS.instruments).flat());
const MOODS = new Set<string>(WORDS.moods);
const ALL = new Set<string>([...GENRES, ...INSTRUMENTS, ...MOODS]);

test("the 12 styles, each under its own id and named in both languages as in the card's table", () => {
  const keys = Object.keys(PRESETS);
  ok(STYLE_IDS.length === 12 && keys.length === 12 && STYLE_IDS.every((id) => keys.includes(id)), `one preset per style, no more (${keys.join(", ")})`);
  for (const id of STYLE_IDS) {
    const p = PRESETS[id];
    ok(p?.id === id, `${id}: its id is its key (${p?.id})`);
    ok(p?.name.zh === TABLE[id].zh && p?.name.en === TABLE[id].en, `${id}: named ${TABLE[id].zh} / ${TABLE[id].en} (${p?.name.zh} / ${p?.name.en})`);
    ok(presetFor(id) === p, `${id}: presetFor finds it`);
  }
});

test("prompts: 2 to 4 words from Google's guide as written, the genre first at 1, then instruments and a mood at 0.3 to 1, none twice", () => {
  for (const id of STYLE_IDS) {
    const prompts = PRESETS[id].prompts;
    ok(prompts.length >= 2 && prompts.length <= 4, `${id}: 2 to 4 prompts (${prompts.length})`);
    for (const p of prompts) ok(ALL.has(p.text), `${id}: "${p.text}" is in the guide's lists, written exactly as there`);
    const [first, ...rest] = prompts;
    ok(GENRES.has(first?.text) && first.weight === 1, `${id}: the first is a genre at weight 1 (${first?.text} at ${first?.weight})`);
    for (const p of rest) {
      ok(INSTRUMENTS.has(p.text) || MOODS.has(p.text), `${id}: "${p.text}" after the genre is an instrument or a mood`);
      ok(p.weight >= 0.3 && p.weight <= 1, `${id}: "${p.text}" at 0.3 to 1 (${p.weight})`);
    }
    ok(rest.filter((p) => MOODS.has(p.text)).length <= 1, `${id}: one mood at most`);
    ok(new Set(prompts.map((p) => p.text)).size === prompts.length, `${id}: no word twice (${prompts.map((p) => p.text).join(", ")})`);
  }
});

test("the tempo range from the table, a real home key, density and brightness inside 0 to 1", () => {
  for (const id of STYLE_IDS) {
    const p = PRESETS[id];
    ok(p.bpm.length === 2 && p.bpm[0] === TABLE[id].bpm[0] && p.bpm[1] === TABLE[id].bpm[1], `${id}: ${TABLE[id].bpm.join(" to ")} BPM (${p.bpm.join(" to ")})`);
    ok(KEYS.includes(p.scale), `${id}: a real key, not the model's choice (${p.scale})`);
    ok(p.density >= 0 && p.density <= 1, `${id}: density inside 0 to 1 (${p.density})`);
    ok(p.brightness >= 0 && p.brightness <= 1, `${id}: brightness inside 0 to 1 (${p.brightness})`);
  }
});

test("home keys spread out: at most three styles share one", () => {
  const byKey = new Map<Scale, StyleId[]>();
  for (const id of STYLE_IDS) byKey.set(PRESETS[id].scale, [...(byKey.get(PRESETS[id].scale) ?? []), id]);
  for (const [key, ids] of byKey) ok(ids.length <= 3, `${key}: ${ids.length} styles (${ids.join(", ")})`);
});

console.log(failures ? `\n${failures} failure(s)` : "\nall passed");
process.exit(failures ? 1 : 0);
