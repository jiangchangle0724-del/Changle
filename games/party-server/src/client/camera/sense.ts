// The phone's camera: the camera stands a couple of metres away, looking at its player, and the pose
// model (MediaPipe's Pose Landmarker, its lite model, run on this phone) finds their body in every
// frame. The picture never leaves the phone: only the moves made of it do (match.ts). The model and
// its WebAssembly come from changle.ca itself (/party/camera/), loaded the first time the camera is
// turned on.

import { FilesetResolver, PoseLandmarker } from "@mediapipe/tasks-vision";
import { angleOf, playerBody, type Body, type Landmark } from "./body";

/** Where the camera's files are served (scripts/build.mjs puts them there). */
const FILES = "/party/camera";
/** From a frame being taken to the page getting it, when the browser doesn't say (ms) */
const CAPTURE_MS = 50;

export type CamStatus = "off" | "loading" | "denied" | "noCamera" | "failed" | "nobody" | "feet" | "ok";

/** The skeleton drawn on the picture: arms, legs, the back and shoulders and hips (image landmarks). */
const LINES: [number, number, string][] = [
  [11, 13, "arm"],
  [13, 15, "arm"],
  [12, 14, "arm"],
  [14, 16, "arm"],
  [23, 25, "leg"],
  [25, 27, "leg"],
  [24, 26, "leg"],
  [26, 28, "leg"],
  [27, 31, "leg"],
  [28, 32, "leg"],
  [11, 12, "back"],
  [23, 24, "back"],
  [11, 23, "back"],
  [12, 24, "back"],
];
const INK: Record<string, string> = { arm: "#5cf2ff", leg: "#ff5fd2", back: "#ffffff" };

export class CameraSense {
  status: CamStatus = "off";
  facing: "user" | "environment" = "user";
  /** The preview: the camera's picture as a mirror, with the body it sees drawn on it. */
  readonly view: HTMLElement;
  private readonly video: HTMLVideoElement;
  private readonly ink: HTMLCanvasElement;
  private stream: MediaStream | null = null;
  private model: PoseLandmarker | null = null;
  private loop = 0;
  private lastVideoTime = -1;
  /** which of the people seen is this phone's player: where their hips were last (picture, 0 to 1) */
  private mine: { x: number; y: number } | null = null;
  private prev: { body: Body; at: number } | null = null;
  private energy = { v: 0, at: 0 };

  /** `onFrame(local, body)`: a frame taken at this page's time `local` (performance.now()), and the player's body in it (null: not seen). */
  constructor(private readonly onFrame: (local: number, body: Body | null) => void) {
    this.view = document.createElement("div");
    this.view.className = "cam-view";
    this.video = document.createElement("video");
    this.video.muted = true;
    this.video.playsInline = true;
    this.video.setAttribute("playsinline", "");
    this.video.setAttribute("muted", "");
    this.ink = document.createElement("canvas");
    this.view.append(this.video, this.ink);
  }

  get on(): boolean {
    return this.stream !== null || this.status === "loading";
  }

  /** Whether this browser can open a camera at all. */
  static supported(): boolean {
    return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia;
  }

