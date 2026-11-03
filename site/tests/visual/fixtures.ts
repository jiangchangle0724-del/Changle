import { test as base, expect } from '@playwright/test';

export const players = ['小明', 'Ann', 'Ben', '小雨', 'Cathy'].map((name, i) => ({ id: `p${i}`, name }));
export const test = base.extend<{ isolatedNetwork: void }>({
  isolatedNetwork: [async ({ context, page, baseURL }, use) => {
    const unexpected: string[] = [];
    const replies: Record<string, unknown> = {
      '/status': { paused: false },
      '/auth/restore': {},
      '/auth/keep': {},
      '/auth/code': { sent: true },
      '/wishes': { wishes: [] },
      '/fx': { rates: { USD: 1, CAD: 1.4, CNY: 7.2, HKD: 7.8 }, at: 1793491200000, source: 'Visual fixture' },
    };
    await context.route('**/*', async route => {
      const url = new URL(route.request().url());
      if (url.pathname.startsWith('/api/')) {
        const path = url.pathname.slice(4);
        if (!(path in replies)) unexpected.push(`API ${route.request().method()} ${path}`);
        await route.fulfill({ json: replies[path] ?? {} });
      } else if (url.origin === baseURL) {
        await route.continue();
      } else {
        unexpected.push(`External ${url.origin}${url.pathname}`);
        await route.abort();
      }
    });
    await context.routeWebSocket('**/*', ws => {
      // Synthetic TV lobby; no socket ever connects to a server.
      ws.onMessage(raw => {
        const message = JSON.parse(String(raw));
        if (message.t === 'ping') ws.send(JSON.stringify({ t: 'pong', c: message.c, s: 1793559600000 }));
        if (message.t === 'hello' && message.screen) ws.send(JSON.stringify({
          t: 'room', now: 1793559600000,
          room: { code: new URL(ws.url()).pathname.split('/')[2], you: '', host: 'p0', seats: players.map(p => ({ ...p, on: true })), penalty: '', front: 0, game: null, playing: null, screens: 1, v: 1 },
        }));
      });
    });
    await page.clock.setFixedTime(new Date('2026-11-01T19:00:00Z'));
    await context.addInitScript(() => {
      let seed = 20261101;
      Math.random = () => {
        seed = (Math.imul(1664525, seed) + 1013904223) >>> 0;
        return seed / 4294967296;
      };
      // Room codes use Web Crypto rather than Math.random. This isolated test context
      // has no credentials or real network; seed those UI identifiers separately.
      let codeSeed = 42;
      Object.defineProperty(crypto, 'getRandomValues', { value: (values: Uint32Array) => {
        for (let i = 0; i < values.length; i++) {
          codeSeed = (Math.imul(1664525, codeSeed) + 1013904223) >>> 0;
          values[i] = codeSeed;
        }
        return values;
      } });
      localStorage.setItem('lazysusan.pid', 'visual-phone');
      localStorage.setItem('changle.screen', 'tv-visualfixture');
      sessionStorage.setItem('changle.entered', '1');
    });
    await use();
    expect(unexpected, 'Every API and external request must have an explicit fixture').toEqual([]);
  }, { auto: true }],
});
export { expect };
