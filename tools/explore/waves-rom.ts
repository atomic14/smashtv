// Dump the per-room wave definitions: FFE13790[world] -> list of 6-word entries
// [type, count, ?, interval, ?, timer], each room's entries terminated by one zero word.
// Type t uses init routine FFE13380[t-1] and spawn routine FFE13580[t-1].
import { loadRom, u16, u32 } from '../rom';
const rom = loadRom(process.env.HOME + '/Downloads/smashtv.zip');
const hex = (v: number) => v.toString(16);
console.log('type: init / spawn');
for (let t = 1; t <= 16; t++) console.log(' ', t, hex(u32(rom, 0xffe13380 + (t - 1) * 32)), hex(u32(rom, 0xffe13580 + (t - 1) * 32)));
for (let w = 0; w < 3; w++) {
  let a = u32(rom, 0xffe13790 + w * 32);
  console.log('world', w + 1, hex(a));
  for (let room = 1; room <= 40; room++) {
    const slots: string[] = [];
    for (;;) {
      if (u16(rom, a) === 0) { a += 0x10; break; }
      const e = Array.from({ length: 6 }, (_, k) => u16(rom, a + k * 16));
      a += 0x60;
      slots.push(`[${e.join(',')}]`);
      if (slots.length > 12) break;
    }
    if (slots.length > 12 || slots.some((s) => +s.slice(1).split(',')[0] > 40)) { console.log('  (end)'); break; }
    console.log(`  room ${room}: ${slots.join(' ')}`);
  }
}
