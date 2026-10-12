// Smash T.V. (Williams Y-unit) ROM access.
//
// Hardware notes (see MAME src/mame/williams/midyunit*.cpp):
//  - TMS34010 CPU; all addresses are *bit* addresses.
//  - Program ROM: u105 (even bytes) + u89 (odd bytes), 16-bit little-endian words,
//    mapped so that byte 0 of the interleaved image is at bit address 0xFFE00000.
//  - Graphics ROM: 3 bit-planes groups (u111-113, u95-97, u106-108). Each byte holds
//    2 bits for 4 consecutive pixels; the three groups give 6 bits per pixel.
//    The blitter addresses decoded pixels at (bitaddr - 0x02000000) >> 3.
//  - Palettes in program ROM: u16 count, followed by `count` xRRRRRGGGGGBBBBB words.

import { readFileSync } from 'node:fs';
import { unzipSync } from 'fflate';

export const PROG_BASE = 0xffe00000;
export const GFX_BASE = 0x02000000;

export interface Rom {
  prog: Uint8Array;
  pixels: Uint8Array; // one 6-bit pixel per byte
  sound: { u4: Uint8Array; u19: Uint8Array; u20: Uint8Array };
}

export function loadRom(zipPath: string): Rom {
  const files = unzipSync(readFileSync(zipPath));
  const byChip = new Map<string, Uint8Array>();
  for (const [name, data] of Object.entries(files)) {
    const m = name.toLowerCase().match(/u(\d+)/);
    if (m) byChip.set('u' + m[1], data);
  }
  const chip = (id: string) => {
    const d = byChip.get(id);
    if (!d) throw new Error(`ROM chip ${id} missing from ${zipPath}`);
    return d;
  };

  const even = chip('u105');
  const odd = chip('u89');
  const prog = new Uint8Array(even.length * 2);
  for (let i = 0; i < even.length; i++) {
    prog[i * 2] = even[i];
    prog[i * 2 + 1] = odd[i];
  }

  const groups = [
    ['u111', 'u112', 'u113'],
    ['u95', 'u96', 'u97'],
    ['u106', 'u107', 'u108'],
  ].map((g) => concat(g.map(chip)));
  const pixels = new Uint8Array(groups[0].length * 4);
  for (let k = 0; k < 3; k++) {
    const plane = groups[k];
    for (let i = 0; i < plane.length; i++) {
      const b = plane[i];
      const o = i * 4;
      pixels[o] |= (b & 3) << (2 * k);
      pixels[o + 1] |= ((b >> 2) & 3) << (2 * k);
      pixels[o + 2] |= ((b >> 4) & 3) << (2 * k);
      pixels[o + 3] |= ((b >> 6) & 3) << (2 * k);
    }
  }

  return { prog, pixels, sound: { u4: chip('u4'), u19: chip('u19'), u20: chip('u20') } };
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

export function progOffset(addr: number): number {
  return (addr - PROG_BASE) / 8;
}

export function isProgAddr(addr: number): boolean {
  return addr >= PROG_BASE && addr < 0x100000000 && addr % 16 === 0;
}

export function u16(rom: Rom, addr: number): number {
  const i = progOffset(addr);
  return rom.prog[i] | (rom.prog[i + 1] << 8);
}

export function s16(rom: Rom, addr: number): number {
  const v = u16(rom, addr);
  return v & 0x8000 ? v - 0x10000 : v;
}

export function u32(rom: Rom, addr: number): number {
  return (u16(rom, addr) | (u16(rom, addr + 16) << 16)) >>> 0;
}

/** RGBA palette (index 0 transparent) from a ROM palette pointer. */
export function readPalette(rom: Rom, addr: number): Uint8Array {
  const count = Math.min(u16(rom, addr), 256);
  const out = new Uint8Array(256 * 4);
  for (let i = 0; i < count; i++) {
    const v = u16(rom, addr + 16 + i * 16);
    out[i * 4] = Math.round((((v >> 10) & 31) * 255) / 31);
    out[i * 4 + 1] = Math.round((((v >> 5) & 31) * 255) / 31);
    out[i * 4 + 2] = Math.round(((v & 31) * 255) / 31);
    out[i * 4 + 3] = i === 0 ? 0 : 255;
  }
  return out;
}

export interface ImageHeader {
  at: number; // bit address of the header in program ROM
  w: number;
  h: number;
  xoff: number;
  yoff: number;
  gfx: number; // bit address in graphics ROM
  pal: number; // bit address of palette in program ROM
}

/** Scan program ROM for 16-byte image headers: w, h, xoff, yoff, gfxaddr, palptr. */
export function scanHeaders(rom: Rom): ImageHeader[] {
  const out: ImageHeader[] = [];
  const maxGfx = GFX_BASE + rom.pixels.length * 8;
  const p = rom.prog;
  const dv = new DataView(p.buffer, p.byteOffset, p.byteLength);
  for (let i = 0; i + 16 <= p.length; i += 2) {
    const w = dv.getUint16(i, true);
    const h = dv.getUint16(i + 2, true);
    if (w < 1 || w > 512 || h < 1 || h > 300) continue;
    const gfx = dv.getUint32(i + 8, true);
    if (gfx < GFX_BASE || gfx >= maxGfx || gfx % 8) continue;
    const pal = dv.getUint32(i + 12, true);
    if (!isProgAddr(pal)) continue;
    const count = u16(rom, pal);
    if (count < 1 || count > 256) continue;
    out.push({
      at: PROG_BASE + i * 8,
      w,
      h,
      xoff: dv.getInt16(i + 4, true),
      yoff: dv.getInt16(i + 6, true),
      gfx,
      pal,
    });
  }
  return out;
}

/** Decode an image to palette indices, using the blitter's row stride rule. */
export function decodeIndices(rom: Rom, gfx: number, w: number, h: number): Uint8Array {
  const stride = (w + 3) & ~3;
  const o = (gfx - GFX_BASE) >> 3;
  const out = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      out[y * w + x] = rom.pixels[o + y * stride + x] ?? 0;
    }
  }
  return out;
}

