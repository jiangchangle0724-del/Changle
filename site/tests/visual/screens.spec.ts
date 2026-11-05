import AxeBuilder from '@axe-core/playwright';
import { test, expect, players } from './fixtures';
import { axeKnown } from './axe-known';
import { writeFile } from 'node:fs/promises';

/** `mask`: parts of the screen left out of the comparison (they are painted over in both pictures) */
type Screen = { name: string; path: string; ready: string; lang?: 'zh' | 'en'; desktop?: boolean; empty?: boolean; action?: 'players' | 'code' | 'sheet'; mask?: string[] };
/**
 * 最佳称号 opens on an award drawn at random. Math.random is seeded here, but when the loading shape's
 * file lands while the game's first render is under way, React starts that render over and the deck is
 * shuffled again (61 or 120 draws): which award shows depends on when the two files arrive, so the same
 * build passed or failed on that one title. The title is left out; the rest of the screen still counts.
 */
const MASKS: Record<string, string[]> = { superlatives: ['.award-title'] };
const screens: Screen[] = [
  ...(['zh', 'en'] as const).flatMap(lang => [
    { name: `home-${lang}`, path: '/', ready: '.board', lang },
    { name: `home-desktop-${lang}`, path: '/', ready: '.board', lang, desktop: true },
    { name: `home-empty-${lang}`, path: '/', ready: '.tonight', lang, empty: true },
    { name: `tools-${lang}`, path: '/tools', ready: '.tool-blurb', lang },
    { name: `game-card-${lang}`, path: '/g/truth-or-dare', ready: '.game-card-how', lang },
  ]),
  { name: 'wishlist', path: '/wish', ready: '.wish' },
  { name: 'players', path: '/', ready: '.sheet', action: 'players' },
  { name: 'settings', path: '/settings', ready: '.sheet' },
  { name: 'signin-code', path: '/login', ready: '.otp-input', action: 'code' },
  ...[
    'truth-or-dare', 'rogue-thirteen', 'superlatives', 'kings-game', 'drama-queens',
    'post-it', 'limbo', 'never-have-i-ever', 'seven-eight-nine', 'freeze-dance',
    'wheel-of-fate', 'undercover', 'name-that-tune', 'punchline', 'draw-and-guess',
  ].map(slug => ({ name: `game-${slug}`, path: `/g/${slug}/play`, ready: '.game-body', mask: MASKS[slug] })),
  { name: 'tv', path: '/tv', ready: '.tv-lobby' },
  ...['Button', 'Tile', 'Sheet', 'Tabs', 'Pill', 'RosterChip', 'OTPInput', 'EmptyState', 'GameHeader', 'PenaltyCard']
    .map(name => ({ name: `component-${name}`, path: `/ui-preview.html#${name}`, ready: `[data-preview="${name}"]`, ...(name === 'Sheet' ? { action: 'sheet' as const } : {}) })),
];

for (const screen of screens) {
  test.describe(screen.name, () => {
  test.use({ isMobile: !screen.desktop, hasTouch: !screen.desktop, locale: screen.lang === 'en' ? 'en-CA' : 'zh-CN' });
  test(screen.name, async ({ page, context }, testInfo) => {
    if (screen.desktop) {
      await page.setViewportSize({ width: 1280, height: 800 });
    }
    await context.addInitScript(({ lang, roster }) => {
      localStorage.setItem('lazysusan.settings.v1', JSON.stringify({
        lang, players: roster, sound: false, music: false, customPenalty: '',
      }));
    }, { lang: screen.lang ?? 'zh', roster: screen.empty ? [] : players });
    await page.goto(screen.path, { waitUntil: 'networkidle' });
    if (screen.action === 'players') await page.locator('.tonight-head .link-btn').click();
    if (screen.action === 'code') {
      await page.locator('#si-email').fill('reader@example.test');
      await page.locator('.signin button[type=submit]').click();
    }
    if (screen.action === 'sheet') await page.getByRole('button', { name: '打开长内容弹层', exact: true }).click();
    await expect(page.locator(screen.ready).first()).toBeVisible();
    await page.evaluate(() => document.fonts.ready);
    // Let legacy GSAP entry fades finish; screenshot() disables CSS/WAAPI animation.
    await page.waitForTimeout(700);
    if (screen.action === 'code') await page.locator('.otp-input').blur();
    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    const serious = results.violations.filter(v => v.impact === 'serious' || v.impact === 'critical');
    const unexpected = serious.flatMap(v => v.nodes.filter(node => !axeKnown.some(known =>
      known.screen === screen.name && known.rule === v.id && known.target === JSON.stringify(node.target)
    )).map(node => ({ rule: v.id, impact: v.impact, target: node.target, summary: node.failureSummary })));
    const axePath = testInfo.outputPath('axe-results.json');
    await writeFile(axePath, JSON.stringify({ screen: screen.name, violations: results.violations, unexpected }, null, 2));
    await testInfo.attach('axe-results', { path: axePath, contentType: 'application/json' });
    // Soft assertion ensures a failed accessibility audit still captures the visual diff.
    expect.soft(unexpected, `${screen.name}: untriaged serious/critical axe violations`).toEqual([]);
    await expect(page).toHaveScreenshot(`${screen.name}.png`, { mask: (screen.mask ?? []).map(s => page.locator(s)) });
  });
  });
}
