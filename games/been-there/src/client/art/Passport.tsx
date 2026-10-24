// A team's passport: two pages at a time, a stamp for every city it has landed on, in landing order.
import { Stamp } from "./stamps";

/** A small stable number from a string, so each stamp keeps its tilt and nudge. */
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
}

export function PassportBook({ ids, lang, fresh, empty }: { ids: string[]; lang: "zh" | "en"; fresh?: string; empty: string }) {
  const pages: string[][] = [];
  for (let i = 0; i < Math.max(ids.length, 1); i += 4) pages.push(ids.slice(i, i + 4));
  if (pages.length % 2) pages.push([]);
  const spreads: string[][][] = [];
  for (let i = 0; i < pages.length; i += 2) spreads.push([pages[i], pages[i + 1]]);
  return (
    <div class="passport-book">
      {spreads.map((spread, si) => (
        <div class="passport" key={si}>
          {spread.map((page, pi) => (
            <div class="passport-page" key={pi}>
              {page.map((id) => {
                const r = hash(id);
                return (
                  <div key={id} class="slot" style={{ transform: `translate(${(r - 0.5) * 10}px, ${(hash(id + "y") - 0.5) * 10}px)` }}>
                    <Stamp id={id} size={92} turn={(r - 0.5) * 24} lang={lang} fresh={id === fresh} />
                  </div>
                );
              })}
              {si === 0 && pi === 0 && ids.length === 0 && <p class="passport-empty">{empty}</p>}
              <span class="pageno">{si * 2 + pi + 1}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
