// What she wears, one outfit a song (Steve on Nov 14: 夜店性感, 优雅保守, 休闲运动, 节日主题, and a few
// bikinis "暴露一点"). Each: its names, its style, its hair (style and colour), its shoes (or none),
// and its garments: regions of her body (garments.mjs) in a cloth (cloth.mjs), or MakeHuman's own
// clothes recoloured. Heights and places are her landmarks' (metres, at rest: x her left, y up, z
// forward), so a garment follows her body if her shape changes.
import { R, bowed, curve } from "./garments.mjs";
import { by, flowers, fur, satin, sequins, sheer, solid, velvet } from "./cloth.mjs";

const TORSO = ["Hips", "Spine", "Spine1", "Spine2", "Neck", "LeftShoulder", "RightShoulder"];
const LEGS = ["LeftUpLeg", "LeftLeg", "RightUpLeg", "RightLeg"];
const mirror = (half) => [...half, ...half.slice().reverse().map(([x, y]) => [-x, y])];

// ---------------------------------------------------------------- pieces, used by several outfits

/** a string (a thin strap) along points on her trunk, each seen from a side: [[x, y, z?], from] */
function string(L, prep, pts, w = 0.007) {
  const on = pts.map(([p, from]) => L.at(p, from));
  return R.band(curve(prep, on, 10, L.trunk), w);
}

/** leggings or tights: hips to `low` (a height), the waistband at `waist` (front; the back a little higher) */
function legs(L, { waist = 1.04, low = 0.1 } = {}) {
  return R.and(R.on([...LEGS, "Hips", "Spine"]), R.below((q) => waist + 0.012 * Math.min(1, Math.max(0, (0.03 - q.p[2]) / 0.08))), R.above(low));
}

/** a bikini's triangle top: two cups and their strings */
function triangleTop(L, prep, { tie = 0.007, size = 1 } = {}) {
  const b = L.bust.L;
  const k = size;
  // each cup a triangle: its tip above the nipple, a little in; its bottom corners under the breast
  const tip = [b[0] - 0.012, b[1] + 0.088 * k];
  const outer = [b[0] + 0.05 * k, b[1] - 0.052 * k];
  const inner = [0.024, b[1] - 0.058 * k];
  const cup = (s) =>
    R.and(
      R.front(0.06),
      R.on(TORSO),
      R.polyXY(bowed([tip, outer, inner].map(([x, y]) => [s * x, y]), [0.012, 0.006, -0.004])),
    );
  const neck = (s) =>
    string(
      L,
      prep,
      [
        [[s * tip[0], tip[1] - 0.004], "front"],
        [[s * 0.068, b[1] + 0.165], "front"],
        [[s * 0.045, L.bone("Neck")[1] + 0.02, 0], s > 0 ? "left" : "right"],
        [[0, L.bone("Neck")[1] + 0.025], "back"],
      ],
      tie,
    );
  const middle = string(L, prep, [[[inner[0] + 0.004, inner[1] + 0.004], "front"], [[0, inner[1] + 0.006], "front"], [[-inner[0] - 0.004, inner[1] + 0.004], "front"]], tie * 1.2);
  const back = string(
    L,
    prep,
    [
      [[outer[0] - 0.006, outer[1] + 0.006], "front"],
      [[0, outer[1] + 0.006, 0.0], "left"],
      [[0.08, outer[1] + 0.01], "back"],
      [[0, outer[1] + 0.012], "back"],
      [[-0.08, outer[1] + 0.01], "back"],
      [[0, outer[1] + 0.006, 0.0], "right"],
      [[-(outer[0] - 0.006), outer[1] + 0.006], "front"],
    ],
    tie,
  );
  return { cups: R.or(cup(1), cup(-1)), strings: R.or(neck(1), neck(-1), middle, back) };
}

