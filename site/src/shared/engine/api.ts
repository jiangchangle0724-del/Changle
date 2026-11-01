import type { T } from "../../i18n";
import type { Fx, GameAction, GameId, GameView, PenaltyKind, SpinScope } from "../protocol";

/** What a game may do to the room. One instance per call; `now` is fixed for the call. */
export interface Api {
  now: number;
  rand(): number;
  int(n: number): number;
  shuffle<X>(a: X[]): X[];
  /** Seated player ids in seat order. */
  ids(): string[];
  has(pid: string): boolean;
  /** Seated and with the app open right now. */
  online(pid: string): boolean;
  isHost(pid: string): boolean;
  /** The id after `after` in seat order (restricted to `among` when given). */
  next(after: string | null, among?: string[]): string;
  /** The id before `before` in seat order. */
  prev(before: string, among?: string[]): string;
  /** `say`: what to do instead of drinking, when the game names it (push-ups, a dare). */
  penalty(who: string[], kind: PenaltyKind, note?: T, opts?: { buddy?: string; delay?: number; say?: T }): void;
  fx(fx: Fx, pid?: string, data?: number[]): void;
  spin(scope: SpinScope, by: string, index: number, delta: number, duration: number): void;
  /** Set (or replace) a game timer; it fires `timer(key)` on the game. */
  timer(key: string, at: number, data?: unknown): void;
  clear(key: string): void;
  resetStrokes(): void;
}

export interface GameDef<S> {
  id: GameId;
  min: number;
  /** a big screen opening a table for this game starts it straight away (the DJ booth) */
  auto?: boolean;
  init(api: Api): S;
  act(s: S, pid: string, g: GameAction, api: Api): void;
  /** what a big screen showing the table may tell the game (the booth's speaker); seats use `act` */
  screen?(s: S, sid: string, g: GameAction, api: Api): void;
  view(s: S, pid: string, api: Api): GameView;
  timer?(s: S, key: string, data: unknown, api: Api): void;
  join?(s: S, pid: string, api: Api): void;
  leave?(s: S, pid: string, api: Api): void;
  canStroke?(s: S, pid: string): boolean;
}

export const t = (zh: string, en: string): T => ({ zh, en });

export function range(n: number) {
  return Array.from({ length: n }, (_, i) => i);
}

export function clean(text: unknown, max: number) {
  return String(text ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

export function num(v: unknown, lo: number, hi: number): number | null {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.min(hi, Math.max(lo, n));
}

export function intIn(v: unknown, lo: number, hi: number): number | null {
  const n = num(v, lo, hi);
  return n === null ? null : Math.round(n);
}
