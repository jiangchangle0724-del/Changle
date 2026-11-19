// The people beside the place (2026-11-19, the big upgrade's moves): a few bodies outside where the
// crowd can go, each holding one of the extra moves for good. Two leaning on the seawall's railing,
// looking at the sea; two holding lanterns out at the front corners of the courtyard's stage; two
// eating at the night market's tables. They're not in the game: no rules move them, nobody can reach
// them, and they're the same on every screen. The floor art lays their shadows (floorArt.ts).
import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import type { ArenaId } from "../../engine";
import type { Mood, PeopleKit, Person } from "../people";

export interface Extra {
  /** where they stand (scene units: outside the crowd's floor), the way they face (yaw: they look along sin, cos) */
  x: number;
  z: number;
  facing: number;
  /** the move they hold, and which look they wear (a crowd body's look, past the crowd's own indexes) */
  move: "rail" | "lantern" | "eat";
  look: number;
  /** a paper lantern in the hand that holds it out */
  lantern?: "hand_l" | "hand_r";
}

export const EXTRAS: Record<ArenaId, readonly Extra[]> = {
  // (the seawall's path runs along the railing: they lean on it with their backs to the crowd)
  plaza: [
    { x: -3.4, z: -6.95, facing: Math.PI, move: "rail", look: 31 },
    { x: 5.3, z: -6.95, facing: Math.PI, move: "rail", look: 40 }
  ],
  metro: [],
  // (the stage's front is at -5.25: they stand before its corners, facing the crowd)
  gallery: [
    { x: -6.9, z: -4.75, facing: 0.25, move: "lantern", look: 28, lantern: "hand_r" },
    { x: 6.9, z: -4.75, facing: -0.25, move: "lantern", look: 34, lantern: "hand_r" }
  ],
  // (beside the tables at the lot's sides, turned to them)
  market: [
    { x: -9.45, z: -1.9, facing: -Math.PI / 2, move: "eat", look: 29 },
    { x: 9.5, z: 1.45, facing: Math.PI / 2, move: "eat", look: 38 }
  ]
};

export interface ExtrasColors {
  /** the lantern's paper, its gold caps, and its glow */
  paper: string;
  gold: string;
  glow: string;
}

export interface Extras {
  /** one frame: `moodAt` says what's around each (fireworks overhead: they look up too) */
  update(dt: number, now: number, moodAt: (x: number, z: number) => Mood, reduced: boolean): void;
  dispose(): void;
}

/** A paper lantern on a short cord, hanging from the hand (in the hand bone's frame, in metres): two draws. */
function lantern(colors: ExtrasColors): { group: THREE.Group; dispose: () => void } {
  // (lit from inside: its paper glows warm)
  const paper = new THREE.MeshStandardMaterial({ color: colors.paper, emissive: colors.glow, emissiveIntensity: 0.4, roughness: 0.7 });
  const gold = new THREE.MeshStandardMaterial({ color: colors.gold, roughness: 0.4, metalness: 0.3 });
  const body = new THREE.SphereGeometry(0.15, 14, 10);
  body.scale(1, 0.85, 1);
  // (the hand bone's +y runs out along the fingers: the lantern hangs past them)
  body.translate(0, 0.32, 0);
  const parts = [new THREE.CylinderGeometry(0.005, 0.005, 0.12, 4).translate(0, 0.12, 0), new THREE.CylinderGeometry(0.065, 0.065, 0.03, 12).translate(0, 0.19, 0), new THREE.CylinderGeometry(0.065, 0.065, 0.03, 12).translate(0, 0.445, 0)];
  const fittings = mergeGeometries(parts, false)!;
  for (const part of parts) part.dispose();
  const group = new THREE.Group();
  group.add(new THREE.Mesh(body, paper), new THREE.Mesh(fittings, gold));
  return {
    group,
    dispose() {
      for (const item of [paper, gold, body, fittings]) item.dispose();
    }
  };
}

export function addExtras(scene: THREE.Scene, arena: ArenaId, kit: PeopleKit, colors: ExtrasColors): Extras {
  const people: Person[] = [];
  const props: Array<{ dispose: () => void }> = [];
  for (const extra of EXTRAS[arena]) {
    const person = kit.spawn(extra.look);
    if (!person.hold(extra.move)) {
      person.dispose();
      continue;
    }
    person.root.position.set(extra.x, 0, extra.z);
    person.root.rotation.set(0, extra.facing, 0);
    if (extra.lantern) {
      const hand = person.root.getObjectByName(extra.lantern);
      if (hand) {
        const made = lantern(colors);
        hand.add(made.group);
        props.push(made);
      }
    }
    scene.add(person.root);
    people.push(person);
  }
  return {
    update(dt, now, moodAt, reduced) {
      for (const person of people) person.update(dt, now, 0, "idle", "over", moodAt(person.root.position.x, person.root.position.z), reduced);
    },
    dispose() {
      for (const person of people) {
        scene.remove(person.root);
        person.dispose();
      }
      for (const prop of props) prop.dispose();
    }
  };
}