/** a bikini's bottom: a front and a back panel, the strip between the legs, strings over the hips */
function bikiniBottom(L, prep, { top = 0.03, back = 0.1, tie = 0.007, high = 0 } = {}) {
  const c = L.crotch;
  const hip = L.bone("LeftUpLeg");
  const yTop = hip[1] + top;
  const front = R.and(
    R.front(0.035),
    R.polyXY(mirror([[0, yTop - 0.012], [0.05, yTop - 0.004], [0.085, yTop + high], [0.075, yTop - 0.03 + high], [0.05, c[1] + 0.035], [0.028, c[1] + 0.005]])),
  );
  const rear = R.and(
    R.back(0.0),
    R.polyXY(mirror([[0, yTop + 0.012], [0.06, yTop + 0.01], [back, yTop + 0.006 + high], [back - 0.02, yTop - 0.05 + high], [0.05, c[1] + 0.03], [0.026, c[1] + 0.005]])),
  );
  const middle = R.and(R.on(["Hips", "LeftUpLeg", "RightUpLeg"]), R.below(c[1] + 0.035), R.above(c[1] - 0.012), (q) => Math.abs(q.p[0]) - 0.028);
  const side = (s) =>
    string(L, prep, [[[s * 0.085, yTop + high], "front"], [[0, yTop + 0.012 + high, 0], s > 0 ? "left" : "right"], [[s * back, yTop + 0.006 + high], "back"]], tie);
  return R.or(front, rear, middle, side(1), side(-1));
}

/** a sports bra: under the bust to a scooped neckline, wide straps crossing to the middle of the back */
function sportsBra(L, prep) {
  const b = L.bust.L;
  const ub = b[1] - 0.085;
  const sh = L.bone("LeftArm");
  const front = R.and(
    R.front(0.02),
    R.on(TORSO),
    R.polyXY(mirror([[0, b[1] + 0.05], [0.045, b[1] + 0.075], [0.075, b[1] + 0.1], [0.11, b[1] + 0.085], [0.15, b[1] + 0.02], [0.2, ub], [0.2, ub - 0.01], [0, ub - 0.01]])),
  );
  const rear = R.and(R.back(0.04), R.on(TORSO), R.above(ub - 0.01), R.below(ub + 0.075));
  const strap = (s) =>
    string(
      L,
      prep,
      [
        [[s * 0.088, b[1] + 0.095], "front"],
        [[s * 0.085, 0, sh[2] - 0.01], "top"],
        [[s * 0.06, sh[1] - 0.04], "back"],
        [[0, ub + 0.07], "back"],
      ],
      0.034,
    );
  return R.smooth(0.01, front, rear, strap(1), strap(-1));
}

/**
 * The leg openings of a swimsuit or bodysuit: a plane across each leg from high on the hip (`high`
 * metres over the hip joint) to the crotch, front and back cut apart (`cheek`: how high the back
 * rises over the buttock). Negative on her trunk's side.
 */
function legCut(L, { high = 0.04, cheek = 0.03 } = {}) {
  const c = L.crotch;
  const hipY = L.bone("LeftUpLeg")[1];
  const cut = [1, -1].map((s) => {
    const S = [s * 0.17, hipY + high, -0.005];
    const knee = [s * 0.13, 0.48, 0.05];
    const front = R.plane3(S, [s * 0.034, c[1] - 0.003, c[2] + 0.03], [s * 0.1, c[1] + 0.045 + high * 0.5, 0.11], knee);
    const back = R.plane3(S, [s * 0.034, c[1] - 0.003, c[2] - 0.08], [s * 0.11, c[1] + 0.02 + cheek, -0.1], knee);
    return { front, back };
  });
  return (q) => {
    const k = q.p[0] >= 0 ? cut[0] : cut[1];
    return q.p[2] > L.crotch[2] - 0.035 ? k.front(q) : k.back(q);
  };
}

/** the top of a strapless piece: `front` over the bust, `back` across the back, eased between at the sides */
function topEdge(L, front, back, { dip = 0 } = {}) {
  const zc = 0.02;
  return (q) => {
    const t = Math.min(1, Math.max(0, (q.p[2] - zc + 0.06) / 0.12));
    const e = t * t * (3 - 2 * t);
    // a sweetheart: dipping a little between the breasts
    const d = dip * Math.max(0, 1 - Math.abs(q.p[0]) / 0.045);
    return q.p[1] - (back + (front - back) * e - d * e);
  };
}

/** a bodysuit or one-piece: leg openings, up to a strapless top edge */
function bodysuit(L, { front, back, dip = 0.012, high = 0.04, cheek = 0.03 }) {
  return R.and(R.on([...TORSO, "LeftUpLeg", "RightUpLeg"]), legCut(L, { high, cheek }), topEdge(L, front, back, { dip }));
}

