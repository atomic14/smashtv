// Mr. Shrapnel's burst: 5 pieces per facing (1..8), velocities from tables of pointers at
// FFEED010 (x) and FFEED130 (y), each pointing at 5 16.16 values.
import { loadRom, u32 } from '../rom';
const rom = loadRom(process.env.HOME + '/Downloads/smashtv.zip');
const s = (v: number) => ((v | 0) / 65536).toFixed(2);
for (let d = 0; d <= 8; d++) {
  const px = u32(rom, 0xffeed010 + d * 32), py = u32(rom, 0xffeed130 + d * 32);
  if (px < 0xffe00000 || py < 0xffe00000) { console.log(d, 'n/a'); continue; }
  console.log(d, Array.from({ length: 5 }, (_, i) => `(${s(u32(rom, px + i * 32))},${s(u32(rom, py + i * 32))})`).join(' '));
}
