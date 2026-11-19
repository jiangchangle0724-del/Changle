/*
 * The page's scroll lock under open sheets (src/ui/scrollLock.ts). Run with `npx tsx tests/scroll-lock.test.ts`
 * Sheets that open and close over each other, in any order, leave the page as it was.
 */
const body = { style: { overflow: "" } };
(globalThis as unknown as { document: unknown }).document = { body };
const { lockScroll } = await import("../src/ui/scrollLock");

let failed = 0;
function ok(cond: unknown, msg: string) {
  if (cond) console.log("ok  ", msg);
  else {
    failed++;
    console.log("FAIL", msg);
  }
}

const a = lockScroll();
ok(body.style.overflow === "hidden", "a sheet opens: the page is locked");
const b = lockScroll();
a();
ok(body.style.overflow === "hidden", "the first closes while the next is open: still locked");
b();
ok(body.style.overflow === "", "the last closes: the page scrolls again");
b();
ok(body.style.overflow === "", "letting go twice changes nothing");

body.style.overflow = "clip";
const c = lockScroll();
const d = lockScroll();
d();
c();
ok(body.style.overflow === "clip", "what the page had before is what it gets back");

if (failed) {
  console.log(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log("\nall passed");
