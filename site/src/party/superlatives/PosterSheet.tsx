/**
 * 颁奖海报: the night's awards as one picture, from the ceremony's button (poster.ts draws it). Made
 * afresh each time the sheet opens. Handing it over works as the 两清 settle picture does: the phone's
 * own share sheet where it takes a picture (iPhone's Safari, Android's Chrome), a download on a
 * computer, and in WeChat's own browser, which does neither, a long press on the picture.
 */
import { Download, Share } from "lucide-react";
import { useEffect, useState } from "react";
import { GAME_BY_ID } from "../../games/registry";
import { byFinger, canShareFile, inWeChat, saveFile, shareFile } from "../../split/share";
import { useStore } from "../../store";
import { Button } from "../../ui/Button";
import { Sheet } from "../../ui/Sheet";
import { Skeleton } from "../../ui/Skeleton";
import { paintPoster, pngOf, posterName, type Poster } from "./poster";

type Made = { file: File; url: string; width: number; height: number };

/** The picture as a data: address: what WeChat's long press saves and sends (it doesn't take a blob: one). */
const dataUrlOf = (blob: Blob): Promise<string> =>
  new Promise((done, fail) => {
    const reader = new FileReader();
    reader.onload = () => done(String(reader.result));
    reader.onerror = () => fail(reader.error);
    reader.readAsDataURL(blob);
  });

export function PosterSheet({ open, onClose, poster }: { open: boolean; onClose: () => void; poster: () => Poster }) {
  const { lang } = useStore();
  const zh = lang === "zh";
  /** being made (undefined), couldn't be (null), or made */
  const [made, setMade] = useState<Made | null | undefined>(undefined);
  /** the phone said it could share the picture, then didn't */
  const [unshared, setUnshared] = useState(false);

  useEffect(() => {
    if (!open) return;
    let gone = false;
    setMade(undefined);
    setUnshared(false);
    void (async () => {
      try {
        const canvas = await paintPoster(poster());
        const png = await pngOf(canvas);
        const url = await dataUrlOf(png);
        if (gone) return;
        setMade({ file: new File([png], posterName(Date.now()), { type: "image/png" }), url, width: canvas.width, height: canvas.height });
      } catch {
        if (!gone) setMade(null);
      }
    })();
    return () => {
      gone = true;
    };
    // (the poster is what the ceremony shows when the sheet opens; it doesn't change while it is open)
  }, [open]);

  const shareable = !!made && !unshared && canShareFile(made.file);
  const weChat = inWeChat();
  const share = async () => made && (await shareFile(made.file)) === "refused" && setUnshared(true);
  const hold = zh ? "长按图片保存，或者发给朋友" : "Press and hold the picture to save it or send it";
  const holdToo = zh ? "也可以长按图片保存" : "You can also press and hold the picture to save it";
  const hint = !made ? null : weChat || unshared ? hold : shareable || byFinger() ? holdToo : null;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      lang={lang}
      category="brain"
      gel={GAME_BY_ID.superlatives.gel}
      title={zh ? "颁奖海报" : "The awards poster"}
      footer={
        made ? (
          <div className="sup-poster-actions">
            {shareable && (
              <Button size="lg" block icon={Share} onClick={() => void share()}>
                {zh ? "发给朋友" : "Send it"}
              </Button>
            )}
            {!shareable && !weChat && (
              <Button size="lg" block icon={Download} onClick={() => saveFile(made.file)}>
                {zh ? "保存图片" : "Save the picture"}
              </Button>
            )}
          </div>
        ) : undefined
      }
    >
      {made === undefined ? (
        <Skeleton lang={lang} lines={6} />
      ) : made === null ? (
        <p className="hint">{zh ? "这台手机画不出海报。截个屏也行。" : "This phone couldn't draw the poster. A screenshot works too."}</p>
      ) : (
        <div className="sup-poster">
          {hint && <p className={`sup-poster-hint ${weChat || unshared ? "is-loud" : ""}`}>{hint}</p>}
          <img src={made.url} alt={zh ? "颁奖海报" : "The awards poster"} width={made.width} height={made.height} />
        </div>
      )}
    </Sheet>
  );
}
