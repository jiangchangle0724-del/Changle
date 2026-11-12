// Where every picture and model in the game comes from (changle.ca/hide/credits, and the menu).
// The same list, with sizes, is in DESIGN.md.
import { BASE } from "../base";
import { t, type Key } from "../i18n";
import { TopBar } from "./chrome";

const ITEMS: { title: Key; body: Key; files: string[]; ai?: boolean }[] = [
  { title: "creditsBackdrops", body: "creditsBackdropsBody", files: ["thumb-*.webp"], ai: true },
  { title: "creditsPeople", body: "creditsPeopleBody", files: ["crowd-atlas.webp"], ai: true },
  { title: "creditsSets", body: "creditsSetsBody", files: ["seawall-dressing.glb", "transit-dressing.glb", "courtyard-dressing.glb"] },
  { title: "creditsFonts", body: "creditsFontsBody", files: ["fonts/unbounded.woff2", "fonts/figtree.woff2"] },
  { title: "creditsCode", body: "creditsCodeBody", files: [] }
];

export function CreditsText() {
  return (
    <div class="credits">
      <p class="credits-intro">{t("creditsIntro")}</p>
      {ITEMS.map((item) => (
        <section class="credits-item" key={item.title}>
          <h3>
            {t(item.title)}
            {item.ai && <span class="ai-tag">AI</span>}
          </h3>
          <p>{t(item.body)}</p>
          {item.files.length > 0 && <p class="credits-files">{item.files.join(" · ")}</p>}
        </section>
      ))}
      <p>
        <a class="link" href={`${BASE}/licences.txt`}>
          {t("licences")}
        </a>
      </p>
    </div>
  );
}

export function CreditsPage() {
  return (
    <main class="page">
      <TopBar onBack={() => (history.length > 1 ? history.back() : location.assign("/"))} />
      <h1 class="page-title">{t("credits")}</h1>
      <CreditsText />
    </main>
  );
}
