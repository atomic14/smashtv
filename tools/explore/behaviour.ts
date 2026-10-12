// Behaviour summary for one process id from TRACK=1 recordings (tools/mame/waverun.lua):
// lifetimes, speeds, how long it holds a heading, how near the player it gets, and the
// images it shows over its life (first, most common, last).
//   npx tsx tools/explore/behaviour.ts <id hex> <room.jsonl>...
import { createReadStream, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const [idHex, ...files] = process.argv.slice(2);
const id = parseInt(idHex, 16);
const anims = JSON.parse(readFileSync('public/assets/anims.json', 'utf8')).anims as Record<string, [string, number][]>;
const name = new Map<number, string>();
for (const [n, fr] of Object.entries(anims)) for (const [k] of fr) { const a = parseInt(k.split('~')[0], 16) & 0xffffff; if (!name.has(a)) name.set(a, n); }
const img = (v: number) => name.get(v) ?? v.toString(16);

interface Life { start: number; end: number; pts: { t: number; x: number; y: number; vx: number; vy: number; img: number; px: number; py: number }[] }
const lives: Life[] = [];

for (const f of files) {
  const live = new Map<number, Life>();
  const rl = createInterface({ input: createReadStream(f), crlfDelay: Infinity });
  for await (const line of rl) {
    let r: { t: number; p: number[]; pr: number[][] };
    try { r = JSON.parse(line); } catch { continue; } // a run still writing
    const seen = new Set<number>();
    for (const p of r.pr) {
      if (p[0] !== id || p.length < 8) continue;
      seen.add(p[1]);
      let l = live.get(p[1]);
      if (!l) live.set(p[1], (l = { start: r.t, end: r.t, pts: [] }));
      l.end = r.t;
      l.pts.push({ t: r.t, x: p[4], y: p[5], vx: p[6], vy: p[7], img: p[3], px: r.p[0], py: r.p[1] });
    }
    for (const [a, l] of live) if (!seen.has(a)) { lives.push(l); live.delete(a); }
  }
  lives.push(...live.values());
}

const q = (xs: number[], p: number) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(p * (s.length - 1))] : NaN; };
const fmt = (xs: number[]) => `${q(xs, 0.1).toFixed(2)}/${q(xs, 0.5).toFixed(2)}/${q(xs, 0.9).toFixed(2)}`;
console.log(`${lives.length} lives of ${idHex}`);
console.log(`life (s, p10/50/90): ${fmt(lives.map((l) => (l.end - l.start) / 54.71))}`);
const speeds = lives.flatMap((l) => l.pts.map((p) => Math.hypot(p.vx, p.vy)).filter((v) => v > 0));
console.log(`speed px/frame: ${fmt(speeds)}  still ${(100 * (1 - speeds.length / lives.reduce((n, l) => n + l.pts.length, 0))).toFixed(0)}%`);
// how long a velocity is held before changing
const holds: number[] = [];
for (const l of lives) {
  let since = l.pts[0]?.t ?? 0;
  for (let i = 1; i < l.pts.length; i++) {
    const a = l.pts[i - 1], b = l.pts[i];
    if (Math.abs(a.vx - b.vx) > 0.01 || Math.abs(a.vy - b.vy) > 0.01) { holds.push((b.t - since) / 54.71); since = b.t; }
  }
}
console.log(`heading held (s): ${fmt(holds)} over ${holds.length} changes`);
const dist = lives.flatMap((l) => l.pts.filter((p) => p.px >= 0).map((p) => Math.hypot(p.x - p.px, p.y - (p.py - 10))));
console.log(`distance to player: ${fmt(dist)}`);
const first = new Map<string, number>(), last = new Map<string, number>(), all = new Map<string, number>();
for (const l of lives) {
  if (!l.pts.length) continue;
  const inc = (m: Map<string, number>, k: string) => m.set(k, (m.get(k) ?? 0) + 1);
  inc(first, img(l.pts[0].img));
  inc(last, img(l.pts.at(-1)!.img));
  for (const p of l.pts) inc(all, img(p.img));
}
const top = (m: Map<string, number>) => [...m].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, n]) => `${k}:${n}`).join(' ');
console.log(`first images: ${top(first)}\nlast images: ${top(last)}\nall images: ${top(all)}`);
// a few sample lives, every 20 frames
for (const l of lives.filter((l) => l.pts.length > 40).slice(0, 3)) {
  console.log('sample life:');
  console.log(l.pts.filter((_, i) => i % 20 === 0).map((p) => `${((p.t - l.start) / 54.71).toFixed(1)}s ${p.x.toFixed(0)},${p.y.toFixed(0)} v${p.vx.toFixed(2)},${p.vy.toFixed(2)} ${img(p.img)} pl ${p.px},${p.py}`).join('\n'));
}
