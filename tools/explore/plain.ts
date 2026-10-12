import { writeFileSync, mkdirSync } from 'node:fs';
import { PNG } from 'pngjs';
import { loadRom, scanHeaders, scanPlainHeaders, decodeIndices, readPalette } from '../rom';
const rom = loadRom(process.env.HOME + '/Downloads/smashtv.zip');
const full = new Set(scanHeaders(rom).map(h => h.gfx));
const hs = scanPlainHeaders(rom).filter(h => !full.has(h.gfx));
const out = process.argv[2];
mkdirSync(out + '/img', { recursive: true });
const pal = readPalette(rom, 0xfffc6160);
hs.forEach((h, i) => {
  const idx = decodeIndices(rom, h.gfx, h.w, h.h);
  const p = new PNG({ width: h.w, height: h.h });
  for (let k = 0; k < idx.length; k++) p.data.set(pal.subarray(idx[k] * 4, idx[k] * 4 + 4), k * 4);
  writeFileSync(`${out}/img/${i}.png`, PNG.sync.write(p));
});
writeFileSync(out + '/headers.json', JSON.stringify(hs.map((h, i) => ({ i, ...h }))));
console.log(hs.length, 'plain headers', hs[0]?.at.toString(16), hs.at(-1)?.at.toString(16));
