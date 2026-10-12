// Background ("room") descriptors and their block layouts.
//
// Descriptor (bit offsets):  +0 width, +16 height, +32 record count,
//   +48 layout ptr, +80 block table ptr, +112 palette list ptr.
// Layout record (64 bits): flags, x, y, block.
//   flags & 0x000f        palette index (plus 16 * (block >> 12))
//   flags & 0x0010/0x0020 flip x / flip y
//   flags & 0x0040        transparent (clear = draw zero pixels too)
//   flags >> 8            draw priority
//   block & 0x0fff        index into block table, in 32-bit units
// Block table entry: w, h, gfx address.
// Decoded from the game's room builder at FFE0CD00.
import { type Rom, u16, u32, isProgAddr, PROG_BASE, readPalette } from './rom';

export interface RoomDescriptor {
  at: number;
  w: number;
  h: number;
  count: number;
  layout: number;
  table: number;
  palettes: number;
}

export function scanRooms(rom: Rom): RoomDescriptor[] {
  const out: RoomDescriptor[] = [];
  for (let a = PROG_BASE; a < 0xffffff00; a += 16) {
    const w = u16(rom, a), h = u16(rom, a + 16);
    if (w < 100 || w > 1000 || h < 100 || h > 600) continue;
    const layout = u32(rom, a + 48), table = u32(rom, a + 80), palettes = u32(rom, a + 112);
    if (!isProgAddr(layout) || !isProgAddr(table) || !isProgAddr(palettes)) continue;
    if (!isProgAddr(u32(rom, palettes))) continue;
    out.push({ at: a, w, h, count: u16(rom, a + 32), layout, table, palettes });
  }
  return out;
}

/** Render a room to RGBA. Unpainted pixels are left transparent. */
export function renderRoom(rom: Rom, d: RoomDescriptor): { w: number; h: number; rgba: Uint8Array } {
  const W = d.w, H = d.h;
  const rgba = new Uint8Array(W * H * 4);
  const recs: { pri: number; order: number; flags: number; x: number; y: number; blk: number }[] = [];
  for (let i = 0; i < d.count; i++) {
    const a = d.layout + i * 64;
    const flags = u16(rom, a);
    recs.push({ pri: flags >> 8, order: i, flags, x: u16(rom, a + 16), y: u16(rom, a + 32), blk: u16(rom, a + 48) });
  }
  recs.sort((p, q) => p.pri - q.pri || p.order - q.order);
  const palCache = new Map<number, Uint8Array>();
  for (const r of recs) {
    const e = d.table + (r.blk & 0xfff) * 32;
    const w = u16(rom, e), h = u16(rom, e + 16), gfx = u32(rom, e + 32);
    const palIdx = (r.flags & 0xf) + 16 * (r.blk >> 12);
    const palPtr = u32(rom, d.palettes + palIdx * 32);
    let pal = palCache.get(palPtr);
    if (!pal) palCache.set(palPtr, (pal = readPalette(rom, palPtr)));
    const opaque = !(r.flags & 0x40);
    const stride = (w + 3) & ~3;
    const o = (gfx - 0x02000000) >> 3;
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const c = rom.pixels[o + j * stride + i] ?? 0;
        if (!c && !opaque) continue;
        const dx = r.flags & 0x10 ? r.x + w - 1 - i : r.x + i;
        const dy = r.flags & 0x20 ? r.y + h - 1 - j : r.y + j;
        if (dx < 0 || dy < 0 || dx >= W || dy >= H) continue;
        const p = (dy * W + dx) * 4;
        rgba[p] = pal[c * 4];
        rgba[p + 1] = pal[c * 4 + 1];
        rgba[p + 2] = pal[c * 4 + 2];
        rgba[p + 3] = 255;
      }
    }
  }
  return { w: W, h: H, rgba };
}
