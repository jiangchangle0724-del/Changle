/**
 * 打碟 · DJ Booth: the beginner deck's words, in both languages, for the phones and the big screen.
 */
import { Activity, AudioLines, AudioWaveform, Binary, Bomb, Disc, Disc2, Megaphone, OctagonPause, Repeat2, Rewind, Siren, Undo2, Waves, Wind, Zap, type LucideIcon } from "lucide-react";
import type { T } from "../../../i18n";
import type { Hint } from "../../../shared/dj/deck";
import { MIX_FX, type DeckSide, type MixFx, type MixKnob, type PadId } from "../../../shared/dj/types";

const t = (zh: string, en: string): T => ({ zh, en });

export const PADS: Record<PadId, { name: T; icon: LucideIcon; what: T }> = {
  echo: { name: t("回声", "Echo"), icon: Repeat2, what: t("一小节的回声", "A bar of echo") },
  sweep: { name: t("扫频", "Sweep"), icon: AudioWaveform, what: t("闷下去再亮起来", "Muffled, then open again") },
  horn: { name: t("气笛", "Air horn"), icon: Megaphone, what: t("夜店气笛，嘟嘟嘟", "Air horn blasts") },
  brake: { name: t("刹车", "Brake"), icon: OctagonPause, what: t("音乐停一下，下一小节回来", "The music stops, back on the next bar") },
  siren: { name: t("警笛", "Siren"), icon: Siren, what: t("两拍的警笛声", "Two beats of siren") },
  laser: { name: t("激光", "Laser"), icon: Zap, what: t("啾啾啾三下", "Three laser zaps") },
  scratch: { name: t("搓碟", "Scratch"), icon: Disc2, what: t("把音乐来回搓一拍", "Scratches the music for a beat") },
  rewind: { name: t("倒带", "Rewind"), icon: Rewind, what: t("音乐往回倒，下一小节接回来", "The music spins back, back on the next bar") },
  vinyl: { name: t("黑胶", "Vinyl"), icon: Disc, what: t("两小节老唱片的味道：噼啪声，声音变暗", "Two bars of an old record: crackle, a darker sound") },
  bassdrop: { name: t("低音炸弹", "Bass drop"), icon: Bomb, what: t("一声往下沉的低音轰", "A sub boom diving down") },
  reverse: { name: t("反向镲", "Reverse"), icon: Undo2, what: t("倒放的镲片，两拍涨上去", "A crash played backwards, swelling for two beats") },
  whistle: { name: t("口哨", "Whistle"), icon: Wind, what: t("桑巴口哨，嘀嘀嘀", "A samba whistle") },
};

/** The mixer's knobs (混音台), and what each end of the filter does. */
export const KNOBS: Record<MixKnob, T> = {
  low: t("低音", "Low"),
  mid: t("中音", "Mid"),
  high: t("高音", "High"),
  filter: t("滤波", "Filter"),
};
export const FILTER_ENDS = { dark: t("闷", "Dark"), thin: t("薄", "Thin") };

/** The mixer's effects. */
export const MIX_EFFECTS: Record<MixFx, { name: T; icon: LucideIcon; what: T }> = {
  pump: { name: t("泵感", "Pump"), icon: Activity, what: t("每一拍往下压一下再弹回来", "Ducks on every beat and swells back") },
  gate: { name: t("切片", "Gate"), icon: AudioLines, what: t("按十六分音符切成一段一段", "Chops the music into sixteenths") },
  flange: { name: t("镶边", "Flanger"), icon: Waves, what: t("像飞机飞过的扫频", "A jet plane's sweep") },
  crush: { name: t("低保真", "Lo-fi"), icon: Binary, what: t("8-bit 那种颗粒感", "Gritty, like 8-bit") },
};

