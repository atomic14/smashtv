// Summarise a boss recording: which images appear, and where the given header indices are drawn over time.
import { readFileSync } from 'node:fs';
import { loadRom, scanHeaders } from '../rom';
const [log, ...watch] = process.argv.slice(2);
const rom = loadRom(process.env.HOME + '/Downloads/smashtv.zip');
const hs = scanHeaders(rom);
const byGfx = new Map(hs.map((h, i) => [h.gfx, i]));
const find = (off: number, flip: boolean) => {
  if (byGfx.has(off)) return byGfx.get(off)!;
  if (flip) for (const [i, h] of hs.entries()) { const st = (h.w + 3) & ~3; if (off === h.gfx + (st - 1) * 8 || off === h.gfx + (h.w - 1) * 8) return i; }
  return -1;
};
const counts = new Map<number, number>();
const track: string[] = [];
const lines = readFileSync(log, 'utf8').trim().split('\n');
lines.forEach((l, n) => {
  const r = JSON.parse(l) as { frame: number; blits: number[][] };
  for (const b of r.blits) {
    const i = find(b[1], !!(b[0] & 0x10));
    if (i < 0) continue;
    counts.set(i, (counts.get(i) ?? 0) + 1);
    if (watch.includes(String(i)) && n % 15 === 0) track.push(`f${r.frame} #${i} ${b[0] & 0x10 ? 'F' : ' '} x${b[5]} y${b[6]}`);
  }
});
console.log('frames', lines.length);
console.log([...counts].sort((a, b) => a[0] - b[0]).map(([i, c]) => `${i}:${c}`).join(' '));
console.log(track.slice(0, 80).join('\n'));
