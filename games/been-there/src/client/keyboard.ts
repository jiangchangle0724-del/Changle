// A phone's on-screen keyboard covers the bottom of the screen without making the page any shorter
// (iPhones, and Chrome on Android): a sheet or the play window, fixed to the bottom of the screen, would
// be typed into behind it (a trade's amounts, a sealed bid). While a field has the keyboard up, --kb is
// how much of the screen's bottom it covers and --vvh how tall the part above it is: styles.css lifts the
// sheets and the play window over it (.kb-open), and the field is scrolled into sight inside its sheet.
// Fields in the page itself (a name in the lobby) the browser brings into sight on its own.

const FIELD = "input:not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]), textarea, select";
/** What scrolls inside a sheet or a window over the page. */
const BOX = ".sheet, .playwin-body, .quizpop";

export function installKeyboard() {
  const vv = typeof window !== "undefined" ? window.visualViewport : null;
  if (!vv) return;
  const root = document.documentElement;
  let shown = "";
  const update = () => {
    const el = document.activeElement;
    const typing = !!el && el.matches(FIELD);
    const covered = Math.round(innerHeight - vv.height - vv.offsetTop);
    // (two fingers zooming in shrink the visible part too: only a keyboard over a field counts)
    const kb = typing && vv.scale < 1.05 && covered > 60 ? covered : 0;
    const now = `${kb}:${Math.round(vv.height)}`;
    if (now === shown) return;
    shown = now;
    root.style.setProperty("--kb", `${kb}px`);
    root.style.setProperty("--vvh", `${Math.round(vv.height)}px`);
    root.classList.toggle("kb-open", kb > 0);
    if (kb && el instanceof HTMLElement) requestAnimationFrame(() => keepInSight(el));
  };
  vv.addEventListener("resize", update);
  vv.addEventListener("scroll", update);
  // (the keyboard comes and goes with the field: a moment later the visible part has its new size)
  document.addEventListener("focusin", () => window.setTimeout(update, 60));
  document.addEventListener("focusout", () => window.setTimeout(update, 60));
  update();
}

/** Scroll a field into sight inside the sheet or window it's in, above the keyboard. */
export function keepInSight(el: HTMLElement) {
  const box = el.closest<HTMLElement>(BOX);
  if (!box) return;
  const r = el.getBoundingClientRect();
  const b = box.getBoundingClientRect();
  const room = 16;
  if (r.bottom > b.bottom - room) box.scrollTop += r.bottom - b.bottom + room;
  else if (r.top < b.top + room) box.scrollTop -= b.top + room - r.top;
}
