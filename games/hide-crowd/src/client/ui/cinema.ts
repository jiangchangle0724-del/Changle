// The camera's two big moves, as the big games make them, and the confetti: a round opens on a low
// shot across the place that swings up into the game's view (2.4 s), and once a round is over and the
// last blow has landed in slow motion, the camera comes down to the winner, dancing, while confetti
// bursts over them. With reduced motion the camera stays where it is and no confetti falls.
import * as THREE from "three";
import { CLOSE_AFTER_MS, CLOSE_MS } from "./useLanded";

/** how long the opening shot takes to settle into the game's view */
export const INTRO_MS = 2_400;

const CONFETTI = 220;

export interface Cinema {
  /**
   * Where the camera is and looks this frame: the game's view (`eye`, `look`), or a move away from it.
   * Writes into `outEye` and `outLook`.
   */
  shot: (time: number, eye: THREE.Vector3, look: THREE.Vector3, reduced: boolean, outEye: THREE.Vector3, outLook: THREE.Vector3) => void;
  /** the round is over (every frame from then on): where the winner stands, or null (a draw) */
  ending: (time: number, winner: { x: number; z: number } | null, reduced: boolean) => void;
  /** the confetti flies, flutters and falls */
  update: (time: number, delta: number) => void;
  /** the next round on the same arena (the arena stays up between rounds): the opening shot again */
  restart: () => void;
  dispose: () => void;
}

const ease = (value: number) => {
  const t = Math.min(1, Math.max(0, value));
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};

/** `intro`: the round has just begun on this screen (a phone that joins mid-round gets no opening shot) */
export function addCinema(scene: THREE.Scene, colors: readonly string[], intro: boolean): Cinema {
  let introAt: number | null = intro ? null : -Infinity;
  let endedAt: number | null = null;
  const winnerAt = new THREE.Vector3();
  let hasWinner = false;
  let burstDone = false;

  // the confetti: little cards in the room's colours
  const geometry = new THREE.PlaneGeometry(0.16, 0.09);
  const material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide, toneMapped: false });
  const pieces = new THREE.InstancedMesh(geometry, material, CONFETTI);
  pieces.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  pieces.count = 0;
  pieces.frustumCulled = false;
  scene.add(pieces);
  const palette = colors.map((value) => new THREE.Color(value));
  interface Piece { x: number; y: number; z: number; vx: number; vy: number; vz: number; spin: THREE.Vector3; turn: number; rate: number; born: number; life: number; color: THREE.Color }
  const flying: Piece[] = [];
  const dummy = new THREE.Object3D();
  const burst = (time: number) => {
    // (from just over the winner's head, out and only a little up: the close camera sees it rain down)
    for (let index = 0; index < CONFETTI; index++) {
      const angle = Math.random() * Math.PI * 2;
      const out = 1.2 + Math.random() * 2.6;
      flying.push({
        x: winnerAt.x + Math.cos(angle) * 0.3,
        y: 2.7 + Math.random() * 0.5,
        z: winnerAt.z + Math.sin(angle) * 0.3,
        vx: Math.cos(angle) * out,
        vy: 0.8 + Math.random() * 1.8,
        vz: Math.sin(angle) * out,
        spin: new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize(),
        turn: Math.random() * Math.PI * 2,
        rate: 5 + Math.random() * 9,
        born: time,
        life: 3_000 + Math.random() * 1_400,
        color: palette[index % palette.length]
      });
    }
  };

  // the opening shot: from low across the place, looking at its far side, swinging up into the game's view
  const offset = new THREE.Vector3();
  const startLook = new THREE.Vector3();
  const closeEye = new THREE.Vector3();
  const closeLook = new THREE.Vector3();
  return {
    shot(time, eye, look, reduced, outEye, outLook) {
      outEye.copy(eye);
      outLook.copy(look);
      if (reduced) return;
      if (introAt === null) introAt = time;
      const k = ease((time - introAt) / INTRO_MS);
      if (k < 1) {
        offset.subVectors(eye, look);
        const distance = offset.length();
        const pitch = Math.asin(offset.y / distance);
        const yaw = Math.atan2(offset.x, offset.z);
        const r = distance * (1.22 - 0.22 * k);
        const p = THREE.MathUtils.lerp(THREE.MathUtils.degToRad(20), pitch, k);
        const y = THREE.MathUtils.lerp(-0.62, yaw, k);
        startLook.set(look.x, look.y + 1.5, look.z - 3.4);
        outLook.lerpVectors(startLook, look, k);
        outEye.set(outLook.x + Math.sin(y) * Math.cos(p) * r, outLook.y + Math.sin(p) * r, outLook.z + Math.cos(y) * Math.cos(p) * r);
        return;
      }
      if (endedAt === null || !hasWinner) return;
      // the winner: down to them, a little to the side, and a slow drift round while they dance
      const since = time - endedAt - CLOSE_AFTER_MS;
      if (since <= 0) return;
      const c = ease(since / CLOSE_MS);
      const drift = Math.max(0, since - CLOSE_MS) / 1000;
      const around = 0.18 + drift * 0.05;
      closeLook.set(winnerAt.x, 1.15, winnerAt.z);
      const distance = 10.5;
      const pitch = THREE.MathUtils.degToRad(36);
      closeEye.set(closeLook.x + Math.sin(around) * Math.cos(pitch) * distance, closeLook.y + Math.sin(pitch) * distance, closeLook.z + Math.cos(around) * Math.cos(pitch) * distance);
      outEye.lerpVectors(eye, closeEye, c);
      outLook.lerpVectors(look, closeLook, c);
    },
    ending(time, winner, reduced) {
      if (endedAt === null) endedAt = time;
      hasWinner = winner !== null;
      if (winner) winnerAt.set(winner.x, 0, winner.z);
      if (!burstDone && hasWinner && !reduced && time - endedAt >= CLOSE_AFTER_MS + CLOSE_MS * 0.55) {
        burstDone = true;
        burst(time);
      }
    },
    restart() {
      introAt = null;
      endedAt = null;
      hasWinner = false;
      burstDone = false;
      flying.length = 0;
      pieces.count = 0;
    },
    update(time, delta) {
      if (!flying.length) return;
      const step = delta / 1000;
      let live = 0;
      for (const piece of flying) {
        const age = time - piece.born;
        if (age >= piece.life) continue;
        // paper: falls slowly, sways, and the air soon takes its speed
        piece.vy = Math.max(-0.9, piece.vy - 4.5 * step);
        const drag = Math.max(0, 1 - step * 2.4);
        piece.vx *= drag;
        piece.vz *= drag;
        piece.x += (piece.vx + Math.sin(age * 0.004 + piece.rate) * 0.5) * step;
        piece.y = Math.max(0.02, piece.y + piece.vy * step);
        piece.z += piece.vz * step;
        piece.turn += piece.rate * step;
        const size = age > piece.life - 500 ? (piece.life - age) / 500 : 1;
        dummy.position.set(piece.x, piece.y, piece.z);
        dummy.quaternion.setFromAxisAngle(piece.spin, piece.turn);
        dummy.scale.setScalar(size);
        dummy.updateMatrix();
        pieces.setMatrixAt(live, dummy.matrix);
        pieces.setColorAt(live, piece.color);
        flying[live++] = piece;
      }
      flying.length = live;
      pieces.count = live;
      pieces.instanceMatrix.needsUpdate = true;
      if (pieces.instanceColor) pieces.instanceColor.needsUpdate = true;
    },
    dispose() {
      geometry.dispose();
      material.dispose();
    }
  };
}
