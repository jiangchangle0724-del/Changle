/* The anime avatar: choices made safe, and every choice drawn. Run with `npx tsx tests/avatar.test.ts` */
import {
  BEARDS,
  BROWS,
  BUILDS,
  CLOTH,
  EARRINGS,
  EYE_COLORS,
  EYES,
  FACES,
  FRINGES,
  GLASSES,
  HAIR_COLORS,
  HAIRS,
  HATS,
  HEIGHTS,
  MOUTHS,
  OUTFITS,
  SKINS,
  STARTS,
  preset,
  randomCfg,
  sanitize,
  type AvatarCfg,
} from "../src/shared/avatar/cfg";
import { renderAvatar, type View } from "../src/shared/avatar/render";

let failed = 0;
function ok(cond: unknown, msg: string) {
  if (cond) console.log("ok  ", msg);
  else {
    failed++;
    console.log("FAIL", msg);
  }
}
function test(name: string, fn: () => void) {
  try {
    fn();
  } catch (e) {
    failed++;
    console.log("FAIL", name, e);
  }
}

/** What's wrong with a drawing, if anything: numbers that aren't, tags left open, references to nothing. */
function faults(svg: string): string[] {
  const out: string[] = [];
  if (!svg.startsWith("<svg ") || !svg.endsWith("</svg>")) out.push("not one svg element");
  if (/NaN|undefined|Infinity|null/.test(svg)) out.push(`a bad value: ${/.{30}(NaN|undefined|Infinity|null).{10}/.exec(svg)?.[0]}`);
  // every tag closed, in order
  const stack: string[] = [];
  for (const m of svg.matchAll(/<(\/?)([a-zA-Z][\w:-]*)[^>]*?(\/?)>/g)) {
    const [, close, name, self] = m;
    if (self) continue;
    if (!close) stack.push(name);
    else if (stack.pop() !== name) {
      out.push(`</${name}> closes the wrong tag`);
      break;
    }
  }
  if (stack.length) out.push(`left open: ${stack.join(", ")}`);
  // every url(#id) points at something drawn here
  const ids = new Set([...svg.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  for (const m of svg.matchAll(/url\(#([^)]+)\)/g)) if (!ids.has(m[1])) out.push(`url(#${m[1]}) points at nothing`);
  // ids are unique, and all start with the picture's own prefix
  const all = [...svg.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  if (all.length !== ids.size) out.push("an id used twice");
  return out;
}

const VIEWS: View[] = ["full", "head", "face"];

test("sanitize keeps a good look as it is", () => {
  for (const s of STARTS) {
    const c = preset(s.id);
    ok(JSON.stringify(sanitize(c)) === JSON.stringify(c), `preset ${s.id} survives sanitize`);
  }
  let seed = 3;
  const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 40; i++) {
    const c = randomCfg(STARTS[i % 3].id, r);
    if (JSON.stringify(sanitize(c)) !== JSON.stringify(c)) return ok(false, `random look ${i} changed by sanitize`);
  }
  ok(true, "40 random looks survive sanitize");
});

test("sanitize turns anything else into a look", () => {
  for (const raw of [null, undefined, 7, "x", [], {}, { start: "z" }]) {
    const c = sanitize(raw);
    ok(c.v === 1 && STARTS.some((s) => s.id === c.start) && faults(renderAvatar(c)).length === 0, `sanitize(${JSON.stringify(raw)}) draws`);
  }
  const evil = sanitize({
    start: "f",
    hair: '"/><script>alert(1)</script>',
    hairColor: 999,
    skin: -1,
    eyeColor: 1.5,
    outfit: "qipao",
    outfitColor: "#ff0000",
    hat: { toString: () => "cap" },
    lashes: "yes",
    browWeight: 7,
    extra: "<svg onload=alert(1)>",
  });
  const p = preset("f");
  ok(evil.hair === p.hair && evil.hairColor === p.hairColor && evil.skin === p.skin && evil.eyeColor === p.eyeColor, "unknown values fall back to the start's own");
  ok(evil.outfit === "qipao", "known values are kept");
  ok(evil.outfitColor === p.outfitColor && evil.hat === p.hat && evil.lashes === p.lashes && evil.browWeight === p.browWeight, "wrong types fall back too");
  ok(!("extra" in evil), "fields that aren't choices are dropped");
  const svg = renderAvatar(evil, { view: "head" });
  ok(!/script|onload|alert/i.test(svg), "nothing sent in reaches the drawing");
});

test("every choice draws, in every view", () => {
  const lists: [keyof AvatarCfg, readonly unknown[]][] = [
    ["face", FACES.map((o) => o.id)],
    ["eyes", EYES.map((o) => o.id)],
    ["brows", BROWS.map((o) => o.id)],
    ["mouth", MOUTHS.map((o) => o.id)],
    ["hair", HAIRS.map((o) => o.id)],
    ["fringe", FRINGES.map((o) => o.id)],
    ["beard", BEARDS.map((o) => o.id)],
    ["outfit", OUTFITS.map((o) => o.id)],
    ["hat", HATS.map((o) => o.id)],
    ["glasses", GLASSES.map((o) => o.id)],
    ["earrings", EARRINGS.map((o) => o.id)],
    ["height", HEIGHTS.map((o) => o.id)],
    ["build", BUILDS.map((o) => o.id)],
    ["skin", SKINS.map((_, i) => i)],
    ["hairColor", HAIR_COLORS.map((_, i) => i)],
    ["eyeColor", EYE_COLORS.map((_, i) => i)],
    ["outfitColor", CLOTH.map((_, i) => i)],
    ["hatColor", CLOTH.map((_, i) => i)],
    ["browWeight", [0, 1, 2]],
    ["lashes", [true, false]],
    ["blush", [true, false]],
    ["freckles", [true, false]],
    ["mole", [true, false]],
  ];
  let n = 0;
  const bad: string[] = [];
  for (const s of STARTS)
    for (const [key, values] of lists)
      for (const v of values)
        for (const view of VIEWS) {
          const c = { ...preset(s.id), [key]: v } as AvatarCfg;
          const f = faults(renderAvatar(c, { view, id: `t${n}` }));
          n++;
          if (f.length) bad.push(`${s.id} ${String(key)}=${String(v)} ${view}: ${f[0]}`);
        }
  ok(bad.length === 0, `${n} drawings, each one whole${bad.length ? `: ${bad.slice(0, 5).join("; ")}` : ""}`);
});

test("hair with every fringe and hat", () => {
  const bad: string[] = [];
  let n = 0;
  for (const h of HAIRS)
    for (const f of FRINGES)
      for (const hat of HATS) {
        const c: AvatarCfg = { ...preset("x"), hair: h.id, fringe: f.id, hat: hat.id };
        const e = faults(renderAvatar(c, { view: "head", id: `h${n++}` }));
        if (e.length) bad.push(`${h.id}/${f.id}/${hat.id}: ${e[0]}`);
      }
  ok(bad.length === 0, `${n} hair, fringe and hat combinations draw${bad.length ? `: ${bad.slice(0, 5).join("; ")}` : ""}`);
});

test("pictures on one page don't share ids", () => {
  const a = renderAvatar(preset("f"), { id: "one" });
  const b = renderAvatar(preset("f"), { id: "two" });
  const idsA = new Set([...a.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]));
  const clash = [...b.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]).filter((x) => idsA.has(x));
  ok(clash.length === 0, "two prefixes, no id in common");
  const live = renderAvatar(preset("f"), { id: "lv", live: true });
  const css = /<style>(.*?)<\/style>/.exec(live)?.[1] ?? "";
  const rules = [...css.matchAll(/(?:^|[{}])\s*([^{}@]+)\{/g)].map((m) => m[1].trim()).filter((sel) => !/^[\d.]+%|^from$|^to$/.test(sel));
  ok(rules.length > 0 && rules.every((sel) => sel.split(",").every((x) => x.trim().startsWith("#lv"))), "the moving picture's style only reaches its own parts");
});

test("the round avatar stays small", () => {
  let max = 0;
  let seed = 11;
  const r = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 60; i++) max = Math.max(max, renderAvatar(randomCfg(STARTS[i % 3].id, r), { view: "head", id: "av" }).length);
  ok(max < 60_000, `the biggest of 60 random round avatars is ${(max / 1024).toFixed(1)} KB`);
});

if (failed) {
  console.log(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nall passed");
