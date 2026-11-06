/**
 * 一本正经's pictures. All drawn with ChatGPT's image generation (Steve's account, 2026-11-05); the
 * prompts and where each file came from are in art/README.md. They load with the game, never with the
 * home page.
 */
import type { Pack } from "../../data/straightface";
import zi from "./art/packs/zi.webp";
import fangyan from "./art/packs/fangyan.webp";
import chengyu from "./art/packs/chengyu.webp";
import caiming from "./art/packs/caiming.webp";
import xiehouyu from "./art/packs/xiehouyu.webp";
import zhongyao from "./art/packs/zhongyao.webp";
import diming from "./art/packs/diming.webp";
import laowujian from "./art/packs/laowujian.webp";
import wangluo from "./art/packs/wangluo.webp";
import trivia from "./art/packs/trivia.webp";
import vancouver from "./art/packs/vancouver.webp";
import food from "./art/packs/food.webp";
import oddwords from "./art/packs/oddwords.webp";
import idioms from "./art/packs/idioms.webp";
import phobias from "./art/packs/phobias.webp";
import placenames from "./art/packs/placenames.webp";
import slang from "./art/packs/slang.webp";
import all from "./art/packs/all.webp";
import judge from "./art/roles/judge.webp";
import honest from "./art/roles/honest.webp";
import bluffer from "./art/roles/bluffer.webp";
import backdrop from "./art/backdrop.webp";

export const PACK_ART: Record<Pack, string> = {
  zi, fangyan, chengyu, caiming, xiehouyu, zhongyao, diming, laowujian, wangluo,
  trivia, vancouver, food,
  oddwords, idioms, phobias, placenames, slang,
};
/** a hand of cards under a spotlight: every pack at once */
export const ALL_PACKS_ART = all;

/** Only on public screens (the rules, the judge, the reveal): never while someone peeks at their part. */
export const ROLE_ART = { judge, honest, bluffer } as const;

export const BACKDROP = backdrop;
