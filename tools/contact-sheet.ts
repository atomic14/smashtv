// Dev tool: render every image header found in the program ROM onto contact sheets.
// usage: tsx tools/contact-sheet.ts <smashtv.zip> <outdir>
import { mkdirSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { loadRom, scanHeaders, decodeIndices, readPalette } from './rom';

const [zip, outDir] = process.argv.slice(2);
const rom = loadRom(zip);
const headers = scanHeaders(rom).sort((a, b) => a.gfx - b.gfx);
mkdirSync(outDir, { recursive: true });

const W = 1024;
const H = 2048;
let sheet = newSheet();
let x = 0, y = 0, rowH = 0, n = 0;
const index: object[] = [];

function newSheet() {
  const png = new PNG({ width: W, height: H });
  for (let i = 0; i < W * H; i++) png.data.set([48, 0, 48, 255], i * 4);
  return png;
}
function flush(final = false) {
  const out = final ? cropped(sheet, y + rowH) : sheet;
  writeFileSync(`${outDir}/sheet${n}.png`, PNG.sync.write(out));
  n++;
}
function cropped(png: PNG, h: number) {
  const c = new PNG({ width: W, height: Math.max(1, h) });
  png.data.copy(c.data, 0, 0, W * c.height * 4);
  return c;
}

for (const hd of headers) {
  if (x + hd.w > W) { x = 0; y += rowH + 3; rowH = 0; }
  if (y + hd.h > H) { flush(); sheet = newSheet(); x = 0; y = 0; rowH = 0; }
  const idx = decodeIndices(rom, hd.gfx, hd.w, hd.h);
  const pal = readPalette(rom, hd.pal);
  for (let j = 0; j < hd.h; j++) {
    for (let i = 0; i < hd.w; i++) {
      const c = idx[j * hd.w + i];
      if (!c) continue;
      sheet.data.set(pal.subarray(c * 4, c * 4 + 4), ((y + j) * W + x + i) * 4);
    }
  }
  index.push({ sheet: n, x, y, ...hd, at: hd.at.toString(16), gfx: hd.gfx.toString(16), pal: hd.pal.toString(16) });
  x += hd.w + 3;
  rowH = Math.max(rowH, hd.h);
}
flush(true);
writeFileSync(`${outDir}/index.json`, JSON.stringify(index, null, 1));
console.log(`${headers.length} images on ${n} sheets`);
