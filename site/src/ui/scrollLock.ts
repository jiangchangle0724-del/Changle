/*
 * The page under an open sheet doesn't scroll. The locks are counted: with one sheet leaving while
 * the next comes in (its exit takes --dur-exit), each used to keep and put back the page's overflow
 * by itself, and the second could keep the first's "hidden" and put that back: the page stayed
 * locked once both had closed. The first lock keeps what the page had; the last one puts it back.
 */
let held = 0;
let before = "";

/** Locks the page's scrolling; call what it returns, once, to let go. */
export function lockScroll(): () => void {
  if (held++ === 0) {
    before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
  }
  let done = false;
  return () => {
    if (done) return;
    done = true;
    if (--held === 0) document.body.style.overflow = before;
  };
}
