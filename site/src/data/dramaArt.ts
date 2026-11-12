/**
 * 戏精大赏 · the pictures drawn after the first set (`site/public/drama/`). The first set (the six
 * kinds, the duel, the empty stage, the curtain, the cards, the masks, the trophy) is always there;
 * these are added one at a time, by the Codex card in `docs/codex-tasks/drama/`, each name here
 * with its file. A name that isn't here isn't asked for: the backdrop falls back to the scene's
 * kind, or the empty stage, without a failed download.
 *
 * - `classic`: the film set, for a famous scene
 * - `group-cn`, `group-ca`, `group-sa`, `group-ph`, `group-kr`, `group-jp`, `group-ir`, `group-eu`:
 *   a scene set in that community's everyday life
 * - `scene-<id>`: one built-in scene's own set (cards C2 to C7), shown before its community's or kind's
 */
export const DRAWN_ART: ReadonlySet<string> = new Set<string>([
  "classic",
  "group-cn",
  "group-ca",
  "group-sa",
  "group-ph",
  "group-kr",
  "group-jp",
  "group-ir",
  "group-eu",
  "scene-crime-mansion-wine",
  "scene-palace-poisoned-soup",
  "scene-crime-open-house-cookie",
  "scene-crime-library-last-page",
  "scene-crime-museum-squeak",
  "scene-crime-auction-empty-frame",
  "scene-crime-chalet-ransom",
  "scene-crime-manor-recording",
  "scene-palace-dragon-robe",
  "scene-palace-exam-blank-scroll",
  "scene-palace-lantern-wish",
  "scene-palace-jade-betrothal",
  "scene-palace-cold-palace-menu",
  "scene-palace-vault-echo",
  "scene-palace-garden-love-letter",
  "scene-crime-costco-massage-chair",
  "scene-palace-mooncake-crescent",
  "scene-crime-porch-package",
  "scene-palace-decree-extra-stroke",
  "scene-palace-hairpin-guardroom",
  "scene-crime-halloween-ballot-box",
  "scene-crime-night-market-recipe",
  "scene-palace-silent-firecrackers",
  "scene-palace-dowager-cricket",
  "scene-palace-portrait-mole",
  "scene-crime-poker-night-ring",
  "scene-palace-lantern-masked-dancer",
  "scene-solo-museum-guide",
  "scene-crime-escape-room-key",
  "scene-crime-cruise-necklace",
  "scene-palace-banquet-seal",
  "scene-ca-snow-day-driveway",
  "scene-eu-christmas-market-cashbox",
  "scene-family-new-year-dumplings",
  "scene-family-cake-floor",
  "scene-family-heirloom-receipt",
  "scene-family-group-vote",
  "scene-family-downpayment-envelope",
  "scene-family-ex-seating",
  "scene-family-will-parking",
  "scene-family-lipstick-collar",
  "scene-family-surprise-heir",
  "scene-family-red-envelope-double",
  "scene-family-mom-phone-locked",
  "scene-family-new-car-scratch",
  "scene-family-designer-bag",
  "scene-family-mahjong-red-dragon",
  "scene-family-banquet-lobster",
  "scene-family-envelope-old-flame",
  "scene-solo-birthday-call",
]);
