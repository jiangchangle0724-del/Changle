/** Lyria's chunks: little-endian 16-bit stereo, interleaved. The player takes planar floats. */
export function pcm16ToFloat(buf: ArrayBuffer): { l: Float32Array; r: Float32Array } {
  const v = new DataView(buf);
  const n = Math.floor(buf.byteLength / 4);
  const l = new Float32Array(n);
  const r = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    l[i] = v.getInt16(i * 4, true) / 32768;
    r[i] = v.getInt16(i * 4 + 2, true) / 32768;
  }
  return { l, r };
}
