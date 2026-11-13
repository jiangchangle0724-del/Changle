/**
 * 结算页：闯关是用时、摔死排行（摔得最多的是「今晚的汤圆」）、背叛榜；比谁先是名次和用时；坐不住是谁撑到最后。
 * 主机页和手机局里别的手机共用：主机算出 Results，自己画一份，也装进 Cast 发给每部手机，各自按自己的语言画。
 * 手柄页也用，只引 i18n。
 */
import { tr } from './i18n';
import type { Results } from './net/protocol';
import type { GameMode, Rules } from './physics/world';

const r2 = (v: number): number => Math.round(v * 100) / 100;

/** 比谁先分两队的队名：糯米团的老问题，甜的还是咸的。 */
export function teamName(team: number): string {
  return team === 0 ? tr('甜队', 'Team Sweet') : tr('咸队', 'Team Savory');
}

/** 从局面里算结算页要的数。 */
export function resultsOf(sim: {
  time: number;
  players: readonly { deaths: number; grabs: number; endT?: number | null }[];
  betrayals: readonly { by: number; victim: number }[];
  rules?: Rules;
  winners?: readonly number[];
  finishOrder?: readonly number[];
  outOrder?: readonly number[];
}): Results {
  const counts = new Map<string, [number, number, number]>();
  for (const b of sim.betrayals) {
    const key = `${b.by}>${b.victim}`;
    const row = counts.get(key) ?? [b.by, b.victim, 0];
    row[2]++;
    counts.set(key, row);
  }
  const r: Results = {
    time: r2(sim.time),
    deaths: sim.players.map((p) => p.deaths),
    grabs: sim.players.map((p) => p.grabs),
    betrayals: [...counts.values()].sort((a, b) => b[2] - a[2]),
  };
  const mode = sim.rules?.mode ?? 'climb';
  if (mode === 'climb') return r;
  r.mode = mode;
  r.winners = [...(sim.winners ?? [])];
  if (sim.rules?.teams) r.teams = sim.players.map((_, i) => sim.rules?.teams?.[i] ?? i % 2);
  const endOf = (i: number): number | null => {
    const t = sim.players[i]?.endT;
    return t === null || t === undefined ? null : r2(t);
  };
  if (mode === 'race') {
    const finished = [...(sim.finishOrder ?? [])];
    const rest = sim.players.map((_, i) => i).filter((i) => !finished.includes(i));
    r.order = [...finished.map((i): [number, number | null] => [i, endOf(i)]), ...rest.map((i): [number, number | null] => [i, null])];
  }
  if (mode === 'last') {
    // 还挂着的（赢的）在前，撑到了结束；出局的按出局的先后倒过来
    const out = [...(sim.outOrder ?? [])];
    const alive = sim.players.map((_, i) => i).filter((i) => !out.includes(i));
    r.order = [...alive.map((i): [number, number | null] => [i, r2(sim.time)]), ...out.reverse().map((i): [number, number | null] => [i, endOf(i)])];
  }
  return r;
}

export interface ResultsDom {
  /** 大标题：到顶了！/ ×× 第一！/ ×× 撑到了最后！ */
  title: HTMLElement;
  time: HTMLElement;
  par: HTMLElement;
  deaths: HTMLElement;
  betrayTitle: HTMLElement;
  betrayList: HTMLElement;
  betrayNone: HTMLElement;
}

/** 结算页的大标题。 */
export function resultsTitle(r: Results, name: (i: number) => string): string {
  const mode: GameMode = r.mode ?? 'climb';
  const w = r.winners ?? [];
  if (mode === 'race') {
    if (r.teams && w.length) return tr(`${teamName(r.teams[w[0] as number] ?? 0)}赢了！`, `${teamName(r.teams[w[0] as number] ?? 0)} wins!`);
    return w.length ? tr(`${name(w[0] as number)} 第一！`, `${name(w[0] as number)} wins!`) : tr('没人到终点', 'Nobody made it');
  }
  if (mode === 'last') {
    if (w.length === 1) return tr(`${name(w[0] as number)} 撑到了最后！`, `${name(w[0] as number)} held on longest!`);
    if (w.length > 1) return tr('平局！一起掉下去了', 'A tie! They dropped together');
    return tr('掉下去了', 'You dropped');
  }
  return tr('到顶了！', 'Made it!');
}

