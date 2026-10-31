// A look drawn as one SVG: the whole figure standing on its shadow ("full"), or the head and
// shoulders for a round avatar ("head"). Plain string building with no DOM, so the same code draws
// in the browser and in the Worker that keeps everyone's avatar.
import { body, CX, GROUND, ground, neck } from "./body";
import { CLOTH, EYE_COLORS, HAIR_COLORS, SKINS, type AvatarCfg } from "./cfg";
import { g, light, mix, p } from "./draw";
import { hairBehind, hairFront, type HairCol } from "./hair";
import { beard, brows, ears, eyes, face, faceGeom, headDefs, headPath, mouth, nose, skinColors } from "./head";
import { outfit } from "./outfits";
import { earrings, glasses, hat, hijabBack, hijabFront } from "./wear";

export type View = "full" | "head" | "face";
export type Box = { x: number; y: number; w: number; h: number };

export type RenderOpts = {
  view?: View;
  /** Prefix for the SVG's ids (gradients, clips): needed when several avatars share a page. */
  id?: string;
  /** Blink and breathe (the maker's preview); still with reduced motion. */
  live?: boolean;
  /** Width and height attributes (the viewBox stays). */
  size?: number;
  /** A frame of its own instead of the view's (the maker's close-ups). */
  box?: Box;
  /** Read out by screen readers; without one the picture is decoration. */
  label?: string;
  /** Stand on the bottom of a taller space instead of floating in its middle. */
  anchor?: "bottom";
};

/** The full view's frame: room for a tall figure in a cowboy hat, so every figure stands on the
 * same ground at the same scale and a taller one looks taller. */
export const FULL_BOX = { x: 0, y: -28, w: 240, h: 368 };

/** The whole figure, framed close (3 by 4): for pictures of clothes. */
export function figBox(c: AvatarCfg): Box {
  const b = body(c);
  const top = b.headY - 76;
  const h = GROUND + 9 - top;
  const w = h * 0.75;
  return { x: CX - w / 2, y: top, w, h };
}

export function headBox(c: AvatarCfg): Box {
  const b = body(c);
  // (a tall hat or big hair takes the frame up a little, so its top isn't cut off)
  const lift = ["cowboy", "beanie", "straw", "turban"].includes(c.hat) || (c.hat === "none" && (c.hair === "afro" || c.hair === "bun")) ? 8 : 0;
  return { x: CX - 92, y: b.headY - 96 - lift, w: 184, h: 184 };
}

/** Close on the face, brows to chin: for picking eyes, a mouth, glasses. */
export function faceBox(c: AvatarCfg): Box {
  const b = body(c);
  return { x: CX - 58, y: b.headY - 22, w: 116, h: 116 };
}

function boxFor(c: AvatarCfg, view: View): Box {
  return view === "full" ? FULL_BOX : view === "head" ? headBox(c) : faceBox(c);
}

export function renderAvatar(c: AvatarCfg, o: RenderOpts = {}): string {
  const view = o.view ?? "full";
  const id = o.id ?? "av";
  const b = body(c);
  const f = faceGeom(c);
  const [sk, skSh, skLn] = SKINS[c.skin];
  const s = skinColors(sk, skSh, skLn, light(sk));
  const [hb, hs, hsh, hl] = HAIR_COLORS[c.hairColor];
  const hair: HairCol = { base: hb, shade: hs, shine: hsh, line: hl };
  const iris = EYE_COLORS[c.eyeColor];
  const cloth = CLOTH[c.outfitColor];
  const hatCol = CLOTH[c.hatColor];
  const covered = c.hat === "hijab" || c.hat === "turban";
  const hatOn = c.hat !== "none" && c.hat !== "ears" && c.hat !== "flowers";
  const lineCol = mix(hl, "#1b1024", 0.35);
  const browCol = light(hb) > 0.7 ? mix(hb, hl, 0.7) : mix(hb, hl, 0.45);
  const H = (inner: string) => g(inner, { transform: `translate(${p(CX, b.headY).replace(",", " ")})` });

  const behind = covered ? { body: "", head: "" } : hairBehind(c, hair, hatOn);
  const front = covered ? { front: "", shadow: "" } : hairFront(c, hair, f, c.hat, id);

  const defs = `<defs>${headDefs(id, iris, s)}<clipPath id="${id}-head"><path d="${headPath(f)}"/></clipPath></defs>`;
  const floor = view === "full" ? ground(b) : "";
  let out = "";
  // behind everything: long hair, a ponytail, twin tails, a hijab's back
  out += H(behind.body);
  if (c.hat === "hijab") out += H(hijabBack(hatCol));
  // the body and what it wears
  out += neck(b, s.base, s.shade, s.line);
  out += g(outfit(c, b, s, cloth, id), { class: "bd" });
  // the head
  let head = behind.head;
  if (c.hat !== "hijab") head += ears(s) + earrings(c);
  head += face(c, s, f, id);
  if (front.shadow) head += g(`<path d="${front.shadow}" fill="${s.shade}" opacity=".75"/>`, { "clip-path": `url(#${id}-head)` });
  head += g(eyes(c, id, iris, lineCol), { class: "ey" });
  head += nose(s) + mouth(c, s) + beard(c, f, hair);
  if (c.hat === "hijab") head += hijabFront(hatCol, f);
  head += brows(c, browCol);
  head += glasses(c);
  head += front.front;
  head += hat(c, hatCol);
  out += H(head);

  const box = o.box ?? boxFor(c, view);
  const size = o.size ? ` width="${o.size}" height="${Math.round((o.size * box.h) / box.w)}"` : "";
  // (a style in an inline SVG reaches the whole page, so it only names this picture's parts)
  const style = o.live ? `<style>${live(id)}</style>` : "";
  const fig = defs + floor + (o.live ? `<g class="fig">${out}</g>` : out);
  const a11y = o.label ? ` role="img" aria-label="${o.label.replace(/[<>&"]/g, "")}"` : ` aria-hidden="true"`;
  const fit = o.anchor === "bottom" ? ` preserveAspectRatio="xMidYMax meet"` : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" id="${id}" viewBox="${box.x} ${box.y} ${box.w} ${box.h}"${size}${fit}${a11y}>${style}${fig}</svg>`;
}

/** Blinking every few seconds and a slow breath from the feet up, for the maker's preview. */
const live = (id: string) =>
  `#${id} .ey{transform-box:fill-box;transform-origin:50% 60%;animation:av-blink 4.6s infinite}` +
  `#${id} .fig{transform-box:fill-box;transform-origin:50% 100%;animation:av-breath 3.4s ease-in-out infinite}` +
  "@keyframes av-blink{0%,93%,100%{transform:scaleY(1)}95.5%{transform:scaleY(.1)}}" +
  "@keyframes av-breath{0%,100%{transform:scaleY(1)}50%{transform:scaleY(1.009)}}" +
  `@media (prefers-reduced-motion:reduce){#${id} .ey,#${id} .fig{animation:none}}`;
