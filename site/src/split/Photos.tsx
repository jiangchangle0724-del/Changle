/**
 * Receipt photos on the screen (the plan's 每笔能挂照片): the button at the end of 记一笔's note line,
 * the sheet of an expense's photos, and one seen whole. What is sent, and how, is syncing.ts
 * (sendPhoto, photoOf, dropPhoto) and photos.ts; which photos an expense keeps is 记一笔's to say
 * (AddExpense.tsx).
 *
 * The button shows the first photo, small, and how many there are; with none, a camera. A photo opens
 * whole from the sheet, and is taken off from there. Adding one needs a sign-in (the photo is
 * charged to the account): signed out, the sheet says so, with 登录.
 */
import { Camera, CircleAlert, FileText, ImageOff, LogIn, Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState, type RefObject } from "react";
import type { Lang } from "../i18n";
import { useBackCloses } from "../router";
import { Button } from "../ui/Button";
import { Sheet } from "../ui/Sheet";
import { MAX_FILES } from "./changes";
import { PDF, PICKS } from "./photos";
import { photoOf } from "./syncing";
import { say } from "./words";

type Picture = { url: string; type: string } | null | undefined;

/** One of a ledger's photos, fetched once while the page is open: undefined while it comes, null when it can't. */
function usePicture(ledger: string, file: string | undefined): Picture {
  const [picture, setPicture] = useState<Picture>(undefined);
  useEffect(() => {
    if (!file) return;
    let gone = false;
    setPicture(undefined);
    void photoOf(ledger, file).then((got) => !gone && setPicture(got));
    return () => {
      gone = true;
    };
  }, [ledger, file]);
  return picture;
}

/** A photo as small as a tile: the picture, a PDF's mark, or that it is gone. */
export function Thumb({ ledger, file, lang }: { ledger: string; file: string; lang: Lang }) {
  const picture = usePicture(ledger, file);
  if (picture === undefined) return <span className="split-thumb is-loading" />;
  if (picture === null)
    return (
      <span className="split-thumb is-gone">
        <ImageOff aria-hidden="true" />
        <span className="ui-visually-hidden">{say(lang, "photoMissing")}</span>
      </span>
    );
  if (picture.type === PDF)
    return (
      <span className="split-thumb is-pdf">
        <FileText aria-hidden="true" />
        <span>PDF</span>
      </span>
    );
  return <img className="split-thumb" src={picture.url} alt="" />;
}

/**
 * The phone's own picker (its photos, its camera, its files), hidden: a button opens it, and is
 * what a screen reader finds (this is out of its way, as it is out of the way of a tap).
 */
export function PhotoPicker({ input, onPick }: { input: RefObject<HTMLInputElement | null>; onPick: (chosen: File[]) => void }) {
  return (
    <input
      ref={input}
      className="ui-visually-hidden"
      type="file"
      accept={PICKS}
      multiple
      tabIndex={-1}
      aria-hidden="true"
      onChange={(e) => {
        const chosen = [...(e.target.files ?? [])];
        // (so the same photo can be chosen again)
        e.target.value = "";
        if (chosen.length) onPick(chosen);
      }}
    />
  );
}

/** The note line's button: a camera, or the first photo and how many; busy while one is sending. */
export function PhotoButton({ ledger, files, sending, scanning = false, lang, onPress }: { ledger: string; files: string[]; sending: boolean; scanning?: boolean; lang: Lang; onPress: () => void }) {
  const label = sending ? say(lang, "photoSending") : files.length ? say(lang, "photosCount", { n: files.length }) : say(lang, "addPhoto");
  return (
    // (being read: the light sweeps over the photo too, as it does where the amount will be)
    <button type="button" className={`split-photo-button${sending ? " is-sending" : ""}${scanning ? " is-scanning" : ""}`} onClick={onPress} aria-busy={sending || undefined}>
      {/* (named by words a screen reader reads, and by what shows: a PDF's mark is in its name too) */}
      <span className="ui-visually-hidden">{label} </span>
      {files.length ? <Thumb ledger={ledger} file={files[0]} lang={lang} /> : <Camera aria-hidden="true" />}
      {files.length > 1 && (
        <span className="split-photo-count" aria-hidden="true">
          {files.length}
        </span>
      )}
      {/* sending: the shared buttons' own busy mark (a turning ring; three dots with reduced motion) */}
      {sending && (
        <span className="ui-button-progress" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
      )}
    </button>
  );
}

/**
 * An expense's photos: each opens whole in the same sheet (✕, Esc or the back button go back to
 * them: one sheet, so no sheet is ever still sliding away when the next press comes); one more is
 * added from the foot of the sheet.
 */
