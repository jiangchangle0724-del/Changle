/**
 * 打碟 · DJ Booth: the beginner deck's words, in both languages, for the phones and the big screen.
 */
import { AudioWaveform, Disc2, Megaphone, OctagonPause, Repeat2, Rewind, Siren, Zap, type LucideIcon } from "lucide-react";
import type { T } from "../../../i18n";
import type { Hint } from "../../../shared/dj/deck";
import type { DeckSide, PadId } from "../../../shared/dj/types";

const t = (zh: string, en: string): T => ({ zh, en });

export const PADS: Record<PadId, { name: T; icon: LucideIcon; what: T }> = {
  echo: { name: t("回声", "Echo"), icon: Repeat2, what: t("一小节的回声", "A bar of echo") },
  sweep: { name: t("扫频", "Sweep"), icon: AudioWaveform, what: t("闷下去再亮起来", "Muffled, then open again") },
  horn: { name: t("喇叭", "Horn"), icon: Megaphone, what: t("嘟嘟嘟", "Air horn") },
  brake: { name: t("刹车", "Brake"), icon: OctagonPause, what: t("音乐停一下，下一小节回来", "The music stops, back on the next bar") },
  siren: { name: t("警笛", "Siren"), icon: Siren, what: t("两拍的警笛声", "Two beats of siren") },
  laser: { name: t("激光", "Laser"), icon: Zap, what: t("啾啾啾三下", "Three laser zaps") },
  scratch: { name: t("搓碟", "Scratch"), icon: Disc2, what: t("把音乐来回搓一拍", "Scratches the music for a beat") },
  rewind: { name: t("倒带", "Rewind"), icon: Rewind, what: t("音乐往回倒，下一小节接回来", "The music spins back, back on the next bar") },
};

/** What a beginner could do now, for the hint line (`side`: the deck off the air). */
export function hintText(h: Hint, side: DeckSide, zh: boolean): string {
  const deck = side.toUpperCase();
  switch (h) {
    case "countdown":
      return zh ? "跟着倒数，到 DROP 那一下按" : "Follow the count and press on DROP";
    case "charging":
      return zh ? "一起狂点蓄力，满了就能 Drop" : "Everyone tap Build up. Full means drop";
    case "charge":
      return zh ? `蓄满力再 Drop，直接换到 ${deck} 那首` : `Build up, then drop straight into deck ${deck}`;
    case "fade":
      return zh ? `也可以慢慢把推子推向 ${deck}` : `Or slide the crossfader over to ${deck}`;
    case "loading":
      return zh ? `${deck} 碟正在准备下一首，几秒钟` : `Deck ${deck} is getting the next one ready. A few seconds`;
    case "pick":
      return zh ? "在下面选下一首放什么" : "Pick what plays next, below";
    case "pads":
      return zh ? "试试效果键：警笛、搓碟、倒带……" : "Try the pads: siren, scratch, rewind and more";
    case "dropped":
      return zh ? "Drop 了" : "Dropped";
  }
}

export const DROP_WORDS = {
  perfect: t("完美", "Perfect"),
  good: t("好", "Good"),
  early: t("还没到，看倒数", "Not yet. Watch the count"),
  late: t("晚了一点", "A bit late"),
};
