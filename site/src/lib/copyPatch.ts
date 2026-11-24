import { emptyCopy, type CopyMap } from "../shared/copy";

/**
 * Swaps the owner's edits into the page (lib/copy.ts): every text node whose words, spaces aside,
 * are exactly an edited text, now and whenever the page changes. An edit counts on pages in both
 * languages (the site often shows a name in both); where he edited the same words differently on
 * each, the page's language wins. A node keeps what it said before, so a reset puts it back.
 */
const was = new WeakMap<Text, string>();
const wrote = new WeakMap<Text, string>();
let all: CopyMap = emptyCopy();
let words: Record<string, string> = {};
let watch: MutationObserver | null = null;
let langWatch: MutationObserver | null = null;
/** the editor's own sheet, and whatever people type into, stay as they are */
const SKIP = "script,style,textarea,[contenteditable],[data-copy-off]";

export const pageLang = (): "zh" | "en" => (document.documentElement.lang.startsWith("zh") ? "zh" : "en");

function swap(n: Text) {
  const v = n.nodeValue ?? "";
  if (wrote.get(n) === v) return;
  // React wrote over a node we had changed: what it says now is the original
  was.delete(n);
  wrote.delete(n);
  const core = v.trim();
  const to = core ? words[core] : undefined;
  if (to === undefined || to === core || n.parentElement?.closest(SKIP)) return;
  const next = v.replace(core, to);
  was.set(n, v);
  wrote.set(n, next);
  n.nodeValue = next;
}

function restore(n: Text) {
  const w = wrote.get(n);
  if (w === undefined) return;
  if (n.nodeValue === w) n.nodeValue = was.get(n) ?? w;
  was.delete(n);
  wrote.delete(n);
}

function each(root: Node, f: (n: Text) => void) {
  if (root.nodeType === Node.TEXT_NODE) return f(root as Text);
  if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) f(n as Text);
}

function relang() {
  const l = pageLang();
  words = { ...all[l === "zh" ? "en" : "zh"], ...all[l] };
  // (our own writes below aren't news to the observer)
  watch?.disconnect();
  each(document.body, restore);
  if (!Object.keys(words).length) return;
  each(document.body, swap);
  watch ??= new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === "characterData") swap(r.target as Text);
      else r.addedNodes.forEach((n) => each(n, swap));
    }
  });
  watch.observe(document.body, { subtree: true, childList: true, characterData: true });
}

export function applyCopy(m: CopyMap) {
  all = m;
  relang();
  if (!langWatch) {
    langWatch = new MutationObserver(relang);
    langWatch.observe(document.documentElement, { attributes: true, attributeFilter: ["lang"] });
  }
}

/** What a piece of text said before an edit, spaces aside (for the editor, account/CopyEditor.tsx). */
export const originalOf = (n: Text) => (was.get(n) ?? n.nodeValue ?? "").trim();
