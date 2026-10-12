// Extract Smash T.V. graphics from the original ROM set into web assets.
// usage: npm run extract -- <path/to/smashtv.zip>
//
// Writes:
//   public/assets/sprites-N.png + sprites.json  every image header found in the program ROM
//   public/assets/rooms/<addr>.png + rooms.json   every background (arena/title) layout
import { mkdirSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { loadRom, scanHeaders, scanPlainHeaders, decodeIndices, readPalette, u16, u32, type ImageHeader } from './rom';
import { scanRooms, renderRoom } from './rooms';
import { CATALOG, FONT_BIG, FONT_SMALL } from './catalog';
import { roomCells, roomWaves, roomCaps } from './waves';

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
// Every image gets an atlas key: its header address, plus `~<palette>` for palette variants
// (the same image drawn with another header's palette, e.g. the blue cobra).
interface Sprite { key: string; h: ImageHeader }
const sprites: Sprite[] = [...withPal, ...plain].map((h) => ({ key: hex(h.at), h }));
const headerFor = (ref: string) => (ref.startsWith('p') ? plain[Number(ref.slice(1))] : withPal[Number(ref)]);
for (const ref of new Set(Object.values(CATALOG).flat().map(String))) {
  const at = ref.match(/^(p?\d+)~@([0-9a-f]+)f?$/);
  if (at) {
    const base = headerFor(at[1]);
    sprites.push({ key: `${hex(base.at)}~${at[2]}`, h: { ...base, pal: parseInt(at[2], 16) } });
    continue;
  }
  const m = ref.match(/^(\d+)~(\d+)f?$/);
  if (!m) continue;
  const base = withPal[Number(m[1])], other = withPal[Number(m[2])];
  sprites.push({ key: `${hex(base.at)}~${hex(other.pal)}`, h: { ...base, pal: other.pal } });
}

const PAGE = 2048;
const PAD = 1;
interface Placed { key: string; h: ImageHeader; page: number; x: number; y: number }
const placed: Placed[] = [];
const order = [...sprites].sort((a, b) => b.h.h - a.h.h || b.h.w - a.h.w);
let page = 0, cx = 0, cy = 0, rowH = 0;
const pageHeights: number[] = [];
for (const { key, h } of order) {
  if (cx + h.w + PAD > PAGE) { cx = 0; cy += rowH + PAD; rowH = 0; }
  if (cy + h.h + PAD > PAGE) { pageHeights[page] = cy; page++; cx = 0; cy = 0; rowH = 0; }
  placed.push({ key, h, page, x: cx, y: cy });
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
for (const { key, h, page, x, y } of placed) frames[key] = [page, x, y, h.w, h.h, h.xoff, h.yoff];
writeFileSync(`${OUT}/sprites.json`, JSON.stringify({ pages: pngs.length, frames }));
console.log(`sprites: ${sprites.length} images on ${pngs.length} page(s)`);

// ---- named animations and fonts ---------------------------------------------------
const resolve = (ref: number | string): [string, number] => {
  const s = String(ref);
  const flip = s.endsWith('f') ? 1 : 0;
  const body = flip ? s.slice(0, -1) : s;
  const [img, palFrom] = body.split('~');
  const h = headerFor(img);
  if (palFrom?.startsWith('@')) return [`${hex(h.at)}~${palFrom.slice(1)}`, flip];
  if (!h || (palFrom && !withPal[Number(palFrom)])) throw new Error(`catalog ref ${s} out of range`);
  return [palFrom ? `${hex(h.at)}~${hex(withPal[Number(palFrom)].pal)}` : hex(h.at), flip];
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

// ---- world maps -----------------------------------------------------------------
// Table at FFE72650 (indexed by the world number in RAM 010EB610) points at one list per
// world of (descriptor, world x, world y) entries, terminated by -1. Arenas sit on a grid
// ~472x332 apart; corridor pieces between them say which neighbours are connected:
//   FFF6C720 at (col + 0.83, row)  joins (col, row) and (col + 1, row)
//   FFF6C690 at (col, row + 0.76)  joins (col, row) and (col, row + 1)
//   FFF6C7B0                       joins the TV studio (col -1) to the first arena
const GRID_X = 472.25, GRID_Y = 332.4, X0 = 477, Y0 = 5;
const worlds = [];
for (let w = 0; w < 3; w++) {
  const list = u32(rom, 0xffe72650 + w * 32);
  const cells: { bg: string; col: number; row: number }[] = [];
  const links: [number, number, number, number][] = [];
  let start = { col: -1, row: 0 };
  for (let a = list; u32(rom, a) !== 0xffffffff; a += 64) {
    const d = u32(rom, a), x = u16(rom, a + 32), y = u16(rom, a + 48);
    const fc = (x - X0) / GRID_X, fr = (y - Y0) / GRID_Y;
    const col = Math.round(fc), row = Math.round(fr);
    if (d === 0xfff6c840) start = { col: -1, row };
    else if (d === 0xfff6c720) links.push([Math.floor(fc), row, Math.floor(fc) + 1, row]);
    else if (d === 0xfff6c690) links.push([col, Math.floor(fr), col, Math.floor(fr) + 1]);
    else if (d === 0xfff6c7b0) links.push([-1, row, 0, row]);
    else if (Math.abs(fr - row) < 0.05 && roomIndex[hex(d)]) cells.push({ bg: hex(d), col, row });
  }
  // room numbers, waves and alive caps (see tools/waves.ts)
  const numbers = roomCells(rom, w, start);
  const waves = roomWaves(rom, w, Math.max(...numbers.keys()));
  const rooms = cells.map((c) => {
    const n = [...numbers].find(([, v]) => v.col === c.col && v.row === c.row)?.[0];
    return n ? { ...c, n, waves: waves[n - 1], caps: roomCaps(rom, w, n) } : c;
  });
  worlds.push({ start, rooms, links });
}
writeFileSync(`${OUT}/worlds.json`, JSON.stringify(worlds));
console.log(`worlds: ${worlds.map((w) => w.rooms.length).join('/')} rooms, ${worlds.map((w) => w.rooms.filter((r) => 'n' in r).length).join('/')} with waves`);

function nextPow2(n: number) {
  let p = 1;
  while (p < n) p *= 2;
  return p;
}
