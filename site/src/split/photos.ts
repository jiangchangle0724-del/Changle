/**
 * Receipt photos (the plan's 每笔能挂照片, 每人 500 MB): what a phone does before a photo goes, and
 * how the server's answers are said. The server keeps them (tools/split, its protocol.ts says the
 * addresses and limits; the numbers here are the same ones); an expense keeps their ids (changes.ts).
 *
 * A photo is made smaller on the phone before it is sent: its long side to PHOTO_EDGE pixels, as a
 * JPEG, which is about 300 KB for a receipt. A PDF goes as it is. The sums here are plain and tested
 * (tests/split-screens.test.ts); `shrink` needs a browser (scripts/split_check.ts).
 */
import type { Word } from "./words";

/** The long side of a photo as it is sent. */
export const PHOTO_EDGE = 1600;
/** How much of a photo's detail a JPEG keeps: a receipt's print stays sharp, and the file small. */
const QUALITY = 0.82;
const MB = 1024 * 1024;
/** The biggest file the server takes, and an account's room in all, and when the phone says it is filling (the server's FILE_MAX, QUOTA, WARN_AT). */
export const FILE_MAX = 10 * MB;
export const QUOTA = 500 * MB;
export const WARN_AT = 400 * MB;

/** What a file may be, as the server takes them (and gives them back). */
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const PDF = "application/pdf";
export const KINDS = [...PHOTO_TYPES, PDF];
/**
 * What the phone's picker offers: the kinds the server takes. (Named, not "any image": an iPhone
 * then turns its own HEIC photos into JPEGs as it hands them over, which every phone can draw.)
 */
export const PICKS = KINDS.join(",");

/** A picture's size with its long side at most `edge`, the shape kept; one smaller already is left as it is. */
export function fitWithin(width: number, height: number, edge = PHOTO_EDGE): { width: number; height: number } {
  const long = Math.max(width, height);
  if (long <= edge) return { width, height };
  const scale = edge / long;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

/** Megabytes as the phone says them: whole ones, never 0 for something that takes room. */
export const megabytes = (bytes: number) => String(bytes > 0 ? Math.max(1, Math.round(bytes / MB)) : 0);

/** Why a photo wasn't added, as the server (or this phone) says it. */
export type PhotoTrouble = "signin" | "quota" | "limit" | "big" | "bad" | "locked" | "notYet" | "away" | "gone" | "key";

/** What the screen says for each. */
export const TROUBLE_WORD: Record<PhotoTrouble, Word> = {
  signin: "photoSignIn",
  quota: "photoQuota",
  limit: "photoLimit",
  big: "photoBig",
  bad: "photoBad",
  locked: "photoLocked",
  notYet: "photoNotYet",
  away: "photoAway",
  gone: "photoGone",
  key: "photoKey",
};

/** The server's refusal (its status and the error it names) as the trouble the screen says; none for one this phone doesn't know. */
export function troubleOf(status: number, error: unknown): PhotoTrouble {
  if (status === 401) return "signin";
  if (status === 413) return error === "quota" ? "quota" : "big";
  if (status === 429) return "limit";
  if (status === 423) return "locked";
  if (status === 403) return "key";
  if (status === 404 && error === "gone") return "gone";
  if (status === 400) return "bad";
  return "away";
}

/**
 * A file as it is sent: a photo made smaller (long side PHOTO_EDGE, as a JPEG); a PDF as it is.
 * "big" for one over FILE_MAX after that, "bad" for one that is neither, or a photo this phone
 * can't open (and isn't one the server would take as it is).
 */
export async function shrink(file: File): Promise<{ blob: Blob; type: string } | { error: "big" | "bad" }> {
  const type = file.type.toLowerCase();
  if (type === PDF) return file.size > FILE_MAX ? { error: "big" } : { blob: file, type: PDF };
  if (!type.startsWith("image/")) return { error: "bad" };
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
    const size = fitWithin(bitmap.width, bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    // (paper behind a see-through screenshot, which a JPEG would otherwise make black: the photo's, not a colour of the site's)
    ctx.fillStyle = "white";
    ctx.fillRect(0, 0, size.width, size.height);
    ctx.drawImage(bitmap, 0, 0, size.width, size.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((done) => canvas.toBlob(done, "image/jpeg", QUALITY));
    if (!blob) throw new Error("no picture");
    return blob.size > FILE_MAX ? { error: "big" } : { blob, type: "image/jpeg" };
  } catch {
    // (a photo this phone can't draw: as it is, when the server would take it)
    if (!PHOTO_TYPES.includes(type)) return { error: "bad" };
    return file.size > FILE_MAX ? { error: "big" } : { blob: file, type };
  }
}