export function PhotosSheet({
  open,
  onClose,
  ledger,
  files,
  sending,
  signedIn,
  note,
  lang,
  onPick,
  onRemove,
  onSignIn,
}: {
  open: boolean;
  onClose: () => void;
  ledger: string;
  files: string[];
  sending: boolean;
  signedIn: boolean;
  /** why the last photo didn't go, said here (a toast would be under the sheet) */
  note: string | null;
  lang: Lang;
  onPick: (chosen: File[]) => void;
  onRemove: (file: string) => void;
  onSignIn: () => void;
}) {
  const [viewing, setViewing] = useState<string | null>(null);
  // (one taken off, here or on another phone, is seen no more)
  const seen = viewing && files.includes(viewing) ? viewing : null;
  useBackCloses(open && !!seen, () => setViewing(null));
  useEffect(() => {
    if (open) setViewing(null);
  }, [open]);
  // where the focus goes as the view changes: to the photo seen whole, then back to its tile
  const tiles = useRef(new Map<string, HTMLButtonElement>());
  const whole = useRef<HTMLDivElement>(null);
  const last = useRef<string | null>(null);
  useEffect(() => {
    if (seen) {
      last.current = seen;
      whole.current?.focus();
    } else if (last.current) {
      tiles.current.get(last.current)?.focus();
      last.current = null;
    }
  }, [seen]);
  // (a picker of the sheet's own: while a sheet is open, everything outside it is out of reach)
  const picker = useRef<HTMLInputElement>(null);
  const full = files.length >= MAX_FILES;
  const at = seen ? files.indexOf(seen) : -1;
  return (
    <Sheet
      open={open}
      onClose={() => (seen ? setViewing(null) : onClose())}
      lang={lang}
      category="tool"
      title={seen ? say(lang, "photoNth", { n: at + 1, of: files.length }) : say(lang, "photos")}
      footer={
        seen ? (
          <Button
            tone="quiet"
            block
            icon={Trash2}
            onClick={() => {
              setViewing(null);
              onRemove(seen);
            }}
          >
            {say(lang, "photoRemove")}
          </Button>
        ) : !signedIn ? (
          <div className="split-photos-foot">
            <p className="split-note">{say(lang, "photoSignIn")}</p>
            <Button size="lg" block icon={LogIn} onClick={onSignIn}>
              {say(lang, "signIn")}
            </Button>
          </div>
        ) : (
          <div className="split-photos-foot">
            {/* (read out as it comes; with nothing to say, there for that and out of the way) */}
            <p className={note ? "split-note is-off" : full ? "split-note" : "ui-visually-hidden"} role="status">
              {note && <CircleAlert aria-hidden="true" />}
              {note ?? (full ? say(lang, "photoMax") : "")}
            </p>
            {!full && (
              <Button size="lg" block icon={files.length ? Plus : Camera} busy={sending} onClick={() => picker.current?.click()}>
                {say(lang, sending ? "photoSending" : files.length ? "addAnother" : "addPhoto")}
              </Button>
            )}
          </div>
        )
      }
    >
      <PhotoPicker input={picker} onPick={onPick} />
      {seen ? (
        <Whole ledger={ledger} file={seen} lang={lang} focus={whole} />
      ) : (
        files.length > 0 && (
          <ul className="split-photos">
            {files.map((f, i) => (
              <li key={f}>
                <button
                  type="button"
                  className="split-photo-tile"
                  ref={(b) => {
                    if (b) tiles.current.set(f, b);
                    else tiles.current.delete(f);
                  }}
                  onClick={() => setViewing(f)}
                >
                  <span className="ui-visually-hidden">
                    {say(lang, "photoView")} {i + 1}{" "}
                  </span>
                  <Thumb ledger={ledger} file={f} lang={lang} />
                </button>
              </li>
            ))}
          </ul>
        )
      )}
    </Sheet>
  );
}

/** One photo, as wide as the sheet (two fingers zoom it, as anywhere on the page); a PDF opens in the phone's own viewer. */
function Whole({ ledger, file, lang, focus }: { ledger: string; file: string; lang: Lang; focus: RefObject<HTMLDivElement | null> }) {
  const picture = usePicture(ledger, file);
  return (
    <div className="split-photo-whole" ref={focus} tabIndex={-1}>
      {picture === undefined ? (
        <span className="split-thumb is-loading" />
      ) : picture === null ? (
        <p className="split-note">
          <ImageOff aria-hidden="true" />
          {say(lang, "photoMissing")}
        </p>
      ) : picture.type === PDF ? (
        <Button tone="quiet" block icon={FileText} onClick={() => window.open(picture.url, "_blank", "noopener")}>
          {say(lang, "photoOpen")}
        </Button>
      ) : (
        <img src={picture.url} alt={say(lang, "photos")} />
      )}
    </div>
  );
}
