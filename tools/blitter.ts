// Software model of the Y-unit DMA blitter (after MAME's midyunit_v.cpp), used to
// replay display lists captured from the original game so that composed screens
// (arena floors, title art) can be reconstructed from ROM data.
import type { Rom } from './rom';

export type Blit = [cmd: number, offset: number, w: number, h: number, rowskip: number, x: number, y: number, pal: number, color: number];

export class Blitter {
  vram = new Uint16Array(512 * 512);

  constructor(private rom: Rom) {}

  clear() {
    this.vram.fill(0);
  }

  /** Hardware autoerase: every scanline is refilled from line 510 after display. */
  autoerase() {
    const src = this.vram.subarray(510 * 512, 511 * 512);
    for (let y = 0; y < 510; y++) this.vram.set(src, y * 512);
  }

  draw([command, gfxoffset, width, height, rowskip, xpos, ypos, palReg, colorReg]: Blit) {
    if (!(command & 0x8000)) return;
    const flipX = (command & 0x10) !== 0;
    const pal = (palReg << 8) & 0xffff;
    const color = pal | (colorReg & 0xff);
    let rowbytes: number;
    if (flipX) {
      gfxoffset -= (width - 1) * 8;
      rowbytes = (rowskip - width + 3) & ~3;
      xpos += width - 1;
    } else {
      rowbytes = (rowskip + width + 3) & ~3;
    }
    if (gfxoffset < 0x02000000) gfxoffset += 0x02000000;
    let offset = gfxoffset - 0x02000000;
    if (ypos < 0) {
      height += ypos;
      offset += (-ypos * rowbytes) << 3;
      ypos = 0;
    }
    if (ypos + height > 512) height = 512 - ypos;
    if (!flipX) {
      if (xpos < 0) {
        width += xpos;
        offset += -xpos << 3;
        xpos = 0;
      }
      if (xpos + width > 512) width = 512 - xpos;
    } else {
      if (xpos >= 512) {
        width -= xpos - 511;
        offset += (xpos - 511) << 3;
        xpos = 511;
      }
      if (xpos - width < 0) width = xpos;
    }
    const dx = flipX ? -1 : 1;
    const base = this.rom.pixels;
    const op = command & 0x0f;
    let o0 = offset >> 3;
    for (let y = 0; y < height; y++) {
      let o = o0;
      o0 += rowbytes;
      const row = ((ypos + y) & 0x1ff) * 512;
      let tx = xpos;
      for (let x = 0; x < width; x++, tx += dx, o++) {
        const p = base[o] ?? 0;
        let v = -1;
        switch (op) {
          case 1: if (p === 0) v = pal; break;
          case 2: if (p !== 0) v = pal | p; break;
          case 3: v = pal | p; break;
          case 4: case 5: if (p === 0) v = color; break;
          case 6: case 7: v = p === 0 ? color : pal | p; break;
          case 8: case 10: if (p !== 0) v = color; break;
          case 9: case 11: v = p !== 0 ? color : pal | p; break;
          case 12: case 13: case 14: case 15: v = color; break;
        }
        if (v >= 0 && tx >= 0 && tx < 512) this.vram[row + tx] = v;
      }
    }
  }
}

/** Map a VRAM word to a palette RAM index (6-bit Y-unit pen mapping). */
export function penIndex(v: number): number {
  return ((v & 0xc000) >> 8) | (v & 0x0f3f);
}

export function parsePaletteHex(hex: string): Uint16Array {
  const out = new Uint16Array(hex.length / 4);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 4, i * 4 + 4), 16);
  return out;
}

export function rgb555(v: number): [number, number, number] {
  return [
    Math.round((((v >> 10) & 31) * 255) / 31),
    Math.round((((v >> 5) & 31) * 255) / 31),
    Math.round(((v & 31) * 255) / 31),
  ];
}
