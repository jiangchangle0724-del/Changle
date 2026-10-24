// "You've arrived": the city's poster, its name in both languages, a hello in the local language,
// the local money, and the city's rule on a ticket stub. A new passport stamp lands on the corner.
import { CITIES, GROUPS } from "../../engine";
import { colon, getLang, groupName, t, tx } from "../i18n";
import { CityPoster } from "./posters";
import { shapePath } from "./shapes";
import { Stamp } from "./stamps";

export function GroupLabel({ group }: { group: number }) {
  const g = GROUPS.find((x) => x.id === group)!;
  return (
    <span class="glabel" style={{ background: g.color }}>
      <svg width="12" height="12" viewBox="-11 -11 22 22" aria-hidden="true">
        <path d={shapePath(g.shape, 9)} fill="#fff" stroke="rgba(0,0,0,.4)" stroke-width="1.4" />
      </svg>
      {groupName(group)}
    </span>
  );
}

export function LandingCard({ id, stamp, fresh }: { id: string; stamp?: boolean; fresh?: boolean }) {
  const city = CITIES.find((c) => c.id === id)!;
  const lang = getLang();
  const other = lang === "zh" ? city.name.en : city.name.zh;
  return (
    <article class={`landing${fresh ? " fresh" : ""}`} lang={lang === "zh" ? "zh-CN" : "en"}>
      <div class="landing-frame">
        <div class="poster landing-poster">
          <CityPoster id={id} />
        </div>
        <GroupLabel group={city.group} />
        {stamp && (
          <div class="landing-stamp">
            <Stamp id={id} size={104} turn={-12} lang={lang} fresh={fresh} />
          </div>
        )}
      </div>
      <header class="landing-name">
        <h2>{tx(city.name)}</h2>
        <p>{other}</p>
      </header>
      <p class="landing-hello">
        <span lang="und">{city.greeting.text}</span>
        {city.greeting.roman && <i>{city.greeting.roman}</i>}
      </p>
      <p class="landing-cur">
        {t("currency")}
        {colon()}
        {tx(city.currency)}
      </p>
      <div class="landing-rule">
        <b>{tx(city.rule.title)}</b>
        <span>{tx(city.rule.text)}</span>
      </div>
    </article>
  );
}
