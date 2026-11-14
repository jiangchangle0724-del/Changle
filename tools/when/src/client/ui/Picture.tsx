// The sheet with a picture to pass around: the invitation, or the result once the time is set.
// The picture is drawn when the sheet opens (../picture.ts). In WeChat a page can neither share
// nor download, so pressing and holding the picture is how it's saved or sent on: the page allows
// that on the picture and nowhere else. Other browsers get buttons for both as well.
import { useEffect, useRef, useState } from "preact/hooks";
import { dateLabel, dayLabel, reason, whenLabel } from "../../engine";
import type { EventState, Lang, Person, Tally } from "../../engine";
import inviteBg from "../art/invite-bg.webp";
import resultBg from "../art/result-bg.webp";
import { t } from "../i18n";
import { drawPicture, type Picture } from "../picture";
import { Sheet, inWeChat, useLang } from "./common";

/** The tool's name on a picture: both of its names, whoever reads it. */
const BRAND = "约时间 · When Works";
/** The address as people say it: without the https. */
const bare = (link: string) => link.replace(/^https?:\/\//, "");

/** Which days a gathering asks about, as its page says it. */
export const daysLine = (state: EventState, lang: Lang): string => {
  const first = state.days[0];
  return state.days.length === 1 ? dayLabel(first, lang) : t("rangeTo", { from: dateLabel(first, lang), to: dateLabel(state.days[state.days.length - 1], lang) });
};

/** The invitation: what it is, which days, a code that leads to its page. */
export function invitePicture(state: EventState, link: string, lang: Lang): Picture {
  return { kind: "invite", brand: BRAND, title: state.title, headline: t("picAsk"), detail: daysLine(state, lang), scan: t("picScanInvite"), url: link, site: bare(link), backdrop: inviteBg };
}

/** The result: when it is and who can make it, in the words the page uses. */
export function resultPicture(state: EventState, tally: Tally, people: readonly Person[], link: string, lang: Lang): Picture {
  const headline = whenLabel(tally.day, tally.part, lang, state.settled?.from, state.settled?.to);
  return { kind: "result", brand: BRAND, title: state.title, label: t("picSet"), headline, detail: reason(tally, people, lang), scan: t("picScanResult"), url: link, site: bare(link), backdrop: resultBg };
}

type Made = "drawing" | "failed" | { src: string; file: File | null };

/** `file` is the name the picture is saved under. */
export function PictureSheet({ picture, title, alt, file, onClose }: { picture: Picture; title: string; alt: string; file: string; onClose: () => void }) {
  useLang();
  const [made, setMade] = useState<Made>("drawing");
  const open = useRef(true);

  const draw = async () => {
    setMade("drawing");
    try {
      const canvas = await drawPicture(picture);
      // a JPEG: about a quarter of the PNG's size, which matters when it's sent on in a chat
      const src = canvas.toDataURL("image/jpeg", 0.92);
      const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/jpeg", 0.92));
      let asFile: File | null = null;
      try {
        if (blob) asFile = new File([blob], file, { type: "image/jpeg" });
      } catch {
        /* a browser too old to make a file: nothing to share, the picture still shows */
      }
      if (open.current) setMade({ src, file: asFile });
    } catch {
      if (open.current) setMade("failed");
    }
  };
  useEffect(() => {
    void draw();
    return () => {
      open.current = false;
    };
  }, []);

  const ready = typeof made === "object" ? made : null;
  const toShare = ready?.file;
  const canShare = !!toShare && typeof navigator.canShare === "function" && navigator.canShare({ files: [toShare] });
  const share = async () => {
    if (!toShare) return;
    try {
      await navigator.share({ files: [toShare], title: picture.title });
    } catch {
      /* they closed the phone's share sheet */
    }
  };

  return (
    <Sheet
      title={title}
      onClose={onClose}
      footer={
        ready && !inWeChat() ? (
          <div class="row share-actions">
            {canShare && (
              <button type="button" class="btn btn-primary" onClick={() => void share()}>
                {t("picShare")}
              </button>
            )}
            <a class={`btn ${canShare ? "btn-quiet" : "btn-primary"}`} href={ready.src} download={file}>
              {t("picSave")}
            </a>
          </div>
        ) : undefined
      }
    >
      {made === "drawing" && (
        <p class="share-wait" role="status">
          {t("picDrawing")}
        </p>
      )}
      {made === "failed" && (
        <>
          <p class="problem" role="alert">
            {t("picFailed")}
          </p>
          <button type="button" class="btn btn-primary btn-block" onClick={() => void draw()}>
            {t("picRetry")}
          </button>
        </>
      )}
      {ready && (
        <>
          <p class="hint">{t("picHint")}</p>
          <img class="share-img" src={ready.src} alt={alt} width={1080} height={1440} />
        </>
      )}
    </Sheet>
  );
}
