import * as THREE from "three";
import type { ArenaId } from "../../engine";

interface LandmarkPalette {
  sky: string;
  land: string;
  foliage: string;
  surface: string;
  surface2: string;
  muted: string;
  ink: string;
  line: string;
  accent: string;
  warn: string;
  danger: string;
}

type Box = readonly [x: number, y: number, z: number, width: number, height: number, depth: number];

function material(color: string, token: string, roughness = 0.86): THREE.MeshStandardMaterial {
  const result = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0.02 });
  result.userData.paletteToken = token;
  return result;
}

function instancedBoxes(scene: THREE.Scene, boxes: readonly Box[], surface: THREE.Material): void {
  if (boxes.length === 0) return;
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), surface, boxes.length);
  const dummy = new THREE.Object3D();
  boxes.forEach(([x, y, z, width, height, depth], index) => {
    dummy.position.set(x, y, z);
    dummy.scale.set(width, height, depth);
    dummy.updateMatrix();
    mesh.setMatrixAt(index, dummy.matrix);
  });
  mesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  mesh.computeBoundingSphere();
  scene.add(mesh);
}

function addMountainAndSkyline(scene: THREE.Scene, palette: LandmarkPalette): void {
  const ridge = new THREE.InstancedMesh(
    new THREE.ConeGeometry(1, 1, 6),
    material(palette.muted, "muted", 1),
    9
  );
  const dummy = new THREE.Object3D();
  for (let index = 0; index < 9; index++) {
    const x = -12 + index * 2.9;
    const height = 4.2 + (index * 7 % 4) * 0.62;
    dummy.position.set(x, height / 2 - 0.2, -12.1);
    dummy.scale.set(2.7 + index % 3 * 0.75, height, 1.4);
    dummy.rotation.y = index * 0.38;
    dummy.updateMatrix();
    ridge.setMatrixAt(index, dummy.matrix);
  }
  ridge.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  ridge.computeBoundingSphere();
  scene.add(ridge);

  const towerProfiles = Array.from({ length: 16 }, (_, index) => {
    const x = -1.9 + index * 0.82;
    const height = 2.6 + ((index * 13 + 3) % 7) * 0.48;
    const width = 0.52 + (index % 3) * 0.12;
    return { x, height, width, depth: 0.48 + (index % 2) * 0.16 };
  });
  const towers = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    material(palette.surface2, "surface2", 0.94),
    towerProfiles.length
  );
  const windowRows = towerProfiles.map((tower) => Math.max(0, Math.ceil((tower.height - 0.86) / 0.62)));
  const windowCount = windowRows.reduce((count, rows) => count + rows * 2, 0);
  const windows = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    material(palette.warn, "warn", 0.45),
    windowCount
  );
  let windowIndex = 0;
  towerProfiles.forEach((tower, index) => {
    const roof = index % 5 === 0 ? 0.38 : 0;
    dummy.position.set(tower.x, tower.height / 2, -9.9);
    dummy.scale.set(tower.width, tower.height, tower.depth);
    dummy.updateMatrix();
    towers.setMatrixAt(index, dummy.matrix);
    if (roof > 0) {
      const cap = new THREE.Mesh(
        new THREE.BoxGeometry(tower.width * 0.72, roof, tower.depth * 1.12),
        material(palette.line, "line")
      );
      cap.position.set(tower.x, tower.height + roof / 2, -9.9);
      scene.add(cap);
    }
    for (let row = 0; row < windowRows[index]; row++) {
      const y = 0.72 + row * 0.62;
      for (const side of [-1, 1]) {
        dummy.position.set(tower.x + side * tower.width * 0.22, y, -9.63);
        dummy.scale.set(0.095, 0.22, 0.025);
        dummy.updateMatrix();
        windows.setMatrixAt(windowIndex++, dummy.matrix);
      }
    }
  });
  towers.count = towerProfiles.length;
  windows.count = windowIndex;
  towers.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  windows.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  towers.computeBoundingSphere();
  windows.computeBoundingSphere();
  scene.add(towers, windows);

  const ferryMaterial = material(palette.surface, "surface", 0.66);
  const ferry = new THREE.Group();
  const hull = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.42, 0.72), material(palette.ink, "ink"));
  hull.position.y = 0.52;
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.72, 0.56), ferryMaterial);
  cabin.position.set(0.12, 1.04, 0);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.12, 0.68), material(palette.accent, "accent"));
  deck.position.y = 0.8;
  ferry.add(hull, cabin, deck);
  for (let index = 0; index < 4; index++) {
    const window = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.22, 0.045), material(palette.sky, "sky", 0.36));
    window.position.set(-0.48 + index * 0.38, 1.08, 0.3);
    ferry.add(window);
  }
  ferry.position.set(-7.3, 0, -7.3);
  scene.add(ferry);

  const coastalPlant = material(palette.foliage, "foliage", 1);
  const shrubs = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.72, 1), coastalPlant, 12);
  for (let index = 0; index < 12; index++) {
    const side = index < 6 ? -1 : 1;
    const local = index % 6;
    dummy.position.set(side * (10.2 + (local % 2) * 0.5), 0.42, -3.6 + local * 1.35);
    dummy.scale.set(0.75 + local % 3 * 0.12, 0.74 + local % 2 * 0.16, 0.65);
    dummy.updateMatrix();
    shrubs.setMatrixAt(index, dummy.matrix);
  }
  shrubs.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  shrubs.computeBoundingSphere();
  scene.add(shrubs);
}

