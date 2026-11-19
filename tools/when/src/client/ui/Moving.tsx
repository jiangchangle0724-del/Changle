// A list whose items slide to their new places when their order changes (最佳前三变了会平滑换位),
// and one that joins it rises into place. With the phone set to reduce motion they simply change
// places. Each item carries its `data-key`.
import type { ComponentChildren } from "preact";
import { useLayoutEffect, useRef } from "preact/hooks";

/** A token's time in milliseconds ("400ms"). */
const ms = (value: string) => (value.trim().endsWith("ms") ? parseFloat(value) : parseFloat(value) * 1000) || 0;

export function MovingList({ class: name, children }: { class: string; children: ComponentChildren }) {
  const list = useRef<HTMLOListElement>(null);
  // the order, and where each item stood in the list, as of the last time it was drawn
  const last = useRef<{ order: string; tops: Map<string, number> } | null>(null);

  useLayoutEffect(() => {
    const el = list.current;
    if (!el) return;
    const items = [...el.children].filter((item): item is HTMLElement => item instanceof HTMLElement && !!item.dataset.key);
    const tops = new Map(items.map((item) => [item.dataset.key!, item.offsetTop]));
    const order = [...tops.keys()].join(" ");
    const before = last.current;
    last.current = { order, tops };
    if (!before || before.order === order || typeof el.animate !== "function" || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    // the site's own timings (tokens.css)
    const style = getComputedStyle(el);
    const easing = style.getPropertyValue("--ease-out").trim() || "ease-out";
    const shift = style.getPropertyValue("--motion-shift").trim() || "0px";
    for (const item of items) {
      for (const running of item.getAnimations?.() ?? []) running.cancel();
      const from = before.tops.get(item.dataset.key!);
      const to = tops.get(item.dataset.key!)!;
      if (from === undefined) {
        // new in the list: it rises into its place
        item.animate(
          [
            { opacity: 0, transform: `translateY(${shift})` },
            { opacity: 1, transform: "none" },
          ],
          { duration: ms(style.getPropertyValue("--dur-enter")), easing },
        );
      } else if (from !== to) {
        // from where it stood to where it stands now
        item.animate([{ transform: `translateY(${from - to}px)` }, { transform: "none" }], { duration: ms(style.getPropertyValue("--dur-emphasis")), easing });
      }
    }
  });

  return (
    <ol class={name} ref={list}>
      {children}
    </ol>
  );
}
