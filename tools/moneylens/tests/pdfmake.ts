/**
 * A PDF made up for a test: pages of text placed where the test says. Every statement a test reads
 * is written this way (SEC-12, IMP-9): no bank's real statement is in the repository.
 */
export type MadeRun = { text: string; x: number; y: number; size?: number };
export type MadePage = { width?: number; height?: number; runs: MadeRun[] };

const bytesOf = (text: string): Uint8Array => Uint8Array.from(text, (c) => c.charCodeAt(0) & 0xff);

/** The file's bytes. Text is set in Helvetica; `x` is from the left and `y` from the top, in points. Letters past Latin-1 are not supported here. */
export function makePdf(pages: readonly MadePage[]): Uint8Array {
  const objects: string[] = [];
  const kids = pages.map((_, i) => `${4 + 2 * i} 0 R`).join(" ");
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  pages.forEach((page, i) => {
    const [w, h] = [page.width ?? 612, page.height ?? 792];
    const stream = page.runs.map((run) => `BT /F1 ${run.size ?? 9} Tf 1 0 0 1 ${run.x} ${h - run.y} Tm (${run.text.replace(/[\\()]/g, "\\$&")}) Tj ET`).join("\n");
    objects[4 + 2 * i] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + 2 * i} 0 R >>`;
    objects[5 + 2 * i] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });
  let file = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (let n = 1; n < objects.length; n++) {
    offsets[n] = file.length;
    file += `${n} 0 obj\n${objects[n]}\nendobj\n`;
  }
  const xref = file.length;
  file += `xref\n0 ${objects.length}\n0000000000 65535 f \n${offsets.slice(1).map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  file += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return bytesOf(file);
}
