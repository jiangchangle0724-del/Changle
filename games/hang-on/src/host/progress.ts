/**
 * 这台主机上的进度（A9b）：每关拿到过哪几颗星（小目标）、拿到过哪几个红包。存在这台设备上（localStorage），
 * 换一台电脑、清了浏览器就从头来。红包一共攒了几个 = 拿到过的红包的个数（同一个红包再拿不再算）。
 */
import type { Goal, GoalKey } from '../goals';

const KEY = 'hang-on:progress';

interface Saved {
  stars: Record<string, GoalKey[]>;
  env: Record<string, number[]>;
}

function load(): Saved {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null') as Partial<Saved> | null;
    if (v && typeof v === 'object') return { stars: v.stars ?? {}, env: v.env ?? {} };
  } catch {
    // 没有存储，或者存坏了：从头来
  }
  return { stars: {}, env: {} };
}

let saved = load();

function save(): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(saved));
  } catch {
    // 记不住就记不住
  }
}

/** 这一关拿到过哪几颗星。 */
export function starsOf(levelId: string): GoalKey[] {
  return saved.stars[levelId] ?? [];
}

/** 一共拿到过几个红包。 */
export function envelopeTotal(): number {
  return Object.values(saved.env).reduce((s, list) => s + list.length, 0);
}

/**
 * 记下这一局：达到的小目标、拿到的红包（第几个）。返回的 goals 标上了哪几颗是这一局第一次拿到（fresh），
 * 和这一局新拿到几个红包（以前拿过的不算）。
 */
export function record(levelId: string, goals: Goal[], envelopesGot: readonly number[]): { goals: Goal[]; newEnvelopes: number } {
  const had = new Set(saved.stars[levelId] ?? []);
  const out = goals.map((g) => (g.ok && !had.has(g.key) ? { ...g, fresh: true } : g));
  for (const g of goals) if (g.ok) had.add(g.key);
  saved.stars[levelId] = [...had];
  const env = new Set(saved.env[levelId] ?? []);
  const before = env.size;
  for (const k of envelopesGot) env.add(k);
  saved.env[levelId] = [...env].sort((a, b) => a - b);
  save();
  return { goals: out, newEnvelopes: env.size - before };
}

/** 测试用：换一份存的。 */
export function resetProgressForTest(): void {
  saved = load();
}
