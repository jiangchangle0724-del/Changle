// 素材来源 · Credits: where every city fact, quiz question, photo, recording, font, map line and borrowed
// piece of code comes from, with its licence. Opened from the home screen and from the in-game menu.
import { useEffect, useState } from "preact/hooks";
import { CITIES, NEWS } from "../../engine";
import { BASE } from "../base";
import { getLang, t, tx, type Key } from "../i18n";
import { RATES_DATE } from "../local";
import { PHOTOS, RECORDINGS, type Credit } from "../media";
import { knownTriviaSources, loadTriviaSources } from "../triviaSources";
import { hostOf } from "./common";
import { CITY_SONGS, songText } from "./localSong";

/** [name, licence, link]. A licence of "" means public domain. */
type Item = [string, string, string];

const PARTS: [Key, Item[]][] = [
  [
    "creditsFonts",
    [
      ["Unbounded", "SIL OFL 1.1", "https://fonts.google.com/specimen/Unbounded"],
      ["Figtree", "SIL OFL 1.1", "https://fonts.google.com/specimen/Figtree"],
      ["ZCOOL QingKe HuangYou · 站酷庆科黄油体", "SIL OFL 1.1", "https://fonts.google.com/specimen/ZCOOL+QingKe+HuangYou"],
      ["Big Shoulders Display", "SIL OFL 1.1", "https://fonts.google.com/specimen/Big+Shoulders+Display"],
      ["Space Mono", "SIL OFL 1.1", "https://fonts.google.com/specimen/Space+Mono"],
    ],
  ],
  [
    "creditsMap",
    [
      ["Natural Earth 1:110m", "", "https://www.naturalearthdata.com/"],
      ["world-atlas · Mike Bostock", "ISC", "https://github.com/topojson/world-atlas"],
    ],
  ],
  [
    "creditsCode",
    [
      ["Preact", "MIT", "https://preactjs.com/"],
      ["three.js", "MIT", "https://threejs.org/"],
      ["qrcode-generator · Kazuhiko Arase", "MIT", "https://github.com/kazuhikoarase/qrcode-generator"],
    ],
  ],
  ["creditsWeather", [["Open-Meteo.com", "CC BY 4.0", "https://open-meteo.com/"]]],
];

export function Credits() {
  return (
    <div class="credits">
      <p class="muted">{t("creditsIntro")}</p>
      <h3>{t("creditsFacts")}</h3>
      <ol class="credits-facts">
        {CITIES.map((c) => (
          <li key={c.id}>
            <b>{tx(c.name)}</b> ·{" "}
            <a href={c.source} target="_blank" rel="noopener noreferrer">
              {hostOf(c.source)}
            </a>
          </li>
        ))}
      </ol>
      <h3>{t("creditsTrivia")}</h3>
      <QuizSources />
      <h3>{t("creditsNews")}</h3>
      <ol class="credits-facts">
        {NEWS.map((n) => (
          <li key={n.id}>
            <b>{tx(n.title)}</b> ·{" "}
            <a href={n.source} target="_blank" rel="noopener noreferrer">
              {hostOf(n.source)}
            </a>
          </li>
        ))}
      </ol>
      {PARTS.map(([title, items]) => (
        <section key={title}>
          <h3>{t(title)}</h3>
          <ul>
            {items.map(([name, licence, url]) => (
              <li key={name}>
                <a href={url} target="_blank" rel="noopener noreferrer">
                  {name}
                </a>{" "}
                <small class="muted">{licence || t("publicDomain")}</small>
              </li>
            ))}
          </ul>
        </section>
      ))}
      <h3>{t("creditsArt")}</h3>
      <p>{t("creditsArtText")}</p>
      <h3>{t("creditsPhotos")}</h3>
      <p class="muted">{t("creditsPhotosText")}</p>
      <MediaList of={PHOTOS} />
      <h3>{t("creditsSound")}</h3>
      <p>{t("creditsSoundText")}</p>
      <h3>{t("creditsRecordings")}</h3>
      <p class="muted">{t("creditsRecordingsText")}</p>
      <MediaList of={RECORDINGS} />
      <h3>{t("creditsSongs")}</h3>
      <p class="muted">{t("creditsSongsText")}</p>
      <SongList />
      <h3>{t("creditsRates")}</h3>
      <p class="muted">{t("creditsRatesText", { date: dateText(RATES_DATE) })}</p>
      <Licences />
    </div>
  );
}