/** Someone at the mixer, in a line: "Amy · 泵感 开", "Amy · 混音台复位" (`data`: the effect's index and on, or -1: the reset). */
export function mixSaid(who: string, data: number[] | undefined, zh: boolean): string {
  const [i = -1, on = 0] = data ?? [];
  const f = MIX_FX[i];
  if (!f) return zh ? `${who} · 混音台复位` : `${who} · mixer reset`;
  const name = zh ? MIX_EFFECTS[f].name.zh : MIX_EFFECTS[f].name.en;
  return zh ? `${who} · ${name} ${on ? "开" : "关"}` : `${who} · ${name} ${on ? "on" : "off"}`;
}

/** What a beginner could do now, for the hint line (`side`: the deck off the air). */
export function hintText(h: Hint, side: DeckSide, zh: boolean, local = false): string {
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
    case "ask":
      return zh ? "在下面点歌，点中了下一首就放" : "Ask for a song below. It plays next";
    case "pads":
      return zh ? "试试效果键：警笛、搓碟、倒带……" : "Try the pads: siren, scratch, rewind and more";
    case "dropped":
      return zh ? "Drop 了" : "Dropped";
    case "cold":
      return local
        ? zh
          ? "有点冷场：点一首大家都爱听的"
          : "The floor's dragging: ask for a song everyone loves"
        : zh
          ? "有点冷场：换个风格，蓄力 Drop 过去"
          : "The floor's dragging: pick another style and drop into it";
  }
}

/** A song asked for, named: the artist and title the song list gives, or what its player typed; null when it's hidden from this screen. */
export function songName(r: { text: string | null; artist?: string }, zh: boolean): string | null {
  if (r.text === null) return null;
  if (zh) return `${r.artist ? `${r.artist} ` : ""}《${r.text}》`;
  return r.artist ? `${r.text} (${r.artist})` : `"${r.text}"`;
}

/** "Amy 点的 周杰伦《晴天》", or "Amy 点了一首歌" when the name is hidden here. */
export function reqLine(r: { text: string | null; artist?: string }, who: string, zh: boolean): string {
  const song = songName(r, zh);
  if (zh) return song ? `${who} 点的 ${song}` : `${who} 点了一首歌`;
  return song ? `${who} asked for ${song}` : `${who} asked for a song`;
}

/**
 * What's on the air for whoever asked: "正在放：周杰伦《晴天》，Amy 点的" (the host's own song itself;
 * or `clip`, its clip playing, then the remix), or "正在放：周杰伦《晴天》 Remix，Amy 点的" (the remix alone).
 */
export function nowLine(r: { text: string | null; artist?: string; local?: string }, who: string, zh: boolean, clip = false): string {
  const song = songName(r, zh);
  if (r.local || clip) {
    if (zh) return song ? `正在放：${song}，${who} 点的` : `正在放：${who} 点的歌`;
    return song ? `Now: ${song}, for ${who}` : `Now: ${who}'s song`;
  }
  if (zh) return song ? `正在放：${song} Remix，${who} 点的` : `正在放：${who} 点的歌的 Remix`;
  return song ? `Now: a remix of ${song}, for ${who}` : `Now: a remix of ${who}'s song`;
}

/** Under a song asked for that brings its clip: whose 30 seconds they are, and what comes after. */
export const CLIP_CREDIT = t("原曲片段来自 Apple Music，之后接 DJ 的 Remix", "Clip courtesy of Apple Music, then the DJ's remix");

/**
 * 点歌模式's line under the floor (no build-up, no DROP): what happens next. `song`: one plays on
 * the TV now; `up`: one's next; `paused`: someone pressed 暂停 on a phone.
 */
export function jukeText(song: boolean, up: boolean, zh: boolean, paused = false): string {
  if (paused) return zh ? "暂停了：手机上点「播放」接着放" : "Paused. Press Play on a phone to carry on";
  if (song) return zh ? "放完马上接下一首。手机上可以暂停、切歌、上一曲" : "The next song follows right after. Pause, skip or go back from any phone";
  if (up) return zh ? "下一首几秒后开始" : "The next song starts in a moment";
  return zh ? "在手机上点歌，一首接一首放" : "Ask for songs on your phone: they play one after another";
}
