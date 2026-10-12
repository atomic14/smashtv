// Render images side by side at 4x: #<scan index>, h<header address>, or a gfx offset.
import { writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { loadRom, scanHeaders, scanPlainHeaders, decodeIndices, readPalette, SYSTEM_PALETTE } from '../rom';
const rom = loadRom(process.env.HOME + '/Downloads/smashtv.zip');
const hs = scanHeaders(rom), ps = scanPlainHeaders(rom);
const [out, ...refs] = process.argv.slice(2);
const pick = refs.map((r) => {
  if (r.startsWith('#')) return hs[+r.slice(1)];
  if (r.startsWith('h')) { const at = parseInt(r.slice(1), 16) | 0xff000000; return [...hs, ...ps].find((h) => (h.at >>> 0) === (at >>> 0)); }
  const off = parseInt(r, 16);
  const all = [...hs, ...ps];
  const h = all.filter((h) => off >= h.gfx && off < h.gfx + ((h.w + 3) & ~3) * h.h * 8).sort((a, b) => b.gfx - a.gfx)[0];
  console.log(r, h ? `in ${hs.includes(h) ? '#' + hs.indexOf(h) : 'p' + ps.indexOf(h)} ${h.w}x${h.h} +${(off - h.gfx) / 8}px` : 'none');
  return h;
}).filter(Boolean);
const S = 4, W = pick.reduce((s, h) => s + h.w + 4, 0) * S, H = Math.max(...pick.map((h) => h.h)) * S;
const png = new PNG({ width: W, height: H });
png.data.fill(60);
let x0 = 0;
for (const h of pick) {
  const pal = h.pal ? readPalette(rom, h.pal) : readPalette(rom, SYSTEM_PALETTE);
  const idx = decodeIndices(rom, h.gfx, h.w, h.h);
  for (let y = 0; y < h.h * S; y++) for (let x = 0; x < h.w * S; x++) {
    const i = idx[Math.floor(y / S) * h.w + Math.floor(x / S)];
    if (!i) continue;
    const o = (y * W + x0 + x) * 4;
    png.data.set([pal[i * 4], pal[i * 4 + 1], pal[i * 4 + 2], 255], o);
  }
  x0 += (h.w + 4) * S;
}
writeFileSync(out, PNG.sync.write(png));
