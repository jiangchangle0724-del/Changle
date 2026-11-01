import QRCode from "qrcode";
import { useEffect, useState } from "react";

/** The site's name in lights, top left of every big screen. */
export function Wordmark() {
  return (
    <span className="tv-wordmark" aria-label="changle">
      changle<span className="tv-wordmark-dot">.</span>
    </span>
  );
}

/** A QR code for a link, as an SVG string (empty until it's drawn). */
export function useQr(link: string, dark = "#0e0c22") {
  const [svg, setSvg] = useState("");
  useEffect(() => {
    let live = true;
    QRCode.toString(link, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark, light: "#00000000" } })
      .then((s) => live && setSvg(s))
      .catch(() => live && setSvg(""));
    return () => {
      live = false;
    };
  }, [link, dark]);
  return svg;
}

/** Where a phone sits down at a table. */
export const joinLink = (code: string) => `${window.location.origin}/t/${code}`;
export const siteHost = () => window.location.host.replace(/^www\./, "");
