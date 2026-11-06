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
      return tr("跟着做，每一拍点一下手机", "Do it with me: tap your phone on every beat");
    case "countdown":
      return tr("要开始了", "Here it comes");
    case "dance":
      return tr("每一拍点一下手机", "Tap your phone on every beat");
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
