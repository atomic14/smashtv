// Summarise process/object recordings from tools/mame/waverun.lua: per room, for each
// process id, how many were started, when, and what their objects look like and how fast
// they move.
//   npx tsx tools/explore/procs.ts <room_w1_0_1.jsonl>...
import { createReadStream, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { basename } from 'node:path';

const anims = JSON.parse(readFileSync('public/assets/anims.json', 'utf8')).anims as Record<string, [string, number][]>;
const name = new Map<number, string>();
for (const [n, fr] of Object.entries(anims)) for (const [k] of fr) { const a = parseInt(k.split('~')[0], 16) & 0xffffff; if (!name.has(a)) name.set(a, n); }
const imgName = (img: number) => name.get(img) ?? img.toString(16);

interface Stat { starts: number; first: number; last: number; imgs: Map<string, number>; speeds: number[]; peak: number }

async function room(file: string) {
  const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  const prev = new Map<number, number>(); // proc addr -> id
  const stats = new Map<number, Stat>();
  let exitT = -1, sawShut = false, lastT = 0, roomNo = -1, cap = -1;
  let slots: number[] = [];
  for await (const line of rl) {
    const r = JSON.parse(line) as { t: number; x: number; pr: number[][]; ob?: number[][]; room?: number; slots?: number[]; cap?: number };
    if (r.room !== undefined && roomNo < 0 && r.t > 30) { roomNo = r.room; slots = r.slots!; cap = r.cap!; }
    lastT = r.t;
    if (!r.x) sawShut = true;
    else if (sawShut && exitT < 0) exitT = r.t;
    const objs = new Map((r.ob ?? []).map((o) => [o[0], o]));
    const now = new Map<number, number>();
    const live = new Map<number, number>();
    for (const [id, addr, obj] of r.pr) {
      now.set(addr, id);
      live.set(id, (live.get(id) ?? 0) + 1);
      let s = stats.get(id);
      if (!s) stats.set(id, (s = { starts: 0, first: r.t, last: r.t, imgs: new Map(), speeds: [], peak: 0 }));
      if (prev.get(addr) !== id && r.t > 0) { s.starts++; s.last = r.t; }
      const o = objs.get(obj);
      if (o) {
        const n = imgName(o[1]).replace(/\.(u|d|l|r|ul|ur|dl|dr|h|v|\d+)$/, '');
        s.imgs.set(n, (s.imgs.get(n) ?? 0) + 1);
        const v = Math.hypot(o[4], o[5]);
        if (v > 0) s.speeds.push(v);
      }
    }
    for (const [id, n] of live) { const s = stats.get(id)!; s.peak = Math.max(s.peak, n); }
    prev.clear();
    for (const [a, id] of now) prev.set(a, id);
  }
  const sl: string[] = [];
  for (let i = 0; i < 48 && slots[i]; i += 6) sl.push(`[${slots.slice(i, i + 6).join(',')}]`);
  console.log(`${basename(file)} room ${roomNo} cap ${cap}  ${(lastT / 60).toFixed(0)}s, exits ${exitT >= 0 ? (exitT / 60).toFixed(1) + 's' : 'never'}  slots ${sl.join(' ')}`);
  for (const [id, s] of [...stats].sort((a, b) => a[0] - b[0])) {
    if (s.starts === 0 && s.imgs.size === 0) continue;
    s.speeds.sort((a, b) => a - b);
    const med = s.speeds.length ? s.speeds[s.speeds.length >> 1].toFixed(2) : '-';
    const imgs = [...s.imgs].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k]) => k).join(' ');
    console.log(`  ${id.toString(16).padStart(4, '0')} starts ${String(s.starts).padStart(4)} peak ${String(s.peak).padStart(3)} ` +
      `t ${(s.first / 60).toFixed(0)}-${(s.last / 60).toFixed(0)}s  v~${med}  ${imgs}`);
  }
}

for (const f of process.argv.slice(2)) await room(f);
