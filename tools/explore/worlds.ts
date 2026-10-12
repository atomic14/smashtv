import { loadRom, u16, u32 } from '../rom';
import { scanRooms } from '../rooms';
const rom = loadRom(process.env.HOME + '/Downloads/smashtv.zip');
const rooms = new Map(scanRooms(rom).map((r) => [r.at, r]));
for (let w = 0; w < 4; w++) {
  let a = u32(rom, 0xffe72650 + w * 32);
  console.log('world', w, a.toString(16));
  for (let n = 0; n < 80; n++, a += 64) {
    const d = u32(rom, a);
    if (d === 0xffffffff) break;
    const x = u16(rom, a + 32), y = u16(rom, a + 48);
    const r = rooms.get(d);
    console.log(' ', d.toString(16), x, y, r ? `${r.w}x${r.h}` : '-', 'col', ((x - 477) / 472).toFixed(2), 'row', ((y - 5) / 332.5).toFixed(2));
  }
}
