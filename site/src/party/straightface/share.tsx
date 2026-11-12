/**
 * The end of 一本正经: tonight's titles on the end screen, and the picture to share (the words the
 * table learned, the titles, a code to come and play). The picture is drawn in the phone when asked
 * for (picture.ts, loaded then), and shared or saved from a sheet; on WeChat, where neither works,
 * pressing and holding the picture saves it.
 */
import { ImageDown, Share2 } from "lucide-react";
import { useRef, useState } from "react";
import { GAME_BY_ID } from "../../games/registry";
import type { T } from "../../i18n";
import type { Awards } from "../../shared/straightface/types";
import { useStore } from "../../store";
import { Sheet } from "../../ui/Sheet";
import { Skeleton } from "../../ui/Skeleton";
import { BACKDROP, ROLE_ART, VERDICT_ART } from "./art";
import { useSay } from "./parts";
import type { Picture } from "./picture";
import { S } from "./text";

/** What the end of a game has to show and share, from either screen (one phone, or a phone at a table). */
export type Tonight = {
  words: { term: T; definition: T }[];
  awards: Awards;
  name: (id: string) => string;
  score: (id: string) => number;
  /** online: the audience's board (right bets over the game), when there was an audience */
  crowd?: Record<string, number>;
};

type Title = { key: "top" | "bluffer" | "bettor" | "crowd"; art: string; label: string; names: string; note: string };

/** Tonight's titles as the screen and the picture word them; a title nobody earned is left out. */
function useTitles(tonight: Tonight): Title[] {
  const say = useSay();
  const { lang } = useStore();
  const a = tonight.awards;
  const names = (ids: string[]) => ids.map(tonight.name).join(lang === "zh" ? "、" : ", ");
  const out: Title[] = [];
  if (a.top.length) out.push({ key: "top", art: VERDICT_ART.master, label: say(S.awardTop), names: names(a.top), note: say(S.scorePoints, { n: tonight.score(a.top[0]) }) });
  if (a.bettor.length) {
    const n = a.rightBets[a.bettor[0]] ?? 0;
    out.push({ key: "bettor", art: VERDICT_ART.right, label: say(S.awardBettor), names: names(a.bettor), note: n === 1 ? say(S.rightBetOnce) : say(S.rightBets, { n }) });
  }
  if (a.bluffer.length) {
    const n = a.fooled[a.bluffer[0]] ?? 0;
    out.push({ key: "bluffer", art: ROLE_ART.bluffer, label: say(S.awardBluffer), names: names(a.bluffer), note: n === 1 ? say(S.fooledOnce) : say(S.fooledTimes, { n }) });
  }
  // the audience's best: who backed the honest one most often (at least once)
  const crowd = Object.entries(tonight.crowd ?? {});
  const best = Math.max(0, ...crowd.map(([, n]) => n));
  if (best > 0) {
    out.push({ key: "crowd", art: ROLE_ART.honest, label: say(S.awardCrowd), names: names(crowd.filter(([, n]) => n === best).map(([id]) => id)), note: best === 1 ? say(S.rightBetOnce) : say(S.rightBets, { n: best }) });
  }
  return out;
}

/** The end screen's panel of tonight's titles. */
export function Titles({ tonight }: { tonight: Tonight }) {
  const say = useSay();
  const titles = useTitles(tonight);
  if (!titles.length) return null;
  return (
    <div className="panel sf-panel">
      <span className="field-label">{say(S.titles)}</span>
      <ul className="sf-titles">
        {titles.map((x) => (
          <li key={x.key}>
            <img src={x.art} alt="" width={56} height={56} />
            <span className="sf-title-label">{x.label}</span>
            <strong>{x.names}</strong>
            <span className="hint">{x.note}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");

/** "Save it as a picture": drawn once per end screen and language, then shared or saved from a sheet. */
export function SharePicture({ tonight }: { tonight: Tonight }) {
  const say = useSay();
  const { lang } = useStore();
  const titles = useTitles(tonight);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<"drawing" | "ready" | "failed">("drawing");
  const [src, setSrc] = useState("");
  const made = useRef<{ lang: string; file: File } | null>(null);
  const game = GAME_BY_ID.straightface;

  const make = async () => {
    setOpen(true);
    if (made.current?.lang === lang) return;
    setState("drawing");
    try {
      const now = new Date();
      const picture: Picture = {
        lang,
        title: game.name[lang],
        subtitle: say(S.picWords, { n: tonight.words.length }),
        date: now.toLocaleDateString(lang === "zh" ? "zh-CN" : "en-CA", { year: "numeric", month: "long", day: "numeric" }),
        words: tonight.words.map((w) => ({ term: w.term[lang], definition: w.definition[lang] })),
        titlesHeading: say(S.titles),
        titles: titles.map(({ art, label, names, note }) => ({ art, label, names, note })),
        scan: say(S.picScan),
        url: `${window.location.origin}/g/${game.slug}`,
        site: window.location.host,
        backdrop: BACKDROP,
        gel: game.gel,
      };
      const { drawPicture } = await import("./picture");
      const canvas = await drawPicture(picture);
      const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/png"));
      if (!blob) throw new Error("picture: no image");
      const name = `changle-${game.slug}-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.png`;
      made.current = { lang, file: new File([blob], name, { type: "image/png" }) };
      setSrc(canvas.toDataURL("image/png"));
      setState("ready");
    } catch {
      made.current = null;
      setState("failed");
    }
  };

  const file = made.current?.file ?? null;
  const canShare = !!file && typeof navigator.canShare === "function" && navigator.canShare({ files: [file] });
  const share = async () => {
    if (!file) return;
    try {
      await navigator.share({ files: [file], title: game.name[lang] });
    } catch {
      /* the player closed the share sheet */
    }
  };

  return (
    <>
      <button type="button" className="btn btn-ghost btn-block sf-share-btn" onClick={() => void make()}>
        <ImageDown size={18} aria-hidden="true" /> {say(S.shareButton)}
      </button>
      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        lang={lang}
        gel={game.gel}
        title={say(S.shareTitle)}
        footer={
          state === "ready" && file ? (
            <div className="row sf-share-actions">
              {canShare && (
                <button type="button" className="btn btn-primary btn-lg" onClick={() => void share()}>
                  <Share2 size={18} aria-hidden="true" /> {say(S.shareSend)}
                </button>
              )}
              <a className={`btn btn-lg ${canShare ? "btn-ghost" : "btn-primary"}`} href={src} download={file.name}>
                <ImageDown size={18} aria-hidden="true" /> {say(S.shareSave)}
              </a>
            </div>
          ) : undefined
        }
      >
        <div className="stack sf-share">
          {state === "drawing" && <Skeleton lang={lang} lines={4} height="var(--tap)" />}
          {state === "failed" && (
            <>
              <p className="hint" role="alert">
                {say(S.shareFailed)}
              </p>
              <button type="button" className="btn btn-primary btn-lg btn-block" onClick={() => void make()}>
                {say(S.shareRetry)}
              </button>
            </>
          )}
          {state === "ready" && file && (
            <>
              <p className="hint">{say(S.shareHint)}</p>
              <img className="sf-share-img" src={src} alt={say(S.shareAlt)} />
            </>
          )}
        </div>
      </Sheet>
    </>
  );
}
