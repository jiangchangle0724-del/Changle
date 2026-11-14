import { Annoyed, Disc3, Flame, Laugh, Mic, Music, ThumbsDown, TriangleAlert, Zap, type LucideIcon } from "lucide-react";
import type { SfxCat } from "../../../shared/dj/sfx";

/** A sound board category's icon (its colour is the CSS's `--sfx-<id>`). */
export const SFX_ICON: Record<SfxCat, LucideIcon> = {
  dj: Disc3,
  mc: Mic,
  hype: Flame,
  funny: Laugh,
  shock: Zap,
  fail: ThumbsDown,
  taunt: Annoyed,
  songs: Music,
  rude: TriangleAlert,
};
