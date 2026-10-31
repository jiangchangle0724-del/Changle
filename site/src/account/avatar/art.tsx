import { useId, useMemo } from "react";
import type { AvatarCfg } from "../../shared/avatar/cfg";
import { renderAvatar, type Box, type View } from "../../shared/avatar/render";

/** An id safe for SVG references and CSS selectors (React's own has colons). */
export function useSvgId(prefix = "av"): string {
  return prefix + useId().replace(/[^a-zA-Z0-9_-]/g, "");
}

/** A look drawn inline. The picture is plain SVG built from the look, so it's crisp at any size. */
export function AvatarArt({
  cfg,
  view = "head",
  box,
  live,
  label,
  className,
  style,
}: {
  cfg: AvatarCfg;
  view?: View;
  box?: Box;
  live?: boolean;
  label?: string;
  className?: string;
  style?: React.CSSProperties;
}) {
  const id = useSvgId();
  const html = useMemo(() => renderAvatar(cfg, { view, box, live, label, id }), [cfg, view, box, live, label, id]);
  return <span className={className} style={style} dangerouslySetInnerHTML={{ __html: html }} />;
}
