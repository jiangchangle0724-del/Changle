// The big screen's 3D globe (three.js), drawn over the map in the middle of the round board. Built as
// its own file (dist/client/globe.js) and loaded only by the big screen, so phones never download it.
// The globe's paper, land and ink come from the page's colours, so it matches the board in light
// and dark. It turns to face the team on turn; when a token flies to another region, a little plane
// flies the great-circle arc above the surface while the camera leans in.
import {
  AmbientLight,
  CanvasTexture,
  CatmullRomCurve3,
  Color,
  DirectionalLight,
  Group,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PerspectiveCamera,
  Quaternion,
  Scene,
  Shape,
  ShapeGeometry,
  SphereGeometry,
  SRGBColorSpace,
  TubeGeometry,
  Vector3,
  WebGLRenderer,
} from "three";
// Natural Earth 1:110m land as [lon, lat] rings (made by scripts/gen-world.mjs).
import LAND from "../../samples/land-lonlat.json";

export interface GlobeColors {
  sea: string;
  land: string;
  line: string;
  ink: string;
  flight: string;
  dots: Record<string, string>;
}

export interface GlobeOptions {
  /** City id → [lat, lon]. */
  cities: Record<string, [number, number]>;
  colors: GlobeColors;
}

export interface GlobeApi {
  focus(city: string): void;
  fly(from: string, to: string): void;
  recolor(colors: GlobeColors): void;
  destroy(): void;
}

const RAD = Math.PI / 180;
const TEX_W = 2048;
const TEX_H = 1024;
/** Antarctica is left off, as on the board's map and the old airline maps. */
const LAT_MIN = -58;

/** Unit vector for a place, in three.js's y-up world (lon 0 faces +z). */
function toVec(lat: number, lon: number, r = 1) {
  const phi = lat * RAD;
  const lam = lon * RAD;
  return new Vector3(r * Math.cos(phi) * Math.sin(lam), r * Math.sin(phi), r * Math.cos(phi) * Math.cos(lam));
}

/** Paint the globe's paper: sea, graticule, land, city dots. Equirectangular, lon -180 at the left. */
function paint(canvas: HTMLCanvasElement, opts: GlobeOptions, colors: GlobeColors) {
  const g = canvas.getContext("2d")!;
  const x = (lon: number) => ((lon + 180) / 360) * TEX_W;
  const y = (lat: number) => ((90 - lat) / 180) * TEX_H;
  g.fillStyle = colors.sea;
  g.fillRect(0, 0, TEX_W, TEX_H);
  g.strokeStyle = colors.line;
  g.lineWidth = 1.5;
  g.setLineDash([6, 8]);
  for (let lat = -60; lat <= 60; lat += 30) {
    g.beginPath();
    g.moveTo(0, y(lat));
    g.lineTo(TEX_W, y(lat));
    g.stroke();
  }
  for (let lon = -180; lon < 180; lon += 30) {
    g.beginPath();
    g.moveTo(x(lon), 0);
    g.lineTo(x(lon), TEX_H);
    g.stroke();
  }
  g.setLineDash([]);
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(0, y(0));
  g.lineTo(TEX_W, y(0));
  g.stroke();
  // Land. A ring that crosses the date line is unwrapped and drawn three times, shifted by a whole
  // map width, so both halves land where they belong.
  g.fillStyle = colors.land;
  g.strokeStyle = colors.ink;
  g.lineWidth = 1.2;
  for (const ring of LAND as [number, number][][]) {
    if (ring.every(([, lat]) => lat < LAT_MIN)) continue;
    const pts: [number, number][] = [];
    let shift = 0;
    for (let i = 0; i < ring.length; i++) {
      const [lon, lat] = ring[i];
      if (i > 0) {
        const d = lon - ring[i - 1][0];
        if (d > 180) shift -= 360;
        else if (d < -180) shift += 360;
      }
      pts.push([lon + shift, Math.max(lat, LAT_MIN - 2)]);
    }
    for (const off of [-360, 0, 360]) {
      g.beginPath();
      pts.forEach(([lon, lat], i) => (i ? g.lineTo(x(lon + off), y(lat)) : g.moveTo(x(lon + off), y(lat))));
      g.closePath();
      g.fill();
      g.stroke();
    }
  }
  // Cities: dots in their region colours, with a paper edge.
  for (const [id, [lat, lon]] of Object.entries(opts.cities)) {
    g.beginPath();
    g.arc(x(lon), y(lat), 9, 0, Math.PI * 2);
    g.fillStyle = colors.dots[id] ?? colors.ink;
    g.fill();
    g.lineWidth = 3;
    g.strokeStyle = colors.sea;
    g.stroke();
  }
}

