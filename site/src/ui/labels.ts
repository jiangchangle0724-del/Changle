/**
 * Only vocabulary owned by the shared controls; screen copy arrives through props. These are the words
 * the home page's controls need (they ship in its first download); the controls inside a game have
 * theirs in gameLabels.ts, which loads with the games.
 */
export const labels = {
  close: { zh: "关闭", en: "Close" },
  loading: { zh: "加载中", en: "Loading" },
  soon: { zh: "即将上线", en: "Soon" },
  new: { zh: "新", en: "New" },
  players: { zh: "人", en: "players" },
  minutes: { zh: "分钟", en: "min" },
  drinking: { zh: "含饮酒", en: "Drinking" },
} as const;
