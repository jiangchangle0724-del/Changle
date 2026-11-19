// A picture of the goods, as a merchant's phone makes it ready to send (src/server/photos.ts keeps
// it): two copies drawn on a canvas, one to look at (at most 1200 px across) and a small square one
// for the list (240 px), as WebP where the phone can write it and JPEG where it can't, made smaller
// until each fits. What the camera wrote about where the picture was taken doesn't come along: the
// canvas keeps only the picture.
import { uploadPhoto } from "../api";

const LARGE = 1200;
const SMALL = 240;
/** What the server takes (src/server/photos.ts), with room to spare. */
const LARGE_MAX = 440_000;
const SMALL_MAX = 58_000;

/** The picture, drawn `size` across at most: all of it, or the middle square of it. */
function canvasOf(picture: ImageBitmap, size: number, square: boolean): HTMLCanvasElement {
  const side = Math.min(picture.width, picture.height);
  const [sx, sy, sw, sh] = square ? [(picture.width - side) / 2, (picture.height - side) / 2, side, side] : [0, 0, picture.width, picture.height];
  const scale = Math.min(1, size / Math.max(sw, sh));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(sw * scale));
  canvas.height = Math.max(1, Math.round(sh * scale));
  const pen = canvas.getContext("2d");
  if (!pen) throw new Error("canvas");
  pen.imageSmoothingQuality = "high";
  pen.drawImage(picture, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return canvas;
}

const blobOf = (canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> => new Promise((done) => canvas.toBlob(done, type, quality));

/** The canvas as a file no bigger than `max`: WebP if this phone writes it, else JPEG, less finely each time it's too big. */
async function fileOf(canvas: HTMLCanvasElement, max: number): Promise<Blob> {
  for (const quality of [0.82, 0.7, 0.55, 0.4]) {
    for (const type of ["image/webp", "image/jpeg"]) {
      const blob = await blobOf(canvas, type, quality);
      // (a phone that can't write WebP hands back a PNG instead: try JPEG)
      if (blob && blob.type === type) {
        if (blob.size <= max) return blob;
        break;
      }
    }
  }
  throw new Error("big");
}

/** Make a picture from the phone ready, send it, and say its name on the server. */
export async function sendPhoto(slug: string, file: File): Promise<string> {
  const picture = await createImageBitmap(file);
  try {
    const large = await fileOf(canvasOf(picture, LARGE, false), LARGE_MAX);
    const small = await fileOf(canvasOf(picture, SMALL, true), SMALL_MAX);
    return (await uploadPhoto(slug, large, small)).id;
  } finally {
    picture.close();
  }
}
