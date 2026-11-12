// What the game's pages have reported (src/client/report.ts, src/server/reports.ts), summed up:
//   npm run reports                          the live game, changle.ca
//   node scripts/reports.mjs http://127.0.0.1:8787   a game running on this computer
const base = (process.argv[2] ?? "https://changle.ca").replace(/\/$/, "");
const res = await fetch(`${base}/trip/api/reports`);
if (!res.ok) {
  console.error(`${base}/trip/api/reports answered ${res.status}`);
  process.exit(1);
}
const s = await res.json();
const when = (ms) => new Date(ms).toISOString().replace("T", " ").slice(0, 16);
const tally = (m) =>
  Object.entries(m)
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${k} ${n}`)
    .join(", ");
console.log(`${s.total} reports kept. By day: ${s.days.map((d) => `${d.day.slice(5)} ${d.n}`).join(", ") || "none"}`);
for (const p of s.problems) {
  console.log(`\n${p.count}x ${p.kind}: ${p.msg}${p.longest ? ` (longest ${Math.round(p.longest / 1000)} s)` : ""}`);
  if (p.where) console.log(`  at ${p.where}`);
  console.log(`  ${when(p.first)} to ${when(p.last)} UTC`);
  console.log(`  screens: ${tally(p.screens)} | phases: ${tally(p.phases)}`);
  console.log(`  browsers: ${tally(p.browsers)}`);
  console.log(`  builds: ${tally(p.builds)}`);
}
