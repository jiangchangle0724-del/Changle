/** Vertical perspective FOV that preserves a requested horizontal span. */
export function verticalFovForWidth(horizontalSpan: number, aspect: number, distance: number): number {
  const width = Number.isFinite(horizontalSpan) && horizontalSpan > 0 ? horizontalSpan : 1;
  const ratio = Number.isFinite(aspect) && aspect > 0 ? aspect : 1;
  const depth = Number.isFinite(distance) && distance > 0 ? distance : 1;
  const verticalSpan = width / ratio;
  return 2 * Math.atan(verticalSpan / (2 * depth)) * 180 / Math.PI;
}