export const SYSTEM_PALETTE = 0xfffc6160;

/**
 * Scan for 12-byte image headers (w, h, xoff, yoff, gfxaddr) that are drawn with the
 * fixed system palette. These only appear in tables, so require runs of >= 3.
 */
export function scanPlainHeaders(rom: Rom): ImageHeader[] {
  const maxGfx = GFX_BASE + rom.pixels.length * 8;
  const p = rom.prog;
  const dv = new DataView(p.buffer, p.byteOffset, p.byteLength);
  const ok = (i: number) => {
    if (i + 12 > p.length) return false;
    const w = dv.getUint16(i, true), h = dv.getUint16(i + 2, true);
    const xo = dv.getInt16(i + 4, true), yo = dv.getInt16(i + 6, true);
    const gfx = dv.getUint32(i + 8, true);
    return w >= 1 && w <= 160 && h >= 1 && h <= 160 && Math.abs(xo) <= 160 && Math.abs(yo) <= 160 &&
      gfx >= GFX_BASE && gfx < maxGfx && gfx % 8 === 0;
  };
  const out: ImageHeader[] = [];
  let i = 0;
  while (i < p.length) {
    let n = 0;
    while (ok(i + n * 12)) n++;
    if (n >= 3) {
      for (let k = 0; k < n; k++) {
        const j = i + k * 12;
        out.push({
          at: PROG_BASE + j * 8,
          w: dv.getUint16(j, true),
          h: dv.getUint16(j + 2, true),
          xoff: dv.getInt16(j + 4, true),
          yoff: dv.getInt16(j + 6, true),
          gfx: dv.getUint32(j + 8, true),
          pal: SYSTEM_PALETTE,
        });
      }
      i += n * 12;
    } else i += 2;
  }
  return out;
}
