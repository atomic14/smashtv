// Summarise room recordings from tools/mame/waverun.lua: per room, how long until the exits
// open and, per object type, how many spawned, from which side, when, and how fast they move.
//   npx tsx tools/explore/waves.ts <room_w1_0_1.jsonl>... [--json out.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { loadRom, scanHeaders, scanPlainHeaders } from '../rom';

const args = process.argv.slice(2);
const jsonAt = args.indexOf('--json');
const jsonOut = jsonAt >= 0 ? args.splice(jsonAt, 2)[1] : null;
const rom = loadRom(process.env.HOME + '/Downloads/smashtv.zip');
const anims = JSON.parse(readFileSync('public/assets/anims.json', 'utf8')).anims as Record<string, [string, number][]>;

// header address -> anim name, then any blit source offset -> anim name
const byHeader = new Map<number, string>();
for (const [name, frames] of Object.entries(anims)) {
  for (const [key] of frames) {
    const at = parseInt(key.split('~')[0], 16);
    if (!byHeader.has(at)) byHeader.set(at, name);
  }
}
const byOff = new Map<number, { name: string; w: number; h: number }>();
const hs = scanHeaders(rom);
for (const [i, h] of [...hs, ...scanPlainHeaders(rom)].entries()) {
  // uncatalogued images are named by their scan index, e.g. #597
  const name = byHeader.get(h.at >>> 0) ?? (i < hs.length ? `#${i}` : `p${i - hs.length}`);
  const st = (h.w + 3) & ~3;
  for (const off of [h.gfx, h.gfx + (st - 1) * 8, h.gfx + (h.w - 1) * 8]) {
    if (!byOff.has(off)) byOff.set(off, { name, w: h.w, h: h.h });
  }
}
/** Object type for an anim name: grunt.u -> grunt; pickups and prizes keep their kind. */
const typeOf = (n: string) => (/^(pu|prize)\./.test(n) ? n : /pellet/.test(n) ? 'pellet' : n.split('.')[0]);
const IGNORE = /^(legs|torso|shot|missile|spark|exit|arrow|ring|digits|lifebar|font|logo|boom|puff|blood|text|map|blade)/;

interface Track { type: string; x: number; y: number; born: number; last: number; path: [number, number, number][] }
const side = (x: number, y: number) => (x < 40 ? 'L' : x > 362 ? 'R' : y < 52 ? 'U' : y > 236 ? 'D' : 'in');

const report: Record<string, unknown> = {};
for (const file of args) {
  const lines = readFileSync(file, 'utf8').trim().split('\n');
  const live: Track[] = [];
  const done: Track[] = [];
  let exitT = -1;
  let sawShut = false;
  let lastT = 0;
  const unknown = new Map<number, number>();
  for (const line of lines) {
    const r = JSON.parse(line) as { t: number; x: number; b: number[][] };
    lastT = r.t;
    // the previous room's exit sign is still on screen while scrolling in
    if (!r.x) sawShut = true;
    else if (sawShut && exitT < 0) exitT = r.t;
    const objs: { type: string; x: number; y: number }[] = [];
    for (const b of r.b) {
      const hit = byOff.get(b[1]);
      if (!hit) {
        unknown.set(b[1], (unknown.get(b[1]) ?? 0) + 1);
        continue;
      }
      if (IGNORE.test(hit.name)) continue;
      objs.push({ type: typeOf(hit.name), x: b[4] + b[2] / 2, y: b[5] + b[3] / 2 });
    }
    // greedy nearest matching per type
    const used = new Set<number>();
    for (const t of live) {
      let best = -1, bd = 18 * 18;
      objs.forEach((o, i) => {
        if (used.has(i) || o.type !== t.type) return;
        const d = (o.x - t.x) ** 2 + (o.y - t.y) ** 2;
        if (d < bd) { bd = d; best = i; }
      });
      if (best >= 0) {
        used.add(best);
        t.x = objs[best].x; t.y = objs[best].y; t.last = r.t;
        t.path.push([r.t, t.x, t.y]);
      }
    }
    objs.forEach((o, i) => {
      if (!used.has(i)) live.push({ ...o, born: r.t, last: r.t, path: [[r.t, o.x, o.y]] });
    });
    for (let i = live.length - 1; i >= 0; i--) {
      if (r.t - live[i].last > 20) done.push(...live.splice(i, 1));
    }
  }
  done.push(...live);
  const tracks = done.filter((t) => t.last - t.born >= 12);

  const types = new Map<string, Track[]>();
  for (const t of tracks) types.set(t.type, [...(types.get(t.type) ?? []), t]);
  const room: Record<string, unknown> = { frames: lastT, exitsOpen: exitT };
  const out: string[] = [`${basename(file)}  ${lastT} frames, exits at ${exitT >= 0 ? (exitT / 60).toFixed(1) + 's' : 'never'}`];
  for (const [type, ts] of [...types].sort((a, b) => b[1].length - a[1].length)) {
    const sides: Record<string, number> = {};
    for (const t of ts) sides[side(t.path[0][1], t.path[0][2])] = (sides[side(t.path[0][1], t.path[0][2])] ?? 0) + 1;
    // speed: net displacement over 20-frame windows, median
    const v: number[] = [];
    for (const t of ts) {
      for (let i = 0; i + 20 < t.path.length; i += 10) {
        const a = t.path[i], b = t.path[i + 20];
        if (b[0] - a[0] !== 20) continue;
        v.push(Math.hypot(b[1] - a[1], b[2] - a[2]) / 20);
      }
    }
    v.sort((a, b) => a - b);
    const q = (p: number) => (v.length ? v[Math.floor(p * (v.length - 1))] : 0);
    // spawns per 10s bucket and peak on-screen
    const buckets: number[] = [];
    for (const t of ts) buckets[Math.floor(t.born / 600)] = (buckets[Math.floor(t.born / 600)] ?? 0) + 1;
    let peak = 0;
    for (let f = 0; f < lastT; f += 30) peak = Math.max(peak, ts.filter((t) => t.born <= f && t.last >= f).length);
    const life = ts.map((t) => t.last - t.born).sort((a, b) => a - b);
    room[type] = { n: ts.length, sides, speed: [q(0.25), q(0.5), q(0.75)], buckets: [...buckets].map((x) => x ?? 0), peak, life: life[life.length >> 1] };
    out.push(`  ${type.padEnd(14)} n=${String(ts.length).padStart(3)} peak=${String(peak).padStart(2)} life~${(life[life.length >> 1] / 60).toFixed(1)}s ` +
      `speed q25/50/75 ${q(0.25).toFixed(2)}/${q(0.5).toFixed(2)}/${q(0.75).toFixed(2)} px/f  sides ${JSON.stringify(sides)}  per10s ${[...buckets].map((x) => x ?? 0).join(',')}`);
  }
  const unk = [...unknown].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([o, c]) => `${o.toString(16)}:${c}`);
  if (unk.length) out.push(`  unmatched: ${unk.join(' ')}`);
  console.log(out.join('\n'));
  report[basename(file, '.jsonl')] = room;
}
if (jsonOut) writeFileSync(jsonOut, JSON.stringify(report, null, 1));
