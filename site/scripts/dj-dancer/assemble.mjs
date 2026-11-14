// One outfit's parts (build.mjs writes them; the previews draw them): its garments made from her
// skin, MakeHuman's clothes, its shoes, its hat; the skin it covers; how far it lifts her.
import { makeGarment } from "./garments.mjs";
import { hatPart } from "./hats.mjs";
import { proxyPart } from "./parts.mjs";

export async function outfitParts(prep, tx, L, o) {
  const parts = [];
  const hide = [];
  for (const def of o.garments?.(L, prep) ?? []) {
    const g = await makeGarment(prep, tx, def);
    parts.push(g.part);
    hide.push(...g.hide);
  }
  for (const c of o.clothes ?? []) {
    const p = await proxyPart(prep, c.file, { name: c.name, weights: "cloth", pieces: c.pieces, only: c.only, paint: c.paint?.(L, prep), clean: c.clean, size: c.size ?? 1024, material: { rough: c.rough ?? 0.8, kind: "cloth" } });
    parts.push(p);
    if (c.hide !== false) hide.push(...p.hide);
  }
  let lift = o.lift ?? 0;
  if (o.shoes) {
    const p = await proxyPart(prep, o.shoes, { name: "Shoes", size: 512, material: { rough: 0.6, kind: "shoes" }, morphs: false });
    parts.push(p);
    hide.push(...p.hide);
    for (let i = 1; i < p.pos.length; i += 3) lift = Math.max(lift, -p.pos[i]);
  }
  if (o.hat) parts.push(...(await hatPart(prep, o.hat, o.hair[0])));
  return { parts, hide, lift };
}