/** 画结算页。name、color 按玩家下标给；par 是这一关的标准用时（秒）。 */
export function renderResults(dom: ResultsDom, r: Results, name: (i: number) => string, color: (i: number) => string, par?: number): void {
  const mode: GameMode = r.mode ?? 'climb';
  dom.title.textContent = resultsTitle(r, name);
  dom.time.textContent = `${r.time.toFixed(1)} s`;
  dom.par.textContent =
    mode === 'climb' || mode === 'team'
      ? par
        ? r.time <= par
          ? tr(`比标准的 ${par} 秒快`, `Faster than par (${par} s)`)
          : tr(`标准 ${par} 秒`, `Par ${par} s`)
        : ''
      : mode === 'race'
        ? tr('这一场用了多久', 'How long the race took')
        : tr('撑了多久', 'How long it lasted');
  dom.deaths.innerHTML = '';
  const row = (i: number, text: string, tag?: string): void => {
    const li = document.createElement('li');
    const dot = document.createElement('span');
    dot.className = 'dot';
    dot.style.background = color(i);
    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = name(i);
    const n = document.createElement('span');
    n.className = 'n';
    n.textContent = text;
    li.append(dot, who, n);
    if (tag) {
      const t = document.createElement('span');
      t.className = 'tag';
      t.textContent = tag;
      li.append(t);
    }
    dom.deaths.append(li);
  };
  if (mode === 'race' || mode === 'last') {
    const winners = r.winners ?? [];
    (r.order ?? []).forEach(([i, t], k) => {
      const team = r.teams ? ` · ${teamName(r.teams[i] ?? 0)}` : '';
      const text =
        mode === 'race'
          ? t === null
            ? tr(`没到${team}`, `Didn't make it${team}`)
            : tr(`第 ${k + 1} 个到 · ${t.toFixed(1)} 秒${team}`, `#${k + 1} · ${t.toFixed(1)} s${team}`)
          : t === null
            ? ''
            : winners.includes(i)
              ? tr(`挂到了最后 · ${t.toFixed(1)} 秒`, `Still hanging · ${t.toFixed(1)} s`)
              : tr(`撑了 ${t.toFixed(1)} 秒`, `Lasted ${t.toFixed(1)} s`);
      row(i, text, winners.includes(i) ? tr('赢了', 'Winner') : undefined);
    });
  } else {
    const rank = r.deaths.map((deaths, i) => ({ i, deaths, grabs: r.grabs[i] ?? 0 })).sort((a, b) => b.deaths - a.deaths);
    rank.forEach((x, k) => {
      const tag = k === 0 && x.deaths > 0 && rank.length > 1 ? tr('今晚的汤圆', "Tonight's dumpling") : undefined;
      row(x.i, tr(`摔了 ${x.deaths} 次 · 抓了 ${x.grabs} 下`, `${x.deaths} falls · ${x.grabs} grabs`), tag);
    });
  }
  dom.betrayList.innerHTML = '';
  dom.betrayTitle.hidden = r.betrayals.length === 0;
  for (const [by, victim, n] of r.betrayals) {
    const li = document.createElement('li');
    li.textContent = tr(`${name(by)} 松开过 ${name(victim)} ${n} 次`, `${name(by)} let go of ${name(victim)} ${n === 1 ? 'once' : `${n} times`}`);
    dom.betrayList.append(li);
  }
  // 「没人松手害人，好队友」只在大家一队的时候说
  dom.betrayNone.hidden = r.betrayals.length > 0 || mode === 'last' || (mode === 'race' && !r.teams);
}
