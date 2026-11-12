// Dice that tumble and land on the roll: each die is a CSS 3D cube of six faces, so the browser does
// the turning. As on Chinese dice, the one and the four are red. The tumble lives in styles.css
// (.dice3d); it lands on the face given here, so every screen shows the same roll. A die comes to rest
// as one does on a table seen from a chair: the roll on its top face, two of its sides showing, its
// shadow under it on the table (the shadow stays on the table while the die is in the air).

/** Pips on a 3×3 grid, numbered 1-9 row by row. */
const PIPS: Record<number, number[]> = {
  1: [5],
  2: [3, 7],
  3: [3, 5, 7],
  4: [1, 3, 7, 9],
  5: [1, 3, 5, 7, 9],
  6: [1, 3, 4, 6, 7, 9],
};

/** Where each face sits on the cube (opposite faces add up to 7). */
const FACE: Record<number, string> = {
  1: "translateZ(var(--h))",
  6: "rotateY(180deg) translateZ(var(--h))",
  2: "rotateY(90deg) translateZ(var(--h))",
  5: "rotateY(-90deg) translateZ(var(--h))",
  3: "rotateX(90deg) translateZ(var(--h))",
  4: "rotateX(-90deg) translateZ(var(--h))",
};

/** How to turn the cube so a face looks at you: [about x, about y], in degrees. */
const SHOW: Record<number, [number, number]> = { 1: [0, 0], 6: [0, 180], 2: [0, -90], 5: [0, 90], 3: [-90, 0], 4: [90, 0] };

/** A small deterministic spread from the roll's id, so a re-render doesn't change the tumble. */
const spread = (seed: number, i: number) => {
  const x = Math.sin(seed * 12.9898 + i * 78.233) * 43758.5453;
  return x - Math.floor(x);
};

function Die({ n, seed, i }: { n: number; seed: number; i: number }) {
  const [ex, ey] = SHOW[n] ?? [0, 0];
  const r = (k: number) => spread(seed, i * 7 + k);
  const turns = (k: number) => (r(k) < 0.5 ? -1 : 1) * (2 + Math.floor(r(k + 1) * 2)) * 360;
  const style = {
    "--ex": `${ex}deg`,
    "--ey": `${ey}deg`,
    "--ez": `${Math.round((r(3) - 0.5) * 36)}deg`,
    "--sx": `${turns(4)}deg`,
    "--sy": `${turns(5)}deg`,
    "--sz": `${Math.round((r(6) - 0.5) * 540)}deg`,
    "--delay": `${i * 70}ms`,
  };
  return (
    <span class="die3d" style={style}>
      <span class="die-shadow" />
      <span class="die-air">
        <span class="cube">
          {[1, 2, 3, 4, 5, 6].map((f) => (
            <span key={f} class={`face f${f}`} style={{ transform: FACE[f] }}>
              {PIPS[f].map((p) => (
                <i key={p} style={{ gridArea: `${Math.ceil(p / 3)} / ${((p - 1) % 3) + 1}` }} />
              ))}
            </span>
          ))}
        </span>
      </span>
    </span>
  );
}

/** One or two dice (jet lag rolls one), tumbling in on mount. `seed` keys the tumble to the roll. */
export function Dice({ dice, seed, size = 64 }: { dice: number[]; seed: number; size?: number }) {
  return (
    <span class="dice3d" style={{ "--s": `${size}px` }} role="img" aria-label={dice.join(" + ")}>
      {dice.map((n, i) => (
        <Die key={i} n={n} seed={seed} i={i} />
      ))}
    </span>
  );
}