function addTransitArchitecture(scene: THREE.Scene, palette: LandmarkPalette): void {
  const roof = material(palette.ink, "ink", 0.82);
  const glass = material(palette.sky, "sky", 0.28);
  const frame = material(palette.line, "line");
  const signs = material(palette.accent, "accent", 0.6);
  const roofBeams: Box[] = [];
  const columns: Box[] = [];
  for (const x of [-11, -7.4, -3.7, 0, 3.7, 7.4, 11]) {
    roofBeams.push([x, 5.75, -1.5, 0.2, 0.24, 9.6]);
    columns.push([x, 2.95, -1.5, 0.2, 5.8, 0.22]);
  }
  instancedBoxes(scene, roofBeams, roof);
  instancedBoxes(scene, columns, frame);

  const clerestory: Box[] = [];
  for (const x of [-9, -6, -3, 0, 3, 6, 9]) {
    clerestory.push([x, 5.35, -6.6, 2.55, 0.62, 0.07]);
  }
  instancedBoxes(scene, clerestory, glass);

  const signBoards: Box[] = [];
  const signBands: Box[] = [];
  for (const x of [-7, -2.3, 2.3, 7]) {
    signBoards.push([x, 4.8, -1.9, 2.5, 0.78, 0.2]);
    signBands.push([x, 4.49, -1.77, 1.65, 0.085, 0.035]);
  }
  instancedBoxes(scene, signBoards, roof);
  instancedBoxes(scene, signBands, signs);

  const gates: Box[] = [];
  for (const x of [-8.5, -6.8, -5.1, 5.1, 6.8, 8.5]) {
    gates.push([x, 0.62, 5.25, 0.16, 1.22, 0.52]);
    gates.push([x, 0.16, 5.25, 0.72, 0.32, 0.95]);
  }
  instancedBoxes(scene, gates, frame);

  const wayfinding = new THREE.InstancedMesh(
    new THREE.BoxGeometry(0.08, 0.08, 0.08),
    material(palette.warn, "warn", 0.42),
    24
  );
  let lightIndex = 0;
  for (const x of [-9, -6, -3, 0, 3, 6, 9]) {
    for (const y of [3.8, 4.05, 4.3]) {
      wayfinding.setMatrixAt(lightIndex++, new THREE.Matrix4().makeTranslation(x, y, -5.25));
    }
  }
  wayfinding.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  wayfinding.computeBoundingSphere();
  scene.add(wayfinding);
}

function addCourtyardArchitecture(scene: THREE.Scene, palette: LandmarkPalette): void {
  const timber = material(palette.land, "land");
  const roof = material(palette.danger, "danger", 0.68);
  const tile = material(palette.accent, "accent", 0.7);
  const stone = material(palette.surface2, "surface2");
  const roofEdges: Box[] = [];
  const columns: Box[] = [];
  for (const side of [-1, 1]) {
    for (const z of [-4.2, 0, 4.2]) {
      columns.push([side * 10.1, 1.8, z, 0.3, 3.6, 0.32]);
      columns.push([side * 8.9, 1.8, z, 0.3, 3.6, 0.32]);
    }
    roofEdges.push([side * 9.5, 3.8, -0.1, 2.5, 0.22, 12.1]);
    roofEdges.push([side * 9.5, 4.25, -0.12, 2.25, 0.2, 11.9]);
  }
  instancedBoxes(scene, columns, timber);
  instancedBoxes(scene, roofEdges, roof);

  const roofRidge = new THREE.Mesh(new THREE.BoxGeometry(18.8, 0.42, 0.72), tile);
  roofRidge.position.set(0, 4.55, -5.7);
  scene.add(roofRidge);
  const courtyardPavers: Box[] = [];
  for (let x = -10; x <= 10; x += 2) {
    courtyardPavers.push([x, 0.035, 7.35, 1.9, 0.06, 0.12]);
  }
  instancedBoxes(scene, courtyardPavers, stone);

  const bamboo = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(0.07, 0.11, 2.7, 5),
    material(palette.foliage, "foliage", 1),
    12
  );
  const dummy = new THREE.Object3D();
  for (let index = 0; index < 12; index++) {
    const side = index < 6 ? -1 : 1;
    const local = index % 6;
    dummy.position.set(side * (10.5 + local % 2 * 0.3), 1.36, -3.6 + local * 1.38);
    dummy.rotation.z = (local % 3 - 1) * 0.06;
    dummy.scale.set(1, 0.8 + local % 3 * 0.15, 1);
    dummy.updateMatrix();
    bamboo.setMatrixAt(index, dummy.matrix);
  }
  bamboo.instanceMatrix.setUsage(THREE.StaticDrawUsage);
  bamboo.computeBoundingSphere();
  scene.add(bamboo);
}

export function addEnvironmentalLandmarks(scene: THREE.Scene, arena: ArenaId, palette: LandmarkPalette): void {
  if (arena === "plaza") addMountainAndSkyline(scene, palette);
  else if (arena === "metro") addTransitArchitecture(scene, palette);
  else addCourtyardArchitecture(scene, palette);
}