/** a band of trim along a region's edge (its outline, inside it), w wide */
const trim = (region, w) => R.and(region, (q) => -region(q) - w);

/** shorts: from a waistband down to a cut across each leg (`low`: under the crotch) */
function shorts(L, { waist, low = 0.035 }) {
  const c = L.crotch;
  const cut = [1, -1].map((s) => R.plane3([s * 0.03, c[1] - low, c[2] + 0.02], [s * 0.18, c[1] - low + 0.03, 0.0], [s * 0.09, c[1] - low - 0.005, -0.08], [s * 0.13, 0.48, 0.05]));
  return R.and(R.on(["Hips", "Spine", "LeftUpLeg", "RightUpLeg"]), R.below(waist), (q) => (q.p[0] >= 0 ? cut[0](q) : cut[1](q)));
}

/** boots up the shin to `top` (a height), the feet in them */
const boots = (top) => R.and(R.on(["LeftLeg", "RightLeg", "LeftFoot", "RightFoot", "LeftToeBase", "RightToeBase"]), R.below(top));

/** pumps: the sole, the toes, the sides low and the heel higher; the top of the foot bare */
function pumps(L) {
  const ankle = L.bone("LeftFoot");
  return R.and(R.on(["LeftFoot", "RightFoot", "LeftToeBase", "RightToeBase", "LeftLeg", "RightLeg"]), (q) => {
    // along the foot: 0 at the heel's back, 1 at the toes
    const t = (q.p[2] - (ankle[2] - 0.06)) / 0.26;
    const line = t > 0.7 ? 0.075 : t < 0.18 ? 0.065 : 0.03 + 0.02 * Math.abs(t - 0.44) / 0.26;
    return q.p[1] - line;
  });
}

/** sneakers: the whole foot to just over the ankle, a white sole round the bottom (knit, so no seams to show) */
function sneakers(L) {
  const ankle = L.bone("LeftFoot");
  return R.and(R.on(["LeftFoot", "RightFoot", "LeftToeBase", "RightToeBase", "LeftLeg", "RightLeg"]), R.below(ankle[1] + 0.025));
}
const soled = (upper, sole = "#f4f2ee") => by((q) => (q.p[1] < 0.028 ? 0 : 1), solid(sole, { grain: 0.002, vary: 0.03 }), upper);

/** a mandarin collar, cap sleeves and a fitted body, to the hips (the skirt is MakeHuman's) */
function qipaoTop(L) {
  const neck = L.bone("Neck");
  const sh = [L.bone("LeftArm"), L.bone("RightArm")];
  const el = [L.bone("LeftForeArm"), L.bone("RightForeArm")];
  const sleeve = (q) => {
    const s = q.p[0] >= 0 ? 0 : 1;
    const a = sh[s];
    const u = [el[s][0] - a[0], el[s][1] - a[1], el[s][2] - a[2]];
    const l = Math.hypot(...u);
    const t = ((q.p[0] - a[0]) * u[0] + (q.p[1] - a[1]) * u[1] + (q.p[2] - a[2]) * u[2]) / l;
    return t - 0.075;
  };
  const body = R.and(R.on([...TORSO, "LeftUpLeg", "RightUpLeg"]), R.above(L.crotch[1] + 0.02), R.below(neck[1] + 0.04));
  const arms = R.and(R.on(["LeftArm", "RightArm", "LeftShoulder", "RightShoulder"]), sleeve);
  return R.or(body, arms);
}

/** briefs under a skirt (nothing to see from any angle, sitting either) */
const brief = (L, hex) => ({ name: "Brief", region: shorts(L, { waist: L.bone("Hips")[1] + 0.03, low: -0.004 }), cloth: solid(hex, { grain: 0.002 }), offset: 0.0025, rough: 0.6 });

/** the elegant suit's pencil skirt alone (its blouse left off; and so is what it hides of her, the arms with it) */
const SKIRT = { file: "clothes/female_elegantsuit01/female_elegantsuit01.mhclo", only: (x, y) => y < 0.52 && x < 0.78 };

// ---------------------------------------------------------------- the outfits

/**
 * Each outfit: id; zh, en: its name; style (what Steve asked for); hair: [style, colour]; shoes: a
 * MakeHuman shoe (or null); garments(L, prep): its pieces made from her skin; clothes: MakeHuman's
 * own, recoloured piece by piece or painted afresh; hat: a hat made here.
 */
