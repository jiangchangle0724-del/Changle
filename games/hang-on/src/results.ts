/**
 * 结算页：用时、摔死排行（摔得最多的是「今晚的汤圆」）、背叛榜。
 * 主机页和手机局里别的手机共用：主机算出 Results，自己画一份，也装进 Cast 发给每部手机，各自按自己的语言画。
 * 手柄页也用，只引 i18n。
 */
import { tr } from './i18n';
import type { Results } from './net/protocol';

const r2 = (v: number): number => Math.round(v * 100) / 100;

/** 从局面里算结算页要的数。 */
export function resultsOf(sim: {
  time: number;
  players: readonly { deaths: number; grabs: number }[];
  betrayals: readonly { by: number; victim: number }[];
}): Results {
  const counts = new Map<string, [number, number, number]>();
  for (const b of sim.betrayals) {
    const key = `${b.by}>${b.victim}`;
    const row = counts.get(key) ?? [b.by, b.victim, 0];
    row[2]++;
    counts.set(key, row);
  }
  return {
    time: r2(sim.time),
    deaths: sim.players.map((p) => p.deaths),
    grabs: sim.players.map((p) => p.grabs),
    betrayals: [...counts.values()].sort((a, b) => b[2] - a[2]),
  };
}

export interface ResultsDom {
  time: HTMLElement;
  par: HTMLElement;
  deaths: HTMLElement;
  betrayTitle: HTMLElement;
  betrayList: HTMLElement;
  betrayNone: HTMLElement;
}

/** 画结算页。name、color 按玩家下标给；par 是这一关的标准用时（秒）。 */
export function renderResults(dom: ResultsDom, r: Results, name: (i: number) => string, color: (i: number) => string, par?: number): void {
  dom.time.textContent = `${r.time.toFixed(1)} s`;
  dom.par.textContent = par ? (r.time <= par ? tr(`比标准的 ${par} 秒快`, `Faster than par (${par} s)`) : tr(`标准 ${par} 秒`, `Par ${par} s`)) : '';
  const rank = r.deaths.map((deaths, i) => ({ i, deaths, grabs: r.grabs[i] ?? 0 })).sort((a, b) => b.deaths - a.deaths);
  dom.deaths.innerHTML = '';
  rank.forEach((row, k) => {
    const li = document.createElement('li');
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = color(row.i);
    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = name(row.i);
    const n = document.createElement('span');
    n.className = 'n';
    n.textContent = tr(`摔了 ${row.deaths} 次 · 抓了 ${row.grabs} 下`, `${row.deaths} falls · ${row.grabs} grabs`);
    li.append(dot, who, n);
    if (k === 0 && row.deaths > 0 && rank.length > 1) {
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = tr('今晚的汤圆', "Tonight's dumpling");
      li.append(tag);
    }
    dom.deaths.append(li);
  });
  dom.betrayList.innerHTML = '';
  dom.betrayTitle.hidden = r.betrayals.length === 0;
  for (const [by, victim, n] of r.betrayals) {
    const li = document.createElement('li');
    li.textContent = tr(`${name(by)} 松开过 ${name(victim)} ${n} 次`, `${name(by)} let go of ${name(victim)} ${n === 1 ? 'once' : `${n} times`}`);
    dom.betrayList.append(li);
  }
  dom.betrayNone.hidden = r.betrayals.length > 0;
}
