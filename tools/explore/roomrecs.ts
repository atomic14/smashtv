// Dump the per-world room navigation records (pointer table FFECCE80, 0x180-bit records,
// indexed by room number - 1), alongside the world list's cells.
import { loadRom, u16, u32 } from '../rom';
const rom = loadRom(process.env.HOME + '/Downloads/smashtv.zip');
for (let w = 0; w < 3; w++) {
  const base = u32(rom, 0xffecce80 + w * 32);
  const list = u32(rom, 0xffe72650 + w * 32);
  console.log('world', w, base.toString(16));
  for (let i = 0; i < 40; i++) {
    const r = base + i * 0x180;
    const words = Array.from({ length: 24 }, (_, k) => u16(rom, r + k * 16).toString(16).padStart(4, '0'));
    const e = list + i * 64;
    const d = u32(rom, e);
    const cell = d === 0xffffffff ? '' : `cell ${((u16(rom, e + 32) - 477) / 472.25).toFixed(1)},${((u16(rom, e + 48) - 5) / 332.4).toFixed(1)}`;
    console.log(String(i + 1).padStart(2), words.join(' '), cell);
    if (words.every((x) => x === '0000')) break;
  }
}
