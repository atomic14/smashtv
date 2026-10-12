// group header references into runs (animation scripts / image lists)
import { writeFileSync, mkdirSync } from 'node:fs';
import { PNG } from 'pngjs';
import { loadRom, scanHeaders, PROG_BASE, decodeIndices, readPalette } from '../rom';
const rom = loadRom(process.env.HOME + '/Downloads/smashtv.zip');
const hs = scanHeaders(rom);
const at = new Map(hs.map((h, i) => [h.at, i]));
const dv = new DataView(rom.prog.buffer);
const refs: [number, number][] = [];
for (let i = 0; i + 4 <= rom.prog.length; i += 2) {
  const v = dv.getUint32(i, true);
  if (at.has(v)) refs.push([i, at.get(v)!]);
}
const runs: { start: number; frames: number[] }[] = [];
let cur: { start: number; frames: number[] } | null = null;
let last = -999;
for (const [i, h] of refs) {
  if (!cur || i - last > 8) { cur = { start: PROG_BASE + i * 8, frames: [] }; runs.push(cur); }
  cur.frames.push(h); last = i;
}
const out = process.argv[2];
mkdirSync(out, { recursive: true });
writeFileSync(out + '/runs.json', JSON.stringify(runs.map((r, k) => ({ id: k, start: r.start.toString(16), frames: r.frames }))));
writeFileSync(out + '/headers.json', JSON.stringify(hs.map((h, i) => ({ i, ...h }))));
// write each header to its own png for labeling
mkdirSync(out + '/img', { recursive: true });
hs.forEach((h, i) => {
  const idx = decodeIndices(rom, h.gfx, h.w, h.h), pal = readPalette(rom, h.pal);
  const p = new PNG({ width: h.w, height: h.h });
  for (let k = 0; k < idx.length; k++) p.data.set(pal.subarray(idx[k] * 4, idx[k] * 4 + 4), k * 4);
  writeFileSync(`${out}/img/${i}.png`, PNG.sync.write(p));
});
console.log(runs.length, 'runs');