/** A city with more sources than this lists them folded away, under its name and how many there are. */
const FOLD = 2;

/** "en.wikipedia.org/wiki/Burj_Khalifa", shortened: enough to tell two pages on one site apart. */
function shortUrl(url: string) {
  try {
    const u = new URL(url);
    let path = decodeURIComponent(u.pathname).replace(/\/$/, "");
    if (path.length > 38) path = `${path.slice(0, 37)}…`;
    return `${u.host.replace(/^www\./, "")}${path}`;
  } catch {
    return url;
  }
}

/** The quiz's sources, by city; a city with many of them folds them away. */
function QuizSources() {
  const [list, setList] = useState(knownTriviaSources());
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!list) void loadTriviaSources().then((x) => (x ? setList(x) : setFailed(true)));
  }, []);
  if (!list) return <p class="muted">{t(failed ? "creditsTriviaNone" : "creditsTriviaLoading")}</p>;
  const link = (url: string, text: string) => (
    <a href={url} target="_blank" rel="noopener noreferrer">
      {text}
    </a>
  );
  return (
    <ol class="credits-facts credits-quiz">
      {list.map(({ city, sources }) => {
        const c = CITIES.find((x) => x.id === city);
        const name = c ? tx(c.name) : city;
        return (
          <li key={city}>
            {sources.length > FOLD ? (
              <details>
                <summary>
                  <b>{name}</b> · {t("creditsTriviaCount", { n: sources.length })}
                </summary>
                <ul>
                  {sources.map((u) => (
                    <li key={u}>{link(u, shortUrl(u))}</li>
                  ))}
                </ul>
              </details>
            ) : (
              <>
                <b>{name}</b>
                {sources.map((u) => (
                  <span key={u}>
                    {" · "}
                    {link(u, hostOf(u))}
                  </span>
                ))}
              </>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** Each city's photo or recording: its title (linked to its page), who made it, and its licence. */
function MediaList({ of }: { of: Record<string, Credit> }) {
  return (
    <ol class="credits-facts credits-media">
      {CITIES.filter((c) => of[c.id]).map((c) => {
        const m = of[c.id];
        return (
          <li key={c.id}>
            <b>{tx(c.name)}</b> ·{" "}
            <a href={m.page} target="_blank" rel="noopener noreferrer">
              {m.title}
            </a>{" "}
            · {m.author} ·{" "}
            {m.licenseUrl ? (
              <a href={m.licenseUrl} target="_blank" rel="noopener noreferrer">
                {m.license}
              </a>
            ) : (
              m.license || t("publicDomain")
            )}
          </li>
        );
      })}
    </ol>
  );
}

/** "2026 年 11 月 2 日" / "2 November 2026". */
function dateText(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  if (getLang() === "zh") return `${y} 年 ${m} 月 ${d} 日`;
  const month = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"][m - 1];
  return `${d} ${month} ${y}`;
}

/** Each city's local hits, folded away under its name, each linked to the song on Apple Music. */
function SongList() {
  const lang = getLang();
  return (
    <ol class="credits-facts credits-quiz credits-songs">
      {CITIES.filter((c) => CITY_SONGS[c.id]?.length).map((c) => (
        <li key={c.id}>
          <details>
            <summary>
              <b>{tx(c.name)}</b> · {t("creditsSongsCount", { n: CITY_SONGS[c.id].length })}
            </summary>
            <ul>
              {CITY_SONGS[c.id].map((s) => {
                const { title, artist } = songText(s, lang);
                return (
                  <li key={s.id}>
                    <a href={s.url} target="_blank" rel="noopener noreferrer" lang="und">
                      {title}
                    </a>{" "}
                    · <span lang="und">{artist}</span>
                  </li>
                );
              })}
            </ul>
          </details>
        </li>
      ))}
    </ol>
  );
}

/** The licence texts in full: beside the online game as licences.txt, inside the single-file pages. */
function Licences() {
  const inPage = typeof document !== "undefined" ? document.getElementById("licences")?.textContent : null;
  if (!inPage)
    return (
      <p>
        <a href={`${BASE}/licences.txt`} target="_blank" rel="noopener noreferrer">
          {t("creditsLicences")} · licences.txt
        </a>
      </p>
    );
  return (
    <details class="licences">
      <summary>{t("creditsLicences")}</summary>
      <pre>{inPage}</pre>
    </details>
  );
}
