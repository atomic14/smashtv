// List the blits of chosen header indices for frames matching a predicate (first N matches).
import { readFileSync } from 'node:fs';
import { loadRom, scanHeaders } from '../rom';
const [log, want, nArg] = process.argv.slice(2);
const ids = new Set(want.split(',').map(Number));
const rom = loadRom(process.env.HOME + '/Downloads/smashtv.zip');
const hs = scanHeaders(rom);
const find = (off: number) => {
  for (const [i, h] of hs.entries()) { const st = (h.w + 3) & ~3; if (off >= h.gfx && off < h.gfx + st * h.h * 8) return i; }
  return -1;
};
let shown = 0;
for (const l of readFileSync(log, 'utf8').trim().split('\n')) {
  const r = JSON.parse(l) as { frame: number; blits: number[][] };
  const hits = r.blits.map((b) => [find(b[1]), b] as const).filter(([i]) => ids.has(i));
  if (!hits.length) continue;
  console.log('frame', r.frame, hits.map(([i, b]) => `#${i}${b[0] & 0x10 ? 'F' : ''}@${b[5]},${b[6]}`).join(' '));
  if (++shown >= Number(nArg ?? 10)) break;
}
