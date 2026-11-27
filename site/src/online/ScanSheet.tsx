import { KeyRound } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Lang } from "../i18n";
import { haptic } from "../lib/sfx";
import { navigate } from "../router";
import { Button } from "../ui/Button";
import { Sheet } from "../ui/Sheet";
import { readScan } from "./scan";
import "./scan.css";

type State = "starting" | "looking" | "denied" | "nocamera" | "foreign";

const WORDS: Record<State, { zh: string; en: string }> = {
  starting: { zh: "正在打开相机", en: "Opening the camera" },
  looking: { zh: "把桌上的二维码放进框里", en: "Fit the table's QR code in the frame" },
  denied: {
    zh: "相机没打开。在浏览器设置里允许 changle.ca 用相机，或者输入桌号。",
    en: "The camera is blocked. Allow changle.ca to use it in the browser's settings, or type the code.",
  },
  nocamera: { zh: "这台设备没有能用的相机。用手机扫，或者输入桌号。", en: "No camera to use here. Scan with a phone, or type the code." },
  foreign: { zh: "这不是 changle.ca 的二维码", en: "That QR code isn't from changle.ca" },
};

/**
 * Scan to join (Steve 2026-11-25: beside the key on the home page). The camera looks for a QR
 * code in the middle of the picture (the square the frame shows) a few times a second; the first
 * table it reads is joined, as if its link had been tapped. The camera stops when the sheet
 * closes. The decoder (qr, 17 KB) downloads with this sheet, never with the home page.
 */
export function ScanSheet({ open, onClose, onTypeCode, lang }: { open: boolean; onClose: () => void; onTypeCode: () => void; lang: Lang }) {
  const zh = lang === "zh";
  const video = useRef<HTMLVideoElement>(null);
  const [state, setState] = useState<State>("starting");
  const [mirror, setMirror] = useState(false);

  useEffect(() => {
    const player = video.current;
    if (!open || !player) return;
    let stopped = false;
    let stream: MediaStream | null = null;
    let timer = 0;
    let calm = 0;
    const decoder = import("qr/decode.js");
    const stop = () => {
      stopped = true;
      window.clearTimeout(timer);
      window.clearTimeout(calm);
      stream?.getTracks().forEach((t) => t.stop());
      player.srcObject = null;
    };
    setState("starting");
    void (async () => {
      if (!navigator.mediaDevices?.getUserMedia) return setState("nocamera");
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
      } catch (e) {
        if (stopped) return;
        const name = (e as { name?: string } | null)?.name;
        return setState(name === "NotAllowedError" || name === "SecurityError" ? "denied" : "nocamera");
      }
      if (stopped) return stream.getTracks().forEach((t) => t.stop());
      // a laptop's camera faces you: its picture is shown mirrored, as a mirror would (the frames read stay as they are)
      setMirror(stream.getVideoTracks()[0]?.getSettings().facingMode === "user");
      player.muted = true;
      player.srcObject = stream;
      await player.play().catch(() => {});
      let decodeQR: (typeof import("qr/decode.js"))["default"];
      try {
        decodeQR = (await decoder).default;
      } catch {
        return !stopped && setState("nocamera");
      }
      if (stopped) return;
      setState("looking");
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      const look = () => {
        if (stopped || !ctx) return;
        const w = player.videoWidth;
        const h = player.videoHeight;
        if (player.readyState >= 2 && w && h) {
          // the square in the middle, as the frame shows it, at most 640 across: quick to read
          const s = Math.min(w, h);
          const n = Math.min(s, 640);
          canvas.width = n;
          canvas.height = n;
          ctx.drawImage(player, (w - s) / 2, (h - s) / 2, s, s, 0, 0, n, n);
          let text: string | null = null;
          try {
            text = decodeQR(ctx.getImageData(0, 0, n, n));
          } catch {
            // no code in this picture: the next one
          }
          if (text !== null) {
            const what = readScan(text, window.location.origin);
            if (what) {
              stop();
              haptic(20);
              if (what.kind === "table") navigate(`/t/${what.code}`);
              else window.location.assign(what.href);
              return;
            }
            setState("foreign");
            window.clearTimeout(calm);
            calm = window.setTimeout(() => !stopped && setState("looking"), 2500);
          }
        }
        timer = window.setTimeout(look, 150);
      };
      look();
    })();
    return stop;
  }, [open]);

  const blocked = state === "denied" || state === "nocamera";
  return (
    <Sheet
      open={open}
      onClose={onClose}
      lang={lang}
      title={zh ? "扫码入座" : "Scan to join"}
      category="online"
      footer={
        <Button tone={blocked ? "primary" : "quiet"} block icon={KeyRound} onClick={onTypeCode}>
          {zh ? "输入桌号" : "Type the code"}
        </Button>
      }
    >
      <div className={`scan-view${blocked ? " is-off" : ""}`}>
        <video ref={video} className={mirror ? "is-mirrored" : undefined} playsInline muted aria-hidden="true" />
        <span className="scan-frame" aria-hidden="true" />
      </div>
      <p className={`scan-status${state === "foreign" || blocked ? " is-warn" : ""}`} role="status">
        {zh ? WORDS[state].zh : WORDS[state].en}
      </p>
    </Sheet>
  );
}
