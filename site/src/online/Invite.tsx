import { Check, Copy, Share2 } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { Sheet } from "../components/Sheet";
import { useStore } from "../store";
import { inviteLink } from "./config";

/** The table's place card: the code at poster scale, a QR to scan across the table, the link to send. */
export function InviteCard({ code }: { code: string }) {
  const { ui, lang } = useStore();
  const link = inviteLink(code);
  const [qr, setQr] = useState("");
  const [copied, setCopied] = useState(false);
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";

  useEffect(() => {
    let live = true;
    QRCode.toString(link, { type: "svg", margin: 0, errorCorrectionLevel: "M", color: { dark: "#0e0c22", light: "#00000000" } })
      .then((svg) => live && setQr(svg))
      .catch(() => live && setQr(""));
    return () => {
      live = false;
    };
  }, [link]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      // older browsers: select a hidden field and copy
      const ta = document.createElement("textarea");
      ta.value = link;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      try {
        document.execCommand("copy");
      } catch {
        /* the link is on screen to copy by hand */
      }
      ta.remove();
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  };

  const share = async () => {
    try {
      await navigator.share({
        title: "changle",
        text: lang === "zh" ? `来坐 ${code} 这桌` : `Join table ${code}`,
        url: link,
      });
    } catch {
      /* closed the share sheet */
    }
  };

  return (
    <div className="porcelain invite-card">
      <p className="invite-head">
        <span className={lang === "zh" ? "zh-display invite-label" : "en-display invite-label"}>{ui("tableCode")}</span>
        <span className="en-display invite-code code-plaque" aria-label={code.split("").join(" ")}>
          {code}
        </span>
      </p>
      <div className="invite-qr">
        {qr ? <div className="invite-qr-svg" dangerouslySetInnerHTML={{ __html: qr }} /> : <p style={{ padding: "var(--space-3)", textAlign: "center", color: "var(--night)" }}>{lang === "zh" ? `扫不了就输入桌号 ${code}` : `Can't scan? Enter table ${code}`}</p>}
      </div>
      <p className="hint-ink invite-help">{ui("inviteHelp")}</p>
      <p className="invite-link">{link.replace(/^https?:\/\//, "")}</p>
      <div className="row" style={{ gap: 10, width: "100%" }}>
        <button type="button" className="btn btn-ghost ink btn-block" onClick={copy}>
          {copied ? <Check size={16} /> : <Copy size={16} />}
          {copied ? ui("copied") : ui("copyLink")}
        </button>
        {canShare && (
          <button type="button" className="btn btn-primary btn-block" onClick={share}>
            <Share2 size={16} />
            {ui("share")}
          </button>
        )}
      </div>
    </div>
  );
}

export function InviteSheet({ open, onClose, code }: { open: boolean; onClose: () => void; code: string }) {
  const { ui } = useStore();
  return (
    <Sheet open={open} onClose={onClose} title={ui("invite")}>
      <InviteCard code={code} />
      <p className="hint" style={{ marginTop: 14, textAlign: "center" }}>
        {ui("onlineVoice")}
      </p>
    </Sheet>
  );
}
