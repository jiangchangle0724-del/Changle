// 闪退自动记录（src/report.ts、src/server/reports.ts）汇总，打出来：
//   npm run reports                               线上，changle.ca
//   node scripts/reports.mjs http://127.0.0.1:8787   本机跑着的
const base = (process.argv[2] ?? 'https://changle.ca').replace(/\/$/, '');
const res = await fetch(`${base}/hang-on/api/reports`);
if (!res.ok) {
  console.error(`${base}/hang-on/api/reports 答 ${res.status}`);
  process.exit(1);
}
const s = await res.json();
const when = (ms) => new Date(ms).toISOString().replace('T', ' ').slice(0, 16);
const tally = (m) =>
  Object.entries(m ?? {})
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${k} ${n}`)
    .join(', ');
console.log(`一共 ${s.total} 次。每天：${s.days.map((d) => `${d.day.slice(5)} ${d.n}`).join(', ') || '没有'}`);
for (const p of s.problems) {
  console.log(`\n${p.count} 次 ${p.kind}：${p.msg}${p.longest ? `（最久 ${Math.round(p.longest / 1000)} 秒）` : ''}`);
  if (p.where) console.log(`  在 ${p.where}`);
  console.log(`  ${when(p.first)} 到 ${when(p.last)} UTC`);
  console.log(`  屏幕：${tally(p.screens)} | 阶段：${tally(p.phases)}`);
  console.log(`  关：${tally(p.levels)} | 人数：${tally(p.players)}`);
  console.log(`  浏览器：${tally(p.browsers)}`);
  console.log(`  版本：${tally(p.builds)}`);
}
