// The words both pages use for a dance: the stages, the moves, the dances, the awards. Chinese and
// English, in the page's language (common.ts's tr), with the other language beside it where a
// mixed room reads it off the TV.
import type { Difficulty } from "../../../party-base/src/index";
import type { Move, Routine } from "../shared/catalog";
import type { Results } from "../shared/protocol";
import type { Show, Stage } from "../shared/show";
import type { Verdict } from "../shared/taps";
import { getLang, tr } from "./common";

export function stageName(s: Stage): string {
  switch (s) {
    case "warmup":
      return tr("热身", "Warm-up");
    case "watch":
      return tr("看一遍", "Watch");
    case "follow":
      return tr("跟一遍", "Your turn");
    case "countdown":
      return tr("准备", "Get ready");
    case "dance":
      return tr("跳！", "Dance!");
    case "cooldown":
      return tr("收尾", "Cool-down");
  }
}

/** One line under the stage on the TV: what to do now. */
export function stageHint(s: Stage, metronome: boolean): string {
  if (metronome) return s === "countdown" ? tr("要开始了", "Here it comes") : tr("每一拍点一下手机", "Tap your phone on every beat");
  switch (s) {
    case "warmup":
      return tr("跟着拍子慢慢动，活动开", "Move gently with the beat to loosen up");
    case "watch":
      return tr("先看，放慢了", "Watch first, slowed down");
    case "follow":
      return tr("跟着做：手机拿在手里跳，或者每一拍点一下", "Do it with me: dance with your phone in hand, or tap it on every beat");
    case "countdown":
      return tr("要开始了", "Here it comes");
    case "dance":
      return tr("手机拿在手里跳，或者每一拍点一下", "Dance with your phone in hand, or tap it on every beat");
    case "cooldown":
      return tr("慢下来，深呼吸", "Slow down and breathe");
  }
}

export const difficultyName = (d: Difficulty) => (d === "easy" ? tr("简单", "Easy") : d === "medium" ? tr("中等", "Medium") : tr("困难", "Hard"));
export const styleName = (s: Routine["style"]) => (s === "square" ? tr("广场舞", "Plaza dance") : tr("流行", "Pop"));

const zh = () => getLang() === "zh";
export const moveName = (m: Move) => (zh() ? m.name_zh : m.name_en);
/** The move's name in the other language. */
export const moveOther = (m: Move) => (zh() ? m.name_en : m.name_zh);
export const routineName = (r: Routine) => (zh() ? r.name_zh : r.name_en);

export function bodyHint(m: Move): string {
  if (m.body === "arms") return m.seated_ok ? tr("只动手臂，坐着也行", "Arms only, sitting is fine") : tr("只动手臂", "Arms only");
  return m.body === "arms+steps" ? tr("手臂加踏步", "Arms and steps") : tr("全身", "Whole body");
}

export function awardName(k: keyof Results["awards"]): string {
  return k === "steady" ? tr("最稳", "Steadiest") : k === "hype" ? tr("最嗨", "On fire") : tr("最努力", "Hardest worker");
}
export function awardWhy(k: keyof Results["awards"]): string {
  return k === "steady" ? tr("离拍子最近", "closest to the beat") : k === "hype" ? tr("连着踩准最多拍", "the longest run on the beat") : tr("动得最多", "moved on the most beats");
}

/** The phone's big button while nothing is scored: what to do instead. */
export function restHint(s: Stage): string {
  switch (s) {
    case "warmup":
      return tr("跟着大屏慢慢动", "Move gently with the TV");
    case "watch":
      return tr("先看大屏", "Watch the TV first");
    case "countdown":
      return tr("准备好", "Get ready");
    case "cooldown":
      return tr("慢下来，深呼吸", "Slow down and breathe");
    default:
      return verdictText(null);
  }
}

export function verdictText(v: Verdict | null): string {
  if (v === "hit") return tr("踩准了", "On the beat");
  if (v === "close") return tr("差一点", "Almost");
  if (v === "miss") return tr("动起来", "Move it");
  return tr("跟着拍子点", "Tap with the beat");
}

/** "about 5 min" for a whole show: lead, count-in, dance and cool-down. */
export function showMinutes(show: Show): string {
  const ms = show.leadMs + show.countIn * show.beatMs + show.danceMs + show.tailMs;
  const min = Math.max(1, Math.round(ms / 60000));
  return tr(`约 ${min} 分钟`, `about ${min} min`);
}

/** m:ss */
export const clockOf = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** How to do each move, in one line (the coach shows it; this says it). Mirrored like the coach: "right" is your right. */
const HOW: Record<string, [string, string]> = {
  "clap-2x": ["拍手两下，再把双手打开", "Clap twice, then open your hands out"],
  "raise-arms": ["双手往上举，再收回肩膀", "Throw both arms up, then back to your shoulders"],
  "side-wave": ["双手举过头，左右摇摆", "Arms up over your head, wave them side to side"],
  "handkerchief-flower": ["双手在两边转圈，一高一低再换", "Twirl your hands at your sides, one high, one low, then swap"],
  "shoulder-roll": ["双肩往后绕圈，手臂放松", "Roll your shoulders back in circles, arms loose"],
  "forward-push": ["双手往前推，再收回胸前", "Push both hands forward, then pull them back to your chest"],
  "open-arms": ["双臂张开挺胸，再收回胸前", "Open your arms wide, chest up, then bring them in"],
  "alternating-reach": ["右手往上伸，再换左手", "Reach up with your right hand, then your left"],
  "side-step-touch": ["往左跨一步，右脚并过去拍手，再往右", "Step left, bring the right foot in and clap, then go right"],
  "march-clap": ["原地踏步，每两拍拍一下手", "March on the spot, clap every second beat"],
  "cross-step": ["右脚往左前交叉，左脚后退，右脚往右，左脚回来", "Right foot crosses in front, left steps back, right steps out, left comes back"],
  "yangge-twist": ["一前一后踏步扭腰，双手甩起来", "Step forward and back, twist your hips, swing your arms"],
  "heel-tap": ["双手叉腰，脚跟轮流往前点地", "Hands on hips, tap one heel forward, then the other"],
  "v-step": ["右脚左脚往前分开，再一只一只收回，手跟着举", "Right then left foot step out wide, then back in, arms up with them"],
  "step-knee-lift": ["踏一步，另一只膝盖抬起来，手往下碰膝盖", "Step, lift the other knee, bring your hands down to it"],
  "eight-step-sway": ["左右摇摆，前四拍手在头上，后面放低，最后拍手", "Sway side to side: arms up for four, then low, then a clap"],
  "kemusan-hand-twirl": ["双手在身前绕圈，左右换边，脚轻轻踢出去", "Roll your hands round each other, side to side, flick your feet out"],
  "grapevine-turn": ["往右跨，后交叉，再跨一步转一圈拍手，再往左", "Step right, cross behind, step and spin, clap; then back to the left"],
  "squat-reach": ["蹲下双手前伸，站起来双手举高", "Squat with your arms forward, stand up and reach high"],
  "side-lunge-punch": ["往右弓步出拳，回来，再往左", "Lunge right and punch, come back, then the left"],
};

export function moveHow(m: Move): string {
  const h = HOW[m.id];
  return h ? tr(h[0], h[1]) : "";
}
