import { faceOf, LC_COLORS, type LcColor, type LcKind } from "../../shared/lastcard/cards";

/**
 * 最后一张's own card faces, drawn in the night room's light: each colour is a stage gel (the
 * colours are named once, at the top of lastcard.css) and each colour has its own shape, so the four
 * read apart without colour too: red a triangle, yellow a circle, green a square, blue a star. Numbers
 * stand upright in the display face, night ink on the gel, big enough to read at arm's length; 6 and 9
 * are underlined. The two wilds are night cards lit by all four gels. One drawing scales from a card
 * in the hand to the big screen (a 100 by 140 box).
 */

/** each colour's shape, about 20 units across, centred on 0,0 */
export const SHAPE: Record<LcColor, string> = {
  r: "M0 -9 L10.5 9 L-10.5 9 Z",
  y: "M8.6 0 A8.6 8.6 0 1 1 -8.6 0 A8.6 8.6 0 1 1 8.6 0 Z",
  g: "M-7.2 -7.2 H7.2 V7.2 H-7.2 Z",
  b: "M0 -9.5 L2.7 -2.72 L9.99 -2.25 L4.38 2.42 L6.17 9.5 L0 5.6 L-6.17 9.5 L-4.38 2.42 L-9.99 -2.25 L-2.7 -2.72 Z",
};

/** A colour's shape on its own, for chips and buttons (`ink`: night, on the colour itself). */
export function Mark({ c, ink = false, className = "" }: { c: LcColor; ink?: boolean; className?: string }) {
  return (
    <svg className={`lc-mark ${className}`} viewBox="-12 -12 24 24" aria-hidden="true" focusable="false">
      <path d={SHAPE[c]} className={ink ? "lc-ink" : `lc-fill-${c}`} />
    </svg>
  );
}

const SKIP = "M-17 -17 L-1 0 L-17 17 M1 -17 L17 0 L1 17";
const REV = "M-18 -9 H13 M5 -17 L14 -9 L5 -1 M18 9 H-13 M-5 1 L-14 9 L-5 17";

/** The symbol a coloured action card carries, centred on 0,0 (about 36 units across). */
function Symbol({ k }: { k: LcKind }) {
  if (k === "skip") return <path d={SKIP} className="lc-stroke" strokeWidth={8} />;
  if (k === "rev") return <path d={REV} className="lc-stroke" strokeWidth={6.5} />;
  return (
    <text className="lc-ink lc-type" x={0} y={1} fontSize={38} textAnchor="middle" dominantBaseline="central">
      +2
    </text>
  );
}

/** The corner index: the number or symbol, the colour's shape under it. */
function Corner({ k, c, rotate }: { k: LcKind; c: LcColor; rotate?: boolean }) {
  const num = /^[0-9]$/.test(k);
  return (
    <g transform={rotate ? "rotate(180 50 70)" : undefined}>
      {num ? (
        <>
          <text className="lc-ink lc-type" x={15} y={19} fontSize={19} textAnchor="middle" dominantBaseline="central">
            {k}
          </text>
          {(k === "6" || k === "9") && <rect className="lc-ink" x={9.5} y={30} width={11} height={2.6} rx={1.3} />}
        </>
      ) : k === "d2" ? (
        <text className="lc-ink lc-type" x={15.5} y={19} fontSize={13} textAnchor="middle" dominantBaseline="central">
          +2
        </text>
      ) : (
        <g transform="translate(15 19) scale(0.36)">
          <Symbol k={k} />
        </g>
      )}
      <path d={SHAPE[c]} className="lc-ink" transform="translate(15 41) scale(0.5)" />
    </g>
  );
}

/** The four shapes in a square, each in its own colour (`pick`: the one in force shines, the rest go dark). */
function Four({ x, y, scale, pick }: { x: number; y: number; scale: number; pick?: LcColor | null }) {
  const at: Record<LcColor, [number, number]> = { r: [-1, -1], y: [1, -1], g: [-1, 1], b: [1, 1] };
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      {LC_COLORS.map((c) => (
        <path key={c} d={SHAPE[c]} className={`lc-fill-${c} ${pick && pick !== c ? "is-dark" : ""}`} transform={`translate(${at[c][0] * 12.5} ${at[c][1] * 12.5}) scale(${pick === c ? 1.25 : 1})`} />
      ))}
    </g>
  );
}

/**
 * One card: `id`'s face, or the back. `pick`: on the pile, the colour a wild was turned to. Purely a
 * picture (aria-hidden): whatever holds it says what it is.
 */
export function CardArt({ id, back = false, pick = null, className = "" }: { id?: number | null; back?: boolean; pick?: LcColor | null; className?: string }) {
  if (back || id === null || id === undefined) {
    return (
      <svg className={`lc-card is-back ${className}`} viewBox="0 0 100 140" aria-hidden="true" focusable="false">
        <rect className="lc-back" x={1} y={1} width={98} height={138} rx={11} />
        <rect className="lc-back-frame" x={7} y={7} width={86} height={126} rx={7} />
        <path className="lc-back-line" d="M50 22 L82 70 L50 118 L18 70 Z" />
        <path className="lc-back-line is-faint" d="M50 34 L74 70 L50 106 L26 70 Z" />
        <Four x={50} y={70} scale={0.5} />
      </svg>
    );
  }
  const f = faceOf(id);
  if (f.c === null) {
    return (
      <svg className={`lc-card is-wild ${className}`} viewBox="0 0 100 140" aria-hidden="true" focusable="false" data-k={f.k}>
        <rect className="lc-wild" x={1} y={1} width={98} height={138} rx={11} />
        <circle className="lc-wild-glow" cx={50} cy={70} r={36} />
        {f.k === "wild" ? (
          <Four x={50} y={70} scale={1.15} pick={pick} />
        ) : (
          <>
            <text className="lc-moon lc-type" x={50} y={58} fontSize={40} textAnchor="middle" dominantBaseline="central">
              +4
            </text>
            <Four x={50} y={98} scale={0.62} pick={pick} />
          </>
        )}
        {[false, true].map((rot) => (
          <g key={String(rot)} transform={rot ? "rotate(180 50 70)" : undefined}>
            {f.k === "d4" ? (
              <text className="lc-moon lc-type" x={15.5} y={19} fontSize={13} textAnchor="middle" dominantBaseline="central">
                +4
              </text>
            ) : (
              <Four x={15} y={22} scale={0.34} />
            )}
          </g>
        ))}
      </svg>
    );
  }
  const num = /^[0-9]$/.test(f.k);
  return (
    <svg className={`lc-card is-${f.c} ${className}`} viewBox="0 0 100 140" aria-hidden="true" focusable="false" data-k={f.k}>
      <rect className={`lc-stock lc-fill-${f.c}`} x={1} y={1} width={98} height={138} rx={11} />
      <rect className="lc-frame" x={6} y={6} width={88} height={128} rx={7} />
      <path className="lc-ink lc-watermark" d={SHAPE[f.c]} transform="translate(50 72) scale(3.1)" />
      {num ? (
        <>
          <text className="lc-ink lc-type" x={50} y={71} fontSize={58} textAnchor="middle" dominantBaseline="central">
            {f.k}
          </text>
          {(f.k === "6" || f.k === "9") && <rect className="lc-ink" x={36} y={101} width={28} height={5} rx={2.5} />}
        </>
      ) : (
        <g transform="translate(50 71)">
          <Symbol k={f.k} />
        </g>
      )}
      <Corner k={f.k} c={f.c} />
      <Corner k={f.k} c={f.c} rotate />
    </svg>
  );
}
