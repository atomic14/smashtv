// Extract Smash T.V. graphics from the original ROM set into web assets.
// usage: npm run extract -- <path/to/smashtv.zip>
//
// Writes:
//   public/assets/sprites-N.png + sprites.json  every image header found in the program ROM
//   public/assets/rooms/<addr>.png + rooms.json   every background (arena/title) layout
import { mkdirSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { loadRom, scanHeaders, scanPlainHeaders, decodeIndices, readPalette, type ImageHeader } from './rom';
import { scanRooms, renderRoom } from './rooms';
import { CATALOG, FONT_BIG, FONT_SMALL } from './catalog';

const zip = process.argv[2];
if (!zip) {
  console.error('usage: npm run extract -- <path/to/smashtv.zip>');
  process.exit(1);
}
const OUT = 'public/assets';
mkdirSync(`${OUT}/rooms`, { recursive: true });
const rom = loadRom(zip);
const hex = (n: number) => n.toString(16);

// ---- sprites --------------------------------------------------------------------
const withPal = scanHeaders(rom);
const seen = new Set(withPal.map((h) => h.gfx));
const plain = scanPlainHeaders(rom).filter((h) => !seen.has(h.gfx));
const headers: ImageHeader[] = [...withPal, ...plain];

const PAGE = 2048;
const PAD = 1;
interface Placed { h: ImageHeader; page: number; x: number; y: number }
const placed: Placed[] = [];
const order = [...headers].sort((a, b) => b.h - a.h || b.w - a.w);
let page = 0, cx = 0, cy = 0, rowH = 0;
const pageHeights: number[] = [];
for (const h of order) {
  if (cx + h.w + PAD > PAGE) { cx = 0; cy += rowH + PAD; rowH = 0; }
  if (cy + h.h + PAD > PAGE) { pageHeights[page] = cy; page++; cx = 0; cy = 0; rowH = 0; }
  placed.push({ h, page, x: cx, y: cy });
  cx += h.w + PAD;
  rowH = Math.max(rowH, h.h);
}
pageHeights[page] = cy + rowH;

const pngs = pageHeights.map((ph) => new PNG({ width: PAGE, height: nextPow2(ph) }));
const palCache = new Map<number, Uint8Array>();
for (const { h, page, x, y } of placed) {
  let pal = palCache.get(h.pal);
  if (!pal) palCache.set(h.pal, (pal = readPalette(rom, h.pal)));
  const idx = decodeIndices(rom, h.gfx, h.w, h.h);
  const png = pngs[page];
  for (let j = 0; j < h.h; j++) {
    for (let i = 0; i < h.w; i++) {
      const c = idx[j * h.w + i];
      if (!c) continue;
      png.data.set(pal.subarray(c * 4, c * 4 + 4), ((y + j) * PAGE + x + i) * 4);
    }
  }
}
pngs.forEach((p, i) => writeFileSync(`${OUT}/sprites-${i}.png`, PNG.sync.write(p)));

// frame tuple: [page, x, y, w, h, xoff, yoff]
const frames: Record<string, number[]> = {};
for (const { h, page, x, y } of placed) frames[hex(h.at)] = [page, x, y, h.w, h.h, h.xoff, h.yoff];
writeFileSync(`${OUT}/sprites.json`, JSON.stringify({ pages: pngs.length, frames }));
console.log(`sprites: ${headers.length} images on ${pngs.length} page(s)`);

// ---- named animations and fonts ---------------------------------------------------
const resolve = (ref: number | string): [string, number] => {
  const s = String(ref);
  const flip = s.endsWith('f') ? 1 : 0;
  const body = flip ? s.slice(0, -1) : s;
  const h = body.startsWith('p') ? plain[Number(body.slice(1))] : withPal[Number(body)];
  if (!h) throw new Error(`catalog ref ${s} out of range`);
  return [hex(h.at), flip];
};
const anims: Record<string, [string, number][]> = {};
for (const [name, refs] of Object.entries(CATALOG)) anims[name] = refs.map(resolve);
const font = (table: string) => {
  const out: Record<string, string> = {};
  table.split(',').forEach((n, i) => (out[String.fromCharCode(33 + i)] = resolve(Number(n))[0]));
  return out;
};
writeFileSync(`${OUT}/anims.json`, JSON.stringify({ anims, fonts: { big: font(FONT_BIG), small: font(FONT_SMALL) } }));
console.log(`anims: ${Object.keys(anims).length}`);

// ---- rooms ----------------------------------------------------------------------
const rooms = scanRooms(rom);
const roomIndex: Record<string, { w: number; h: number }> = {};
for (const d of rooms) {
  const { w, h, rgba } = renderRoom(rom, d);
  const png = new PNG({ width: w, height: h });
  png.data.set(rgba);
  writeFileSync(`${OUT}/rooms/${hex(d.at)}.png`, PNG.sync.write(png));
  roomIndex[hex(d.at)] = { w, h };
}
writeFileSync(`${OUT}/rooms.json`, JSON.stringify(roomIndex));
console.log(`rooms: ${rooms.length}`);

function nextPow2(n: number) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}