export const OUTFITS = [
  {
    id: "sport",
    zh: "运动",
    en: "Sporty",
    style: "sport",
    hair: ["ponytail01", "#2b1d16"],
    shoes: null,
    garments: (L, prep) => [
      { name: "Top", region: sportsBra(L, prep), cloth: solid("#e86aa8", { grain: 0.003 }), offset: 0.0035, rough: 0.75, drape: 14 },
      { name: "Leggings", region: legs(L, { waist: L.bone("Spine")[1] - 0.012, low: 0.085 }), cloth: solid("#2a2433", { grain: 0.003 }), offset: 0.0025, rough: 0.82, drape: 6 },
      { name: "Shoes", region: sneakers(L), cloth: soled(solid("#f7f5f2", { grain: 0.0015, vary: 0.08 }), "#e9e6e1"), offset: 0.011, rough: 0.7, kind: "shoes", hull: 220 },
    ],
    lift: 0.011,
  },
  {
    id: "casual",
    zh: "休闲",
    en: "Casual",
    style: "sport",
    hair: ["long01", "#3a2418"],
    shoes: null,
    garments: (L) => [{ name: "Shoes", region: sneakers(L), cloth: soled(solid("#2d4a8a", { grain: 0.0015, vary: 0.1 })), offset: 0.011, rough: 0.75, kind: "shoes", hull: 220 }],
    lift: 0.011,
    clothes: [
      {
        file: "clothes/female_casualsuit01/female_casualsuit01.mhclo",
        name: "Suit",
        pieces: [
          { test: (x, y) => y < 0.43 || (x > 0.72 && y > 0.55), color: "#f3eee8", contrast: 0.45 },
          { test: () => true, color: null },
        ],
        clean: (t) => copyDisc(t, [581, 467], [1608, 467], 192, 12),
      },
    ],
  },
  {
    id: "bikini_red",
    zh: "红色比基尼",
    en: "Red bikini",
    style: "bikini",
    hair: ["long01", "#1f1512"],
    shoes: null,
    garments: (L, prep) => [
      ...((t) => [
        { name: "Top", region: t.cups, cloth: solid("#c8102e", { grain: 0.002 }), offset: 0.003, rough: 0.45, drape: 10 },
        { name: "Ties", region: t.strings, cloth: solid("#c8102e", { grain: 0.002 }), offset: 0.0025, rough: 0.45 },
      ])(triangleTop(L, prep)),
      { name: "Bottom", region: bikiniBottom(L, prep, { high: 0.02 }), cloth: solid("#c8102e", { grain: 0.002 }), offset: 0.003, rough: 0.45 },
    ],
  },
  {
    id: "bikini_tropic",
    zh: "热带花比基尼",
    en: "Tropical bikini",
    style: "bikini",
    hair: ["ponytail01", "#3a2418"],
    shoes: null,
    garments: (L, prep) => {
      const print = flowers({ ground: "#13a3a8", petal: "#fff4ec", center: "#f2b33d", leaf: "#0d6e5a", size: 0.045 });
      const b = L.bust.L;
      const ub = b[1] - 0.07;
      return [
        { name: "Top", region: R.and(R.on(TORSO), topEdge(L, b[1] + 0.045, ub + 0.04, { dip: 0.015 }), R.above(ub)), cloth: print, offset: 0.003, rough: 0.55, drape: 14 },
        { name: "Bottom", region: R.or(bikiniBottom(L, prep, { top: 0.045, back: 0.12, tie: 0.016, high: 0.035 })), cloth: print, offset: 0.003, rough: 0.55 },
      ];
    },
  },
  {
    id: "swim_black",
    zh: "黑色连体泳衣",
    en: "Black swimsuit",
    style: "bikini",
    hair: ["long01", "#18100d"],
    shoes: null,
    garments: (L, prep) => {
      const b = L.bust.L;
      const ub = b[1] - 0.08;
      // a deep V to under the bust, a halter round the neck, the back bare to the waist
      const plunge = (q) => (q.p[2] > 0.03 ? q.p[1] - (ub - 0.01 + 2.6 * Math.abs(q.p[0])) : -1);
      const backLow = (q) => (q.p[2] < 0.0 ? q.p[1] - (L.bone("Spine")[1] + 0.02 + 1.2 * Math.max(0, Math.abs(q.p[0]) - 0.09)) : -1);
      const halter = R.or(
        string(L, prep, [[[0.075, b[1] + 0.1], "front"], [[0.055, L.bone("Neck")[1] + 0.01, 0], "left"], [[0, L.bone("Neck")[1] + 0.02], "back"], [[-0.055, L.bone("Neck")[1] + 0.01, 0], "right"], [[-0.075, b[1] + 0.1], "front"]], 0.02),
      );
      const suit = R.and(R.on([...TORSO, "LeftUpLeg", "RightUpLeg"]), legCut(L, { high: 0.075, cheek: 0.05 }), plunge, backLow, R.below(b[1] + 0.1));
      return [{ name: "Suit", region: R.smooth(0.006, suit, halter), cloth: solid("#141216", { grain: 0.002 }), offset: 0.003, rough: 0.4, drape: 12 }];
    },
  },
  {
    id: "club_sequin",
    zh: "亮片连体衣",
    en: "Sequin bodysuit",
    style: "club",
    hair: ["long01", "#241410"],
    shoes: null,
    garments: (L) => {
      const b = L.bust.L;
      return [
        { name: "Suit", region: bodysuit(L, { front: b[1] + 0.05, back: b[1] - 0.02, high: 0.06, cheek: 0.04 }), cloth: sequins("#d9a48c", { size: 0.008, gap: "#7a5446" }), offset: 0.0035, orm: true, drape: 14 },
        { name: "Tights", region: R.and(R.on([...LEGS, "Hips", "LeftFoot", "RightFoot", "LeftToeBase", "RightToeBase"]), R.below(L.bone("Hips")[1])), cloth: sheer("#120d10", 0.55), offset: 0.0018, blend: true, rough: 0.6 },
        { name: "Shoes", region: pumps(L), cloth: satin("#0e0b0d"), offset: 0.006, rough: 0.25, kind: "shoes", hull: 60 },
      ];
    },
    lift: 0.005,
  },
  {
    id: "club_leather",
    zh: "皮短裤露脐装",
    en: "Leather and boots",
    style: "club",
    hair: ["long01", "#3b1a17"],
    shoes: null,
    garments: (L) => {
      const b = L.bust.L;
      const ub = b[1] - 0.08;
      return [
        { name: "Top", region: R.and(R.on(TORSO), topEdge(L, b[1] + 0.05, ub + 0.06, { dip: 0.01 }), R.above(ub - 0.025)), cloth: satin("#c0c4cc", { vary: 0.2 }), offset: 0.003, rough: 0.3, metal: 0.7, drape: 14 },
        { name: "Shorts", region: shorts(L, { waist: L.bone("Spine")[1] - 0.005, low: 0.03 }), cloth: solid("#0f0d0e", { grain: 0.002, vary: 0.1 }), offset: 0.0035, rough: 0.28, drape: 6 },
        { name: "Boots", region: boots(L.bone("LeftLeg")[1] - 0.04), cloth: solid("#0d0b0c", { grain: 0.002 }), offset: 0.006, rough: 0.22, kind: "shoes", hull: 60 },
      ];
    },
    lift: 0.005,
  },
  {
    id: "elegant_office",
    zh: "白衬衫铅笔裙",
    en: "Blouse and pencil skirt",
    style: "elegant",
    hair: ["ponytail01", "#1a120e"],
    shoes: null,
    garments: (L) => [{ name: "Shoes", region: pumps(L), cloth: satin("#2a1a1a"), offset: 0.006, rough: 0.3, kind: "shoes", hull: 60 }, brief(L, "#141216")],
    clothes: [
      {
        file: "clothes/female_elegantsuit01/female_elegantsuit01.mhclo",
        name: "Suit",
        pieces: [
          { test: (x, y) => y < 0.52 && x < 0.78, color: "#17151a", contrast: 0.6 },
          { test: () => true, color: "#f4f1ec", contrast: 0.35 },
        ],
      },
    ],
    lift: 0.005,
  },
  {
    id: "qipao_red",
    zh: "红色旗袍",
    en: "Red qipao",
    style: "party",
    hair: ["ponytail01", "#120c0a"],
    shoes: null,
    garments: (L) => [
      { name: "Top", region: qipaoTop(L), cloth: flowers({ ground: "#b0101e", petal: "#e9b949", center: "#fff1c4", gold: "#f6d77a", size: 0.06 }), offset: 0.004, rough: 0.35, drape: 10, sheen: 0.4 },
      { name: "Shoes", region: pumps(L), cloth: satin("#b0101e"), offset: 0.006, rough: 0.3, kind: "shoes", hull: 60 },
      brief(L, "#8e0d18"),
    ],
    clothes: [
      {
        ...SKIRT,
        name: "Skirt",
        hide: false,
        paint: (L) => ({
          cloth: flowers({ ground: "#b0101e", petal: "#e9b949", center: "#fff1c4", gold: "#f6d77a", size: 0.06 }),
          rough: 0.35,
          sheen: 0.4,
          // a slit up each side seam (where the skirt faces straight out sideways), to above the knee
          region: (q) => -Math.max((0.988 - Math.abs(q.n[0])) * 0.3, q.p[1] - (L.bone("LeftLeg")[1] + 0.14)),
        }),
      },
    ],
    lift: 0.005,
  },
  {
    id: "qipao_blue",
    zh: "青花旗袍",
    en: "Blue and white qipao",
    style: "elegant",
    hair: ["long01", "#120c0a"],
    shoes: null,
    garments: (L) => [
      { name: "Top", region: qipaoTop(L), cloth: flowers({ ground: "#f2efe8", petal: "#1f4fa0", center: "#0d2a66", leaf: "#3d6fc0", size: 0.05 }), offset: 0.004, rough: 0.4, drape: 10, sheen: 0.3 },
      { name: "Shoes", region: pumps(L), cloth: satin("#f2efe8"), offset: 0.006, rough: 0.35, kind: "shoes", hull: 60 },
      brief(L, "#1f4fa0"),
    ],
    clothes: [
      {
        ...SKIRT,
        name: "Skirt",
        hide: false,
        paint: () => ({ cloth: flowers({ ground: "#f2efe8", petal: "#1f4fa0", center: "#0d2a66", leaf: "#3d6fc0", size: 0.05 }), rough: 0.4, sheen: 0.3 }),
      },
    ],
    lift: 0.005,
  },
  {
    id: "santa",
    zh: "圣诞女郎",
    en: "Santa",
    style: "party",
    hair: ["long01", "#3b2216"],
    shoes: null,
    hat: "santa",
    garments: (L) => {
      const b = L.bust.L;
      const suit = bodysuit(L, { front: b[1] + 0.05, back: b[1] - 0.01, high: 0.02, cheek: 0.0 });
      const bootTop = L.bone("LeftLeg")[1] - 0.03;
      return [
        { name: "Suit", region: suit, cloth: velvet("#b3121f"), offset: 0.0035, rough: 0.8, drape: 14, sheen: 0.9, kind: "velvet" },
        { name: "Trim", region: trim(suit, 0.022), cloth: fur(), offset: 0.008, rough: 0.95, sheen: 0.6 },
        { name: "Boots", region: boots(bootTop), cloth: solid("#0d0b0c", { grain: 0.002 }), offset: 0.006, rough: 0.25, kind: "shoes", hull: 60 },
        { name: "BootTrim", region: R.and(boots(bootTop), R.above(bootTop - 0.035)), cloth: fur(), offset: 0.01, rough: 0.95 },
      ];
    },
    lift: 0.005,
  },
];

/** a disc of a texture covered with cloth copied from elsewhere on it (a logo taken off): from, to, r, soft (texels) */
function copyDisc(t, from, to, r, soft) {
  for (let y = to[1] - r; y <= to[1] + r; y++)
    for (let x = to[0] - r; x <= to[0] + r; x++) {
      const a = Math.min(1, Math.max(0, (r - Math.hypot(x - to[0], y - to[1])) / soft));
      if (!a) continue;
      const s = ((y - to[1] + from[1]) * t.w + (x - to[0] + from[0])) * 4;
      const d = (y * t.w + x) * 4;
      for (let c = 0; c < 3; c++) t.data[d + c] = Math.round(t.data[s + c] * a + t.data[d + c] * (1 - a));
    }
}

export const STYLES = { sport: "休闲运动", bikini: "比基尼", club: "夜店性感", elegant: "优雅保守", party: "节日主题" };
