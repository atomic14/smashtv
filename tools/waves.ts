// Room wave data, decoded from the room director at FFE18150 and the room setup at FFE11D10.
//
// Rooms are numbered per world (RAM 10EB630, 1-based). Each world's room records
// (FFECCE80[world] -> 0x180-bit records indexed by room - 1) hold up to three exits:
// trigger rects, target room numbers and entry sides. Room 1 is the arena next to the
// studio, so walking the exits gives every room's grid cell.
//
// Each room's waves (FFE13790[world] -> runs of 6-word entries ended by a zero word) are
// [type, count, p1, interval, p2, delay]. The director copies them into 8 slots, calls the
// type's init routine (FFE13380[type-1]) when p2 is set, then every 3 frames counts each
// slot's delay down and, at zero, reloads it from `interval` and calls the type's spawn
// routine (FFE13580[type-1]). Spawning decrements `count`; a slot with count 0 is idle.
//
// The setup also caps how many of some types may be alive at once, from per-room byte
// tables (minus a margin when only one player is in). The grunt and crab caps also get a
// difficulty bonus (table FFE10460), -1 at the default setting as seen in MAME.
import { u16, u32, type Rom } from './rom';

export type Slot = [type: number, count: number, p1: number, interval: number, p2: number, delay: number];

/** Room number -> grid cell, from the exit records. Room 1 sits right of the studio. */
export function roomCells(rom: Rom, world: number, start: { col: number; row: number }) {
  const base = u32(rom, 0xffecce80 + world * 32);
  const rec = (n: number) => base + (n - 1) * 0x180;
  const cells = new Map<number, { col: number; row: number }>([[1, { col: start.col + 1, row: start.row }]]);
  const queue = [1];
  while (queue.length) {
    const n = queue.shift()!;
    const { col, row } = cells.get(n)!;
    for (let k = 0; k < 3; k++) {
      const x1 = u16(rom, rec(n) + k * 32), y1 = u16(rom, rec(n) + k * 32 + 16);
      const to = u16(rom, rec(n) + 0xc0 + k * 32);
      if (!to || to > 64 || cells.has(to)) continue;
      const next = x1 >= 0x140 ? { col: col + 1, row } : y1 <= 8 ? { col, row: row - 1 } : y1 >= 0xd0 ? { col, row: row + 1 } : { col: col - 1, row };
      cells.set(to, next);
      queue.push(to);
    }
  }
  return cells;
}

/** The wave slots of rooms 1..count. */
export function roomWaves(rom: Rom, world: number, count: number) {
  let a = u32(rom, 0xffe13790 + world * 32);
  const rooms: Slot[][] = [];
  for (let room = 1; room <= count; room++) {
    const slots: Slot[] = [];
    while (u16(rom, a) !== 0) {
      slots.push(Array.from({ length: 6 }, (_, k) => u16(rom, a + k * 16)) as Slot);
      a += 0x60;
    }
    a += 0x10;
    rooms.push(slots);
  }
  return rooms;
}

/** Alive caps for one room with one player in, at the default difficulty. */
const DIFFICULTY_BONUS = -1;

export function roomCaps(rom: Rom, world: number, room: number) {
  const byte = (table: number) => rom.prog[((table - 0xffe00000) >>> 3) + room];
  const caps: Record<string, number> = {};
  if (world === 0) {
    caps.grunt = byte(0xffe12d80) + DIFFICULTY_BONUS;
    caps.tank = byte(0xffe12de0);
    caps.type4 = byte(0xffe12e40);
  } else if (world === 1) {
    caps.type10 = byte(0xffe12f58) - 2 + DIFFICULTY_BONUS;
    caps.type2 = byte(0xffe12e98);
    caps.type12 = byte(0xffe130d8) - 2;
    caps.type4 = 5;
    caps.tank = 1;
  } else {
    caps.type10 = byte(0xffe13018) - 5 + DIFFICULTY_BONUS;
    caps.type2 = byte(0xffe12e98) - 2;
    caps.type12 = byte(0xffe13178) - 2;
    caps.grunt = byte(0xffe132c8) - 5 + DIFFICULTY_BONUS;
    caps.type4 = 5;
    caps.tank = room === 1 ? 3 : room === 11 ? 4 : 1;
  }
  return caps;
}
