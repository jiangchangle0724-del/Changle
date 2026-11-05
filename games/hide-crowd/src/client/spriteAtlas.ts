import type { Pose } from "../engine";

export const SPRITE_ARCHETYPES = 3;
export const SPRITE_DIRECTIONS = 4;
export const SPRITE_FRAMES = 4;

export function spriteDirectionRow(yaw: number): number {
  if (!Number.isFinite(yaw)) return 0;
  const turn = Math.PI * 2;
  const angle = ((yaw % turn) + turn) % turn;
  return Math.floor((angle + Math.PI / 4) / (Math.PI / 2)) % SPRITE_DIRECTIONS;
}

export function spritePoseColumn(pose: Pose, gait: number, stridePhase: number): number {
  if (pose === "punch") return 3;
  if (pose === "windup" || pose === "stunned" || gait <= 0.05) return 0;
  return Math.sin(stridePhase) >= 0 ? 1 : 2;
}

export function spriteBatchIndex(archetype: number, direction: number, frame: number): number {
  const safeArchetype = ((Math.trunc(archetype) % SPRITE_ARCHETYPES) + SPRITE_ARCHETYPES) % SPRITE_ARCHETYPES;
  const safeDirection = ((Math.trunc(direction) % SPRITE_DIRECTIONS) + SPRITE_DIRECTIONS) % SPRITE_DIRECTIONS;
  const safeFrame = ((Math.trunc(frame) % SPRITE_FRAMES) + SPRITE_FRAMES) % SPRITE_FRAMES;
  return safeArchetype * SPRITE_DIRECTIONS * SPRITE_FRAMES + safeDirection * SPRITE_FRAMES + safeFrame;
}
