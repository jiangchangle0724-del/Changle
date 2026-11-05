/**
 * 往返时间的统计：留最近几次，报中位数（一次抖动不会把数字带跑）。纯函数，有测试。
 */
import { RTT_BAD_MS, RTT_WARN_MS } from './protocol';

export type RttLevel = 'good' | 'warn' | 'bad';

export class RttMeter {
  private samples: number[] = [];

  constructor(private readonly keep = 8) {}

  add(ms: number): void {
    if (!Number.isFinite(ms) || ms < 0) return;
    this.samples.push(ms);
    if (this.samples.length > this.keep) this.samples.shift();
  }

  /** 中位数，还没量过是 null。 */
  median(): number | null {
    if (!this.samples.length) return null;
    const s = [...this.samples].sort((a, b) => a - b);
    const mid = s.length >> 1;
    return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
  }

  last(): number | null {
    return this.samples.at(-1) ?? null;
  }

  get count(): number {
    return this.samples.length;
  }

  clear(): void {
    this.samples = [];
  }
}

/** 延迟表的颜色：60 以下绿，120 以下黄，再高红。 */
export function rttLevel(ms: number): RttLevel {
  if (ms < RTT_WARN_MS) return 'good';
  if (ms < RTT_BAD_MS) return 'warn';
  return 'bad';
}
