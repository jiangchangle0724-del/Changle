import { useState } from "react";
import { API } from "../config";

/** The gel palette avatars are drawn from when someone has no photo. */
export const AV_COLORS = ["#b072ff", "#4be38f", "#ffb82e", "#31b9ff", "#ff5fa2", "#b6e83a", "#ff6b5e", "#8c86ff", "#2ed3d9", "#ff8c42", "#e765f0", "#5b9bff", "#f5df3b", "#22d3a6", "#ff9cc5"];

export function initialOf(name: string) {
  const s = name.trim();
  if (!s) return "?";
  return /[㐀-鿿]/.test(s[0]) ? s[0] : s[0].toUpperCase();
}

export function colorFor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return h % AV_COLORS.length;
}

/**
 * A round face: the profile photo when there is one, otherwise the first letter on a gel color.
 * `uid` + `av` (avatar version) point at the photo; `ac` picks the color.
 */
export function Avatar({ uid, name, av = 0, ac, size = 40, className = "" }: { uid?: string; name: string; av?: number; ac?: number; size?: number; className?: string }) {
  const [broken, setBroken] = useState(false);
  const color = AV_COLORS[(ac ?? colorFor(uid || name)) % AV_COLORS.length];
  const style = { width: size, height: size, fontSize: Math.round(size * 0.42), ["--av" as string]: color } as React.CSSProperties;
  if (uid && av > 0 && !broken)
    return (
      <span className={`avatar ${className}`} style={style}>
        <img src={`${API}/avatar/${uid}?v=${av}`} alt="" width={size} height={size} loading="lazy" decoding="async" onError={() => setBroken(true)} />
      </span>
    );
  return (
    <span className={`avatar avatar-letter ${className}`} style={style} aria-hidden="true">
      {initialOf(name)}
    </span>
  );
}
