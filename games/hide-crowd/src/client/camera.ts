/** The part of the floor the crowd can be on, in scene units: x from -halfWidth to halfWidth, z from far (back) to near (front). */
export interface FloorBox {
  halfWidth: number;
  near: number;
  far: number;
  /** how tall a person stands: the far row's heads have to be on screen too */
  height: number;
}

/** How much of the screen stays clear of the crowd, as fractions of its height (top, bottom) and width (side). */
export interface ScreenMargins {
  top: number;
  bottom: number;
  side: number;
}

export interface Framing {
  position: [number, number, number];
  target: [number, number, number];
  /** vertical field of view, degrees */
  fov: number;
}

/**
 * The camera that shows the whole floor as big as the screen allows: the front row's feet just above
 * the bottom margin, everyone across the width inside the side margins, the back row's heads under the
 * top margin. Whatever room is left over stays at the top, where the far side of the place shows.
 * A camera at a fixed downward tilt (pitch) and field of view, moved back just as far as it needs.
 */
export function frameFloor(aspect: number, box: FloorBox, margins: ScreenMargins, pitchDegrees = 50, fovDegrees = 24): Framing {
  const ratio = Number.isFinite(aspect) && aspect > 0.2 ? Math.min(aspect, 5) : 16 / 9;
  const pitch = (Math.min(85, Math.max(10, pitchDegrees)) * Math.PI) / 180;
  const fov = Math.min(80, Math.max(8, fovDegrees));
  const tanY = Math.tan((fov * Math.PI) / 360);
  const tanX = tanY * ratio;
  const up = { y: Math.cos(pitch), z: -Math.sin(pitch) };
  const forward = { y: -Math.sin(pitch), z: -Math.cos(pitch) };
  const bottomLimit = -1 + 2 * margins.bottom;
  const topLimit = 1 - 2 * margins.top;
  const sideLimit = 1 - 2 * margins.side;

  // a point's place on screen (-1..1 both ways) for a camera this far back, looking at (0, 0, targetZ)
  const project = (distance: number, targetZ: number, x: number, y: number, z: number) => {
    const cy = distance * Math.sin(pitch);
    const cz = targetZ + distance * Math.cos(pitch);
    const dy = y - cy;
    const dz = z - cz;
    const depth = dy * forward.y + dz * forward.z;
    return { x: x / (depth * tanX), y: (dy * up.y + dz * up.z) / (depth * tanY) };
  };
  // where to look so the front row's feet sit on the bottom margin (moving the camera forward slides the floor up the screen)
  const targetFor = (distance: number) => {
    let lo = box.far - 40;
    let hi = box.near + 40;
    for (let step = 0; step < 60; step++) {
      const mid = (lo + hi) / 2;
      if (project(distance, mid, 0, 0, box.near).y > bottomLimit) hi = mid;
      else lo = mid;
    }
    return (lo + hi) / 2;
  };
  const fits = (distance: number) => {
    const targetZ = targetFor(distance);
    const top = project(distance, targetZ, 0, box.height, box.far).y;
    const side = Math.max(
      Math.abs(project(distance, targetZ, box.halfWidth, 0, box.near).x),
      Math.abs(project(distance, targetZ, box.halfWidth, box.height, box.near).x)
    );
    return top <= topLimit && side <= sideLimit;
  };
  let near = 2;
  let far = 400;
  for (let step = 0; step < 50; step++) {
    const mid = (near + far) / 2;
    if (fits(mid)) far = mid;
    else near = mid;
  }
  const distance = far;
  const targetZ = targetFor(distance);
  return {
    position: [0, distance * Math.sin(pitch), targetZ + distance * Math.cos(pitch)],
    target: [0, 0, targetZ],
    fov
  };
}
