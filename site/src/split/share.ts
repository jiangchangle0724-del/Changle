/**
 * Handing a file over (the 结清图, the exported expenses): through the phone's own share sheet where
 * it has one that takes files (iPhone's Safari, Android's Chrome), as a download where it doesn't (a
 * computer); and WeChat's own browser, which does neither, told apart so a sheet can say what to do
 * there instead. Checked in a browser (scripts/split_check.ts), with the share sheet stood in for.
 */

/** WeChat's own browser: no share sheet, and no downloads. */
export const inWeChat = () => /MicroMessenger/i.test(navigator.userAgent);

/** A phone (a finger, not a mouse): where a long press is how a picture is saved. */
export const byFinger = () => typeof matchMedia === "function" && matchMedia("(pointer: coarse)").matches;

/** Can this phone's share sheet take the file? */
export function canShareFile(file: File): boolean {
  try {
    return typeof navigator.canShare === "function" && typeof navigator.share === "function" && navigator.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/**
 * The file alone through the phone's share sheet (a chat app given words beside it may send only the
 * words): sent, closed without sending, or refused by the phone.
 */
export async function shareFile(file: File): Promise<"sent" | "closed" | "refused"> {
  try {
    await navigator.share({ files: [file] });
    return "sent";
  } catch (e) {
    return e instanceof DOMException && e.name === "AbortError" ? "closed" : "refused";
  }
}

/** The file saved as a download, under its own name. */
export function saveFile(file: File) {
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * A file's name: the same in either language, and in plain letters (a computer set to a language
 * without Chinese can't save a file named in it, and saves it as "download" instead), with the day.
 */
export function datedName(at: number, ext: "png" | "csv"): string {
  const d = new Date(at);
  const two = (n: number) => String(n).padStart(2, "0");
  return `all-square-${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}.${ext}`;
}
