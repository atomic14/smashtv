// Per sampled frame, the set of header indices (in a range) drawn, with F for flipped.
import { readFileSync } from 'node:fs';
import { loadRom, scanHeaders } from '../rom';
const [log, lo, hi, every] = process.argv.slice(2);
const rom = loadRom(process.env.HOME + '/Downloads/smashtv.zip');
const hs = scanHeaders(rom);
const find = (off: number) => {
  for (const [i, h] of hs.entries()) { const st = (h.w + 3) & ~3; if (off >= h.gfx && off < h.gfx + st * h.h * 8) return i; }
  return -1;
};
const lines = readFileSync(log, 'utf8').trim().split('\n');
for (let n = 0; n < lines.length; n += Number(every)) {
  const r = JSON.parse(lines[n]) as { frame: number; blits: number[][] };
  const parts = new Set<string>();
  let ax = 0;
  for (const b of r.blits) {
    const i = find(b[1]);
    if (i >= Number(lo) && i <= Number(hi)) { parts.add(`${i}${b[0] & 0x10 ? 'F' : ''}`); if (i === 993 && !(b[0] & 0x10)) ax = b[5] + hs[i].xoff; }
  }
  if (parts.size) console.log(`f${r.frame} X~${ax}`, [...parts].sort().join(' '));
}
