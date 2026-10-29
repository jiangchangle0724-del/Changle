// 素材来源 · Credits: where every city fact, photo, recording, font, map line and borrowed piece of
// code comes from, with its licence. Opened from the home screen and from the in-game menu.
import { CITIES, NEWS } from "../../engine";
import { BASE } from "../base";
import { t, tx, type Key } from "../i18n";
import { PHOTOS, RECORDINGS, type Credit } from "../media";
import { hostOf } from "./common";

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
      <Licences />
    </div>
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
