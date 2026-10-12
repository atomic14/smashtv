import { writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { loadRom, u16, u32, readPalette } from '../rom';
const rom = loadRom(process.env.HOME + '/Downloads/smashtv.zip');
const [layout, table, palList, out, skipArg] = process.argv.slice(2);
const skip = new Set((skipArg ?? '').split(',').filter(Boolean));
const pals = [readPalette(rom, u32(rom, parseInt(palList, 16))), readPalette(rom, u32(rom, parseInt(palList, 16) + 32))];
const W = 400, H = 256;
const png = new PNG({ width: W, height: H });
for (let i = 0; i < W * H; i++) png.data.set([255, 0, 255, 255], i * 4);
let a = parseInt(layout, 16);
for (;; a += 64) {
  const fl = u16(rom, a); if (fl === 0xffff) break;
  const x = u16(rom, a + 16), y = u16(rom, a + 32), idx = u16(rom, a + 48);
  const e = parseInt(table, 16) + idx * 32;
  const w = u16(rom, e), h = u16(rom, e + 16), g = u32(rom, e + 32);
  if (skip.has((fl >> 8).toString(16))) continue;
  const pal = g < 0x025b0000 ? pals[1] : pals[0];
  const stride = (w + 3) & ~3, o = (g - 0x02000000) >> 3;
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
    const c = rom.pixels[o + j * stride + i]; if (!c) continue;
    const dx = fl & 0x10 ? x + w - 1 - i : x + i, dy = fl & 0x20 ? y + h - 1 - j : y + j;
    if (dx < 0 || dy < 0 || dx >= W || dy >= H) continue;
    png.data.set(pal.subarray(c * 4, c * 4 + 4), (dy * W + dx) * 4);
  }
}
writeFileSync(out, PNG.sync.write(png));