/** A small flat airliner, nose along +y, lying in the x-y plane. */
function planeShape() {
  const s = new Shape();
  const p: [number, number][] = [
    [0, 9], [2.2, 2.6], [9, -1.6], [9, -4], [2.2, -1.8], [1.6, -7.2], [4, -9], [4, -10.6], [0, -9.6],
    [-4, -10.6], [-4, -9], [-1.6, -7.2], [-2.2, -1.8], [-9, -4], [-9, -1.6], [-2.2, 2.6],
  ];
  p.forEach(([a, b], i) => (i ? s.lineTo(a, b) : s.moveTo(a, b)));
  s.closePath();
  return new ShapeGeometry(s);
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function mountGlobe(canvas: HTMLCanvasElement, opts: GlobeOptions): GlobeApi {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputColorSpace = SRGBColorSpace;
  const scene = new Scene();
  const camera = new PerspectiveCamera(30, 1, 0.1, 50);
  // From here the globe just fills its circle on the board.
  const REST = 3.95;
  camera.position.set(0, 0, REST);

  const paper = document.createElement("canvas");
  paper.width = TEX_W;
  paper.height = TEX_H;
  paint(paper, opts, opts.colors);
  const texture = new CanvasTexture(paper);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = renderer.capabilities.getMaxAnisotropy();

  // The globe and everything stuck to it turn together.
  const world = new Group();
  scene.add(world);
  const earthMat = new MeshLambertMaterial({ map: texture });
  const earth = new Mesh(new SphereGeometry(1, 96, 64), earthMat);
  // SphereGeometry starts its texture at lon -180 on the -x side: turn it so lon 0 faces +z like toVec.
  earth.rotation.y = -Math.PI / 2;
  world.add(earth);
  // Mostly flat light, so the paper keeps the board's colours, with a soft sun for roundness.
  // (three.js lights are physically based: a Lambert surface needs about π to show its own colour.)
  scene.add(new AmbientLight(0xffffff, 2.5));
  const sun = new DirectionalLight(0xffffff, 0.9);
  sun.position.set(-2, 3, 4);
  scene.add(sun);

  const trailMat = new MeshBasicMaterial({ color: new Color(opts.colors.flight) });
  const planeMat = new MeshBasicMaterial({ color: new Color(opts.colors.ink) });
  const plane = new Mesh(planeShape(), planeMat);
  plane.scale.setScalar(0.0062);
  plane.visible = false;
  world.add(plane);
  let trail: Mesh | null = null;
  /** The city the globe should face once a flight is over (the team on turn may have changed). */
  let want: string | null = null;

  // The globe's turn is a quaternion: "this city faces the camera, north up".
  const facing = (lat: number, lon: number) => {
    const q = new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), -lon * RAD);
    const tilt = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), lat * RAD * 0.75);
    return tilt.multiply(q);
  };

  // An animation's clock starts at its first frame: a frame's timestamp can be a little earlier than
  // the moment the animation was asked for, and a negative time would put the plane off its route.
  let anim: { start: number | null; dur: number; step: (t: number) => void; done?: () => void } | null = null;
  let raf = 0;
  const frame = (now: number) => {
    raf = 0;
    if (anim) {
      anim.start ??= now;
      const t = Math.max(0, Math.min(1, (now - anim.start) / anim.dur));
      anim.step(t);
      if (t >= 1) {
        const done = anim.done;
        anim = null;
        done?.();
      }
    }
    renderer.render(scene, camera);
    if (anim) raf = requestAnimationFrame(frame);
  };
  const kick = () => {
    if (!raf) raf = requestAnimationFrame(frame);
  };
  const run = (dur: number, step: (t: number) => void, done?: () => void) => {
    anim = { start: null, dur, step, done };
    kick();
  };

  const resize = () => {
    const w = canvas.clientWidth || 1;
    const h = canvas.clientHeight || 1;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    kick();
  };
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();

  const turnTo = (q: Quaternion, dur: number, done?: () => void) => {
    const from = world.quaternion.clone();
    run(dur, (t) => world.quaternion.slerpQuaternions(from, q, ease(t)), done);
  };

  return {
    focus(city) {
      const c = opts.cities[city];
      if (!c) return;
      want = city;
      if (!anim) turnTo(facing(c[0], c[1]), 1100);
    },
    fly(fromId, toId) {
      const a = opts.cities[fromId];
      const b = opts.cities[toId];
      if (!a || !b) return;
      const va = toVec(a[0], a[1]);
      const vb = toVec(b[0], b[1]);
      const angle = va.angleTo(vb);
      const lift = 0.06 + 0.16 * (angle / Math.PI);
      // The arc, lifted off the surface in the middle.
      const pts: Vector3[] = [];
      for (let i = 0; i <= 64; i++) {
        const t = i / 64;
        const v = new Vector3().copy(va).lerp(vb, t).normalize();
        // slerp for long arcs (lerp+normalize bunches points near the middle on wide angles)
        const s = Math.sin(angle);
        if (s > 1e-6) v.copy(va).multiplyScalar(Math.sin((1 - t) * angle) / s).add(vb.clone().multiplyScalar(Math.sin(t * angle) / s));
        pts.push(v.multiplyScalar(1.004 + lift * Math.sin(Math.PI * t)));
      }
      if (trail) {
        world.remove(trail);
        trail.geometry.dispose();
      }
      // The trail is a thin tube (WebGL lines are one pixel wide, too thin for a TV across the room).
      const RADIAL = 6;
      trail = new Mesh(new TubeGeometry(new CatmullRomCurve3(pts), 64, 0.0055, RADIAL, false), trailMat);
      trail.geometry.setDrawRange(0, 0);
      world.add(trail);
      want = toId;
      canvas.dataset.flying = "1";
      plane.visible = true;
      // Face the middle of the route, then fly it with the camera leaning in.
      const mid = pts[32].clone().normalize();
      const midLat = Math.asin(mid.y) / RAD;
      const midLon = Math.atan2(mid.x, mid.z) / RAD;
      turnTo(facing(midLat, midLon), 700, () => {
        const basis = new Matrix4();
        run(
          2400,
          (t) => {
            const k = ease(t);
            const i = Math.min(63, Math.floor(k * 64));
            const f = k * 64 - i;
            const p = pts[i].clone().lerp(pts[i + 1], f);
            // Nose along the route, belly to the ground: build the plane's axes directly.
            const up = p.clone().normalize();
            const ahead = pts[Math.min(64, i + 2)].clone().sub(p);
            const fwd = ahead.sub(up.clone().multiplyScalar(ahead.dot(up))).normalize();
            const side = new Vector3().crossVectors(fwd, up);
            basis.makeBasis(side, fwd, up);
            plane.quaternion.setFromRotationMatrix(basis);
            plane.position.copy(p);
            trail!.geometry.setDrawRange(0, (i + 1) * RADIAL * 6);
            camera.position.z = REST - 0.7 * Math.sin(Math.PI * t);
          },
          () => {
            plane.visible = false;
            delete canvas.dataset.flying;
            camera.position.z = REST;
            const end = (want && opts.cities[want]) || b;
            turnTo(facing(end[0], end[1]), 900);
          },
        );
      });
    },
    recolor(colors) {
      paint(paper, opts, colors);
      texture.needsUpdate = true;
      trailMat.color.set(colors.flight);
      planeMat.color.set(colors.ink);
      kick();
    },
    destroy() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      earth.geometry.dispose();
      plane.geometry.dispose();
      trail?.geometry.dispose();
      for (const m of [earthMat, trailMat, planeMat]) m.dispose();
      texture.dispose();
      renderer.dispose();
    },
  };
}

(window as unknown as { BeenThereGlobe: { mountGlobe: typeof mountGlobe } }).BeenThereGlobe = { mountGlobe };
