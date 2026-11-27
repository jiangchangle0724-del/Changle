/** How the pickup code is made: medium error correction, and two light modules around it (with the tile's own margin, enough quiet for a camera). */
export const QR_OPTIONS = { ecc: "M", border: 2 } as const;

// A QR code's dark modules as one SVG path: each row's runs as rectangles, one unit high. Pure, so
// the order page (Order.tsx) and its test draw the same code from the same text.
export function qrPath(data: readonly (readonly boolean[])[]): string {
  let path = "";
  data.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      if (!row[x]) continue;
      let run = 1;
      while (row[x + run]) run++;
      path += `M${x} ${y}h${run}v1h-${run}z`;
      x += run;
    }
  });
  return path;
}
