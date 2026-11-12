/** The words of the controls inside a game (GameHeader, RosterChip, PenaltyCard): they load with the
 * games, not in the home page's first download (labels.ts has what the home page's controls say). */
export const gameLabels = {
  back: { zh: "返回", en: "Back" },
  remove: { zh: "移除", en: "Remove" },
  away: { zh: "暂时离开", en: "Away" },
  gone: { zh: "已离开", en: "Left" },
  host: { zh: "房主", en: "Host" },
  me: { zh: "我", en: "Me" },
  drinks: { zh: "杯数", en: "Drinks" },
  sound: { zh: "声音", en: "Sound" },
  tv: { zh: "电视", en: "TV" },
  rules: { zh: "玩法", en: "Rules" },
  more: { zh: "更多操作", en: "More actions" },
  round: { zh: "第 {n} 轮", en: "Round {n}" },
  secondsLeft: { zh: "还剩 {n} 秒", en: "{n}s left" },
  drink: { zh: "喝", en: "Drink" },
  sip: { zh: "喝一口", en: "One sip" },
  two: { zh: "喝两口", en: "Two sips" },
  full: { zh: "干杯", en: "Finish your glass" },
  everyone: { zh: "全桌", en: "Everyone" },
  safe: { zh: "免罪", en: "Safe" },
  continue: { zh: "继续", en: "Continue" },
} as const;