  /** Must run inside a tap (the browser asks for the camera then). True when the camera is on. */
  async start(facing: "user" | "environment" = this.facing): Promise<boolean> {
    this.facing = facing;
    this.status = "loading";
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: facing, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 30 } } });
    } catch (e) {
      this.status = (e as Error)?.name === "NotAllowedError" || (e as Error)?.name === "SecurityError" ? "denied" : "noCamera";
      this.stream = null;
      return false;
    }
    this.video.srcObject = this.stream;
    try {
      await this.video.play();
    } catch {
      // (it plays once the page is tapped again; the frames wait for it)
    }
    if (!this.model) {
      try {
        this.model = await load("GPU");
      } catch {
        try {
          this.model = await load("CPU");
        } catch {
          this.stop();
          this.status = "failed";
          return false;
        }
      }
    }
    if (!this.stream) return false;
    this.status = "nobody";
    // (the front camera shows as a mirror, as a selfie does; the back one as it sees)
    this.view.classList.toggle("is-mirror", facing === "user");
    this.mine = null;
    this.next();
    return true;
  }

  /** The other camera (front or back). */
  async flip(): Promise<boolean> {
    const to = this.facing === "user" ? "environment" : "user";
    this.stopStream();
    return this.start(to);
  }

  stop(): void {
    this.stopStream();
    this.status = "off";
  }

  /** How hard the player is moving now, 0 to 1. */
  level(local = performance.now()): number {
    return this.energy.v * Math.exp(-Math.max(0, local - this.energy.at) / 400);
  }

  /** A frame's landmarks (world, then picture), as the model gives them or the checks make them. */
  take(world: readonly Landmark[] | null, picture: readonly Landmark[] | null, local: number): void {
    const body = world ? playerBody(world) : null;
    if (!body) this.status = "nobody";
    else {
      const feet = (picture ?? world)!;
      const seen = (i: number) => (feet[i]?.visibility ?? 0) > 0.5;
      this.status = seen(27) || seen(28) ? "ok" : "feet";
    }
    if (body && this.prev && local > this.prev.at) {
      let turn = 0;
      for (let k = 0; k < 10; k++) turn += angleOf(body, this.prev.body, k) * Math.min(body.sure[k]!, this.prev.body.sure[k]!);
      const v = 1 - Math.exp(-turn / ((local - this.prev.at) / 1000) / 12);
      this.energy = { v: Math.max(v, this.level(local)), at: local };
    }
    this.prev = body ? { body, at: local } : null;
    this.onFrame(local, body);
  }

  private stopStream() {
    cancelAnimationFrame(this.loop);
    this.loop = 0;
    for (const t of this.stream?.getTracks() ?? []) t.stop();
    this.stream = null;
    this.video.srcObject = null;
    this.prev = null;
  }

  private next() {
    const v = this.video as HTMLVideoElement & { requestVideoFrameCallback?: (cb: (now: number, meta: { captureTime?: number; presentationTime?: number }) => void) => number };
    if (v.requestVideoFrameCallback) v.requestVideoFrameCallback((now, meta) => this.frame(meta.captureTime ?? (meta.presentationTime ?? now) - CAPTURE_MS));
    else this.loop = requestAnimationFrame(() => this.frame(performance.now() - CAPTURE_MS - 30));
  }

  private frame(local: number) {
    if (!this.stream || !this.model) return;
    const v = this.video;
    if (v.readyState >= 2 && v.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = v.currentTime;
      let r: ReturnType<PoseLandmarker["detectForVideo"]> | null = null;
      try {
        r = this.model.detectForVideo(v, performance.now());
      } catch {
        r = null;
      }
      const k = r ? this.pick(r.landmarks) : -1;
      this.draw(k >= 0 ? r!.landmarks[k]! : null);
      this.take(k >= 0 ? r!.worldLandmarks[k]! : null, k >= 0 ? r!.landmarks[k]! : null, local);
    }
    this.next();
  }

  /** Of the people seen, this phone's player: the one nearest where they were, or at first the biggest. */
  private pick(people: Landmark[][]): number {
    let best = -1;
    let bestScore = Infinity;
    people.forEach((lm, i) => {
      const x = (lm[23]!.x + lm[24]!.x) / 2;
      const y = (lm[23]!.y + lm[24]!.y) / 2;
      const size = Math.hypot((lm[11]!.x + lm[12]!.x) / 2 - x, (lm[11]!.y + lm[12]!.y) / 2 - y);
      const score = this.mine ? Math.hypot(x - this.mine.x, y - this.mine.y) : -size;
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    });
    if (best >= 0) {
      const lm = people[best]!;
      this.mine = { x: (lm[23]!.x + lm[24]!.x) / 2, y: (lm[23]!.y + lm[24]!.y) / 2 };
    }
    return best;
  }

  private draw(lm: Landmark[] | null) {
    const c = this.ink;
    const w = this.video.videoWidth || 640;
    const h = this.video.videoHeight || 480;
    if (c.width !== w || c.height !== h) {
      c.width = w;
      c.height = h;
      this.view.style.aspectRatio = `${w} / ${h}`;
    }
    const g = c.getContext("2d");
    if (!g) return;
    g.clearRect(0, 0, w, h);
    if (!lm) return;
    g.lineWidth = Math.max(4, w / 90);
    g.lineCap = "round";
    for (const [a, b, kind] of LINES) {
      const p = lm[a]!;
      const q = lm[b]!;
      if ((p.visibility ?? 1) < 0.4 || (q.visibility ?? 1) < 0.4) continue;
      g.strokeStyle = INK[kind]!;
      g.beginPath();
      g.moveTo(p.x * w, p.y * h);
      g.lineTo(q.x * w, q.y * h);
      g.stroke();
    }
  }
}

async function load(delegate: "GPU" | "CPU"): Promise<PoseLandmarker> {
  const files = await FilesetResolver.forVisionTasks(`${FILES}/wasm`);
  return PoseLandmarker.createFromOptions(files, {
    baseOptions: { modelAssetPath: `${FILES}/pose_landmarker_lite.task`, delegate },
    runningMode: "VIDEO",
    numPoses: 2,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
}
