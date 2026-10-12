// Map each world's room numbers (RAM 10EB630) to grid cells by walking the exit records
// (FFECCE80[world] -> 0x180-bit records: 3 exit rects (x1,y1 / x2,y2), 3 targets, 3 entry sides).
import { readFileSync } from 'node:fs';
import { loadRom, u16, u32 } from '../rom';
import { scanRooms } from '../rooms';
const rom = loadRom(process.env.HOME + '/Downloads/smashtv.zip');
const worlds = JSON.parse(readFileSync('public/assets/worlds.json', 'utf8'));
void scanRooms;
for (let w = 0; w < 3; w++) {
  const base = u32(rom, 0xffecce80 + w * 32);
  const rec = (n: number) => base + (n - 1) * 0x180;
  const cell = new Map<number, [number, number]>([[1, [worlds[w].start.col + 1, worlds[w].start.row]]]);
  const queue = [1];
  const out: string[] = [];
  while (queue.length) {
    const n = queue.shift()!;
    const [c, r] = cell.get(n)!;
    const exits: string[] = [];
    for (let k = 0; k < 3; k++) {
      const x1 = u16(rom, rec(n) + k * 32), y1 = u16(rom, rec(n) + k * 32 + 16);
      const to = u16(rom, rec(n) + 0xc0 + k * 32);
      if (!to) continue;
      const d = x1 >= 0x140 ? 'R' : y1 <= 8 ? 'U' : y1 >= 0xd0 ? 'D' : x1 < 0x40 ? 'L' : '?';
      const nc: [number, number] = d === 'R' ? [c + 1, r] : d === 'L' ? [c - 1, r] : d === 'U' ? [c, r - 1] : [c, r + 1];
      exits.push(`${d}->${to}`);
      if (!cell.has(to)) { cell.set(to, nc); queue.push(to); }
      else if (cell.get(to)!.join() !== nc.join()) exits.push(`(conflict ${cell.get(to)!.join()} vs ${nc.join()})`);
    }
    out.push(`  room ${n} @ ${c},${r}  ${exits.join(' ')}`);
  }
  const known = new Set(worlds[w].rooms.map((x: { col: number; row: number }) => `${x.col},${x.row}`));
  const missing = [...known].filter((k) => ![...cell.values()].some((v) => v.join() === k));
  console.log(`world ${w + 1}: ${cell.size} rooms; grid cells not reached: ${missing.join(' ') || 'none'}`);
  console.log(out.sort((a, b) => +a.split(' ')[3] - +b.split(' ')[3]).join('\n'));
}
