/**
 * 结清图: the settle plan as a picture, from the settle tab's button (picture.ts says what is on it,
 * paint.ts draws it). It is made afresh each time the sheet opens, and again if the plan changes
 * while it is open, and the phone keeps when it was made, so the settle tab can say once it is out
 * of date.
 *
 * Sending it: where the phone can share a picture (iPhone's Safari, Android's Chrome), 发给朋友
 * opens the phone's own share sheet, and the group's chat app is in it. WeChat's own browser can't:
 * there a long press on the picture is how it is sent or saved, so the picture is the one thing in
 * 两清 that a long press opens a menu on (split.css). A computer saves it as a file. The plan can
 * still be copied as text, the way it was before the picture.
 */
import { Check, ClipboardCopy, Download, Share } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Lang } from "../i18n";
import { Button } from "../ui/Button";
import { Sheet } from "../ui/Sheet";
import { Skeleton } from "../ui/Skeleton";
import type { Ledger, Settlement } from "./core";
import { planText } from "./lines";
import { lookOf, paint, pngOf } from "./paint";
import { copyText } from "./parts";
import { pictureOf, stepsPrint } from "./picture";
import { byFinger, canShareFile, datedName, inWeChat, saveFile, shareFile } from "./share";
import { keepPicture } from "./store";
import { say } from "./words";

type Made = { file: File; url: string; width: number; height: number; text: string };

/** The picture as a data: address: what WeChat's long press saves and sends (it doesn't take a blob: one). */
const dataUrlOf = (blob: Blob): Promise<string> =>
  new Promise((done, fail) => {
    const reader = new FileReader();
    reader.onload = () => done(String(reader.result));
    reader.onerror = () => fail(reader.error);
    reader.readAsDataURL(blob);
  });


export function PictureSheet({ open, onClose, ledger, plan, lang }: { open: boolean; onClose: () => void; ledger: Ledger; plan: Settlement; lang: Lang }) {
  /** being made (undefined), couldn't be (null), or made */
  const [made, setMade] = useState<Made | null | undefined>(undefined);
  /** the phone said it could share the picture, then didn't (not just closed by its owner) */
  const [unshared, setUnshared] = useState(false);
  const [copied, setCopied] = useState<"done" | "failed" | null>(null);
  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(null), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  // what is on the picture, but for when it was made: a new picture only when that changes
  const content = useMemo(() => JSON.stringify(pictureOf(ledger, plan, lang, 0)), [ledger, plan, lang]);
  const latest = useRef({ ledger, plan, lang });
  latest.current = { ledger, plan, lang };
  useEffect(() => {
    if (!open) return;
    let gone = false;
    setMade(undefined);
    setUnshared(false);
    setCopied(null);
    void (async () => {
      const { ledger: l, plan: now, lang: words } = latest.current;
      const at = Date.now();
      const p = pictureOf(l, now, words, at);
      try {
        const canvas = await paint(p, lookOf());
        const png = await pngOf(canvas);
        const url = await dataUrlOf(png);
        if (gone) return;
        setMade({ file: new File([png], datedName(at, "png"), { type: "image/png" }), url, width: canvas.width, height: canvas.height, text: p.text });
        keepPicture(l.id, { at, print: stepsPrint(now) });
      } catch {
        if (!gone) setMade(null);
      }
    })();
    return () => {
      gone = true;
    };
  }, [open, content]);

  const shareable = !!made && !unshared && canShareFile(made.file);
  const weChat = inWeChat();
  // closed without sending: nothing to say; refused, and the picture is to be held (or saved) instead
  const share = async () => made && (await shareFile(made.file)) === "refused" && setUnshared(true);
  const save = () => made && saveFile(made.file);
  const hint = !made ? null : shareable ? "pictureHoldToo" : weChat || unshared ? "pictureHold" : byFinger() ? "pictureHoldToo" : null;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      lang={lang}
      category="tool"
      title={say(lang, "picture")}
      footer={
        <div className="split-picture-actions">
          {made && shareable && (
            <Button size="lg" block icon={Share} onClick={() => void share()}>
              {say(lang, "pictureShare")}
            </Button>
          )}
          {made && !shareable && !weChat && (
            <Button size="lg" block icon={Download} onClick={save}>
              {say(lang, "pictureSave")}
            </Button>
          )}
          <Button
            tone="quiet"
            block
            icon={copied === "done" ? Check : ClipboardCopy}
            onClick={async () => {
              const done = await copyText(planText(ledger, plan, lang));
              setCopied(done ? "done" : "failed");
            }}
          >
            {say(lang, copied === "done" ? "copied" : copied === "failed" ? "copyFailed" : "copyAsText")}
          </Button>
          {/* said aloud once; the button keeps a name of its own */}
          <span className="ui-visually-hidden" role="status">
            {copied ? say(lang, copied === "done" ? "copied" : "copyFailed") : ""}
          </span>
        </div>
      }
    >
      {made === undefined ? (
        <Skeleton lang={lang} lines={6} slowText={say(lang, "slow")} />
      ) : made === null ? (
        <p className="split-note">{say(lang, "pictureFailed")}</p>
      ) : (
        <div className="split-picture">
          {/* (above the picture: a long one runs past the bottom of the sheet) */}
          {hint && <p className={hint === "pictureHold" ? "split-picture-hint is-loud" : "split-picture-hint"}>{say(lang, hint)}</p>}
          <img src={made.url} alt={made.text} width={made.width} height={made.height} />
        </div>
      )}
    </Sheet>
  );
}
