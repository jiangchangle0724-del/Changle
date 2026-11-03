// Screen + rule + exact affected target; new nodes for the same rule still fail.
// Exceptions describe existing production UI, which this card cannot edit.
export const axeKnown: {
  screen: string;
  rule: string;
  target: string;
  reason: string;
}[] = [
  ...['home-zh', 'home-en', 'home-desktop-zh', 'home-desktop-en', 'game-card-zh', 'game-card-en', 'players', 'settings', 'signin-code'].map(screen => ({
    screen, rule: 'label-content-name-mismatch', target: JSON.stringify(['.roster']),
    reason: 'Home Roster accessible name describes editing players but omits its visible player names; fix belongs to src/home.',
  })),
  ...['game-card-zh', 'game-card-en'].map(screen => ({
    screen, rule: 'color-contrast', target: JSON.stringify(['.mode-primary > span > small']),
    reason: 'Game card mode subtitle has 4.03:1 contrast on the pink button; changing src/home is outside this card.',
  })),
  { screen: 'settings', rule: 'color-contrast', target: JSON.stringify(['p:nth-child(6)']), reason: 'Settings hint uses fog on the sheet (4.38:1); fix belongs to src/components settings styles.' },
  { screen: 'game-rogue-thirteen', rule: 'label-content-name-mismatch', target: JSON.stringify(['.pcard-back']), reason: 'Draw-card accessible name omits the visible card-back text; fix belongs to src/games/Rogue13.' },
  ...(['zh', 'en'] as const).flatMap(lang => [
    { screen: `tools-${lang}`, rule: 'label-content-name-mismatch', target: JSON.stringify(['.tool-meta']), reason: 'Exchange-rate source button has a label that omits its visible source/timestamp; fix belongs to src/tools.' },
    ...(lang === 'zh' ? ['温哥华', '多伦多', '巴黎', '中国', '伦敦', '东京', '悉尼'] : ['Vancouver', 'Toronto', 'Paris', 'China', 'London', 'Tokyo', 'Sydney']).map(city => ({
      screen: `tools-${lang}`, rule: 'label-content-name-mismatch', target: JSON.stringify([`button[aria-label="${lang === 'zh' ? `设置${city}的时间` : `Set the time in ${city}`}"]`]),
      reason: 'Clock button accessible name omits its visible clock digits; fix belongs to src/tools/WorldClock.',
    })),
  ]),
  ...[
    '.ui-category-tool > .ui-tile-top > span',
    '.ui-category-tool > .ui-tile-title > span[lang="zh-CN"]',
    '.ui-category-tool > .ui-tile-title > small',
    '.ui-category-tool > .ui-tile-meta > span:nth-child(1)',
    '.ui-category-brain.ui-tile-soon.ui-tile-grid > .ui-tile-top > span',
    '.ui-category-brain.ui-tile-soon.ui-tile-grid > .ui-tile-title > span[lang="zh-CN"]',
    '.ui-category-brain.ui-tile-soon.ui-tile-grid > .ui-tile-title > small',
  ].map(target => ({ screen: 'component-Tile', rule: 'color-contrast', target: JSON.stringify([target]), reason: 'Coming-soon tile opacity reduces label contrast to 2.63–3.99:1; fix belongs to src/ui/Tile.css.' })),
];
