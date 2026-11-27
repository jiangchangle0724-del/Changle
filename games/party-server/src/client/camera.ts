// /party/camera.js: the camera mode (as Just Dance 2026's: the phone stands in front of its player and
// its camera watches the whole body). The phone page (join.ts) loads it when its player turns the
// camera on, so the page itself stays small; it sets window.partyCamera.
//
// The camera's frames go to its judge (camera/match.ts) with the room's clock, and the judge tells
// the page's beat judge, beat by beat, when the player danced each beat or that they didn't. From
// there it is as with the motion sensor: the verdicts, the bars sent to the room, the TV's floor.

import type { Difficulty } from "../../../party-base/src/index";
import { spotAt, type RunBeat } from "../shared/show";
import { coachLandmarks, type Landmark } from "./camera/body";
import { CameraJudge, decidedAfter } from "./camera/match";
import { CameraSense, type CamStatus } from "./camera/sense";
import { poseOf, type Doing } from "./coach/moves";
import { BASE } from "./coach/pose";

export interface CameraHooks {
  /** speaker time at this page's time `local` (null: the clock isn't set yet) */
  speakerNow(local: number): number | null;
  /** the beats as the room hears them and the room's difficulty, while a dance plays (else null) */
  heard(): { run: readonly RunBeat[]; difficulty: Difficulty } | null;
  /** beat i of that run was danced at speaker time t, or not (null) */
  decide(i: number, t: number | null): void;
}

/** From a frame being taken to the camera's judge having it (ms): the pose model's time, roughly. */
const LAG_MS = 150;

export class PhoneCamera {
  private readonly sense: CameraSense;
  private readonly judge: CameraJudge;
  private pretending = 0;

  constructor(private readonly hooks: CameraHooks) {
    this.judge = new CameraJudge((i, t) => hooks.decide(i, t));
    this.sense = new CameraSense((local, body) => {
      const t = hooks.speakerNow(local);
      if (t === null) return;
      this.judge.push(t, body);
      const h = hooks.heard();
      if (h) this.judge.decide(h.run, h.difficulty);
    });
  }

  get on(): boolean {
    return this.sense.on || this.pretending !== 0;
  }
  get status(): CamStatus {
    return this.sense.status;
  }
  get facing(): "user" | "environment" {
    return this.sense.facing;
  }
  /** How alike to the coach the player has looked on the last beats, 0 to 1. */
  get alike(): number {
    return this.judge.alike;
  }
  /** The preview (the picture with the body seen drawn on it): the page puts it where it likes. */
  get view(): HTMLElement {
    return this.sense.view;
  }

  start(): Promise<boolean> {
    return this.sense.start();
  }
  flip(): Promise<boolean> {
    return this.sense.flip();
  }
  stop(): void {
    clearInterval(this.pretending);
    this.pretending = 0;
    this.sense.stop();
    this.judge.reset();
  }

  /** How hard the player is moving now, 0 to 1 (their little dancer on the TV). */
  level(local = performance.now()): number {
    return this.sense.level(local);
  }

  /** How long after a beat the page's judge should wait before settling it (ms). */
  lagMs(d: Difficulty, beatMs: number): number {
    return decidedAfter(d, beatMs) + LAG_MS;
  }

  /**
   * (the checks) No camera and no model: a pretend player, 30 frames a second, dancing the coach's
   * moves `lagMs` late, another move all along (`wrong`), or standing still.
   */
  pretend(how: { lagMs?: number; wrong?: string; still?: boolean } = {}): void {
    clearInterval(this.pretending);
    this.sense.status = "nobody";
    this.pretending = window.setInterval(() => {
      const local = performance.now();
      const t = this.hooks.speakerNow(local);
      const h = this.hooks.heard();
      let lm: Landmark[] = coachLandmarks(BASE);
      const spot = t !== null && h ? spotAt(h.run, t - (how.lagMs ?? 0)) : null;
      if (spot && h && !how.still) {
        const b = h.run[spot.i]!;
        const doing: Doing = how.wrong ? { kind: "move", id: how.wrong } : b.move ? { kind: "move", id: b.move.id } : { kind: "clap" };
        lm = coachLandmarks(poseOf(doing, b.move || how.wrong ? b.count - 1 + spot.frac : spot.frac, 0));
      }
      this.sense.take(lm, lm, local);
    }, 33);
  }
}

Object.assign(window, { partyCamera: { PhoneCamera, supported: CameraSense.supported } });
