#!/usr/bin/env node
/**
 * 法律线检查（CONTRACTS.md 铁律 2）：docs/ 之外的全仓库不能出现原版的游戏名、工作室名、发行商名。
 * 词表用 base64 存着，免得脚本自己被抓。有一处就退出 1，CI 不给合并。
 *
 *   node scripts/ip-check.mjs           # 在仓库任何地方运行都行
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const WORDS = ['aGVhdmUgaG8=', 'bGUgY2FydGVs', 'ZGV2b2x2ZXI='].map((b) => Buffer.from(b, 'base64').toString('utf8'));
const root = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim();
const files = execFileSync('git', ['ls-files', '-z', '--', '.', ':!docs'], { cwd: root, encoding: 'utf8' })
  .split('\0')
  .filter(Boolean);

let hits = 0;
for (const rel of files) {
  let buf;
  try {
    buf = readFileSync(join(root, rel));
  } catch {
    continue;
  }
  if (buf.subarray(0, 8000).includes(0)) continue; // 二进制
  const text = buf.toString('utf8');
  const lower = text.toLowerCase();
  for (const word of WORDS) {
    let at = lower.indexOf(word);
    while (at !== -1) {
      const line = text.slice(0, at).split('\n').length;
      console.log(`${rel}:${line}: 出现了禁词 #${WORDS.indexOf(word) + 1}`);
      hits++;
      at = lower.indexOf(word, at + word.length);
    }
  }
}
if (hits) {
  console.error(`\nip-check: ${hits} 处，docs/ 之外不能出现原版的名字。`);
  process.exit(1);
}
console.log(`ip-check: 0 处（查了 ${files.length} 个文件）`);
