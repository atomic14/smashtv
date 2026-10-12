// World structure ported from the ROM (public/assets/worlds.json, see tools/extract.ts):
// each world is a grid of arenas joined by corridors, entered from the TV studio on the
// left. The player picks a route through the connected rooms towards the boss.

import type { DoorId } from './world';

export type EnemyKind = 'grunt' | 'spear' | 'orb' | 'mine' | 'tank' | 'snake';
export type BossKind = 'mutoid' | 'scarface' | 'cobra';

export interface WorldData {
  start: { col: number; row: number };
  rooms: { bg: string; col: number; row: number }[];
  links: [number, number, number, number][];
}

export interface WorldDef {
  name: string;
  map: string;
  mapText: string;
  music: string;
  boss: { col: number; row: number; kind: BossKind };
}

export const WORLDS: WorldDef[] = [
  { name: 'MAP ONE', map: 'map.1', mapText: 'text.map1', music: '03', boss: { col: 4, row: 1, kind: 'mutoid' } },
  { name: 'MAP TWO', map: 'map.2', mapText: 'text.map2', music: '03', boss: { col: 4, row: 2, kind: 'scarface' } },
  { name: 'MAP THREE', map: 'map.3', mapText: 'text.map3', music: '03', boss: { col: 4, row: 2, kind: 'cobra' } },
];

export const TITLE_ROOM = 'fff6dc10';
export const STUDIO_ROOM = 'fff6c840';

export interface RoomDef {
  bg: string;
  col: number;
  row: number;
  /** Corridor distance from the studio. */
  depth: number;
  kind: 'arena' | 'bonus' | 'boss';
  boss?: BossKind;
  enemies: Partial<Record<EnemyKind, number>>;
  /** Seconds between spawn groups. */
  pace: number;
}

export class WorldMap {
  rooms = new Map<string, RoomDef>();
  private links = new Set<string>();

  constructor(
    public def: WorldDef,
    public index: number,
    public data: WorldData,
  ) {
    for (const [a, b, c, d] of data.links) {
      this.links.add(`${a},${b}:${c},${d}`);
      this.links.add(`${c},${d}:${a},${b}`);
    }
    // breadth-first distances from the studio drive the difficulty of each room
    const depth = new Map<string, number>([[key(data.start.col, data.start.row), 0]]);
    const queue = [data.start];
    while (queue.length) {
      const c = queue.shift()!;
      for (const n of this.neighbours(c.col, c.row)) {
        const k = key(n.col, n.row);
        if (!depth.has(k)) {
          depth.set(k, depth.get(key(c.col, c.row))! + 1);
          queue.push(n);
        }
      }
    }
    for (const r of data.rooms) {
      const d = depth.get(key(r.col, r.row));
      if (d === undefined) continue; // unreachable (e.g. beyond the boss for now)
      const isBoss = r.col === def.boss.col && r.row === def.boss.row;
      const kind = isBoss ? 'boss' : r.bg.startsWith('fff99') ? 'bonus' : 'arena';
      this.rooms.set(key(r.col, r.row), {
        ...r,
        depth: d,
        kind,
        boss: isBoss ? def.boss.kind : undefined,
        ...roomContent(index, d, kind, isBoss ? def.boss.kind : undefined),
      });
    }
  }

  room(col: number, row: number) {
    return this.rooms.get(key(col, row));
  }

  linked(a: { col: number; row: number }, b: { col: number; row: number }) {
    return this.links.has(`${a.col},${a.row}:${b.col},${b.row}`);
  }

  /** The room through a door, if a corridor connects it. */
  through(col: number, row: number, door: DoorId): RoomDef | undefined {
    const [dc, dr] = DOOR_STEP[door];
    const next = { col: col + dc, row: row + dr };
    if (!this.linked({ col, row }, next)) return undefined;
    return this.room(next.col, next.row);
  }

  /** First door of the shortest route from `from` to any room not in `visited`. */
  routeToUnvisited(from: RoomDef, visited: Set<RoomDef>): DoorId | undefined {
    const first = new Map<RoomDef, DoorId>();
    const queue: RoomDef[] = [];
    for (const d of Object.keys(DOOR_STEP) as DoorId[]) {
      const r = this.through(from.col, from.row, d);
      if (r && !first.has(r)) {
        first.set(r, d);
        queue.push(r);
      }
    }
    while (queue.length) {
      const r = queue.shift()!;
      if (!visited.has(r)) return first.get(r);
      for (const d of Object.keys(DOOR_STEP) as DoorId[]) {
        const n = this.through(r.col, r.row, d);
        if (n && n !== from && !first.has(n)) {
          first.set(n, first.get(r)!);
          queue.push(n);
        }
      }
    }
    return undefined;
  }

  private neighbours(col: number, row: number) {
    return Object.values(DOOR_STEP)
      .map(([dc, dr]) => ({ col: col + dc, row: row + dr }))
      .filter((n) => this.linked({ col, row }, n));
  }
}

export const DOOR_STEP: Record<DoorId, [number, number]> = {
  left: [-1, 0],
  right: [1, 0],
  top: [0, -1],
  bottom: [0, 1],
};

const key = (c: number, r: number) => `${c},${r}`;

/** Enemy mix for a room: escalates with corridor depth and world, like the original. */
function roomContent(world: number, depth: number, kind: RoomDef['kind'], boss?: BossKind) {
  const d = depth - 1; // first arena is depth 1
  const enemies: Partial<Record<EnemyKind, number>> = {};
  if (kind === 'boss') {
    enemies.grunt = 16 + world * 8;
    if (boss === 'cobra') enemies.snake = 10;
    else if (world > 0) enemies.spear = 10;
    return { enemies, pace: 2.4 };
  }
  if (kind === 'bonus') {
    enemies.grunt = 20 + world * 10;
    enemies.orb = 4;
    return { enemies, pace: 1.6 };
  }
  enemies.grunt = 36 + d * 8 + world * 10;
  if (d >= 1 || world > 0) enemies.spear = 6 + d * 4 + world * 6;
  if (d >= 1) enemies.orb = 2 + d * 2;
  if (d >= 2) enemies.mine = 6 + d * 2;
  if (d >= 3 || world > 0) enemies.tank = Math.min(4, Math.max(1, d - 2 + world));
  if (world === 2) enemies.snake = 10 + d * 4;
  return { enemies, pace: Math.max(0.9, 1.8 - d * 0.12 - world * 0.15) };
}

/** Map art geometry: 6x5 cells; the art has a spare top row and the studio is column -1. */
export function mapCell(col: number, row: number) {
  return { x: 9 + (col + 1) * 21.3 + 10.5, y: 9 + (row + 1) * 17.4 + 8.5 };
}
