// World/room progression. Room ids are background descriptors extracted from the ROM
// (public/assets/rooms/<id>.png); the enemy mixes follow the original's escalation:
// grunts first, then orbs/mines, then tanks, then the world boss.

export type EnemyKind = 'grunt' | 'spear' | 'orb' | 'mine' | 'tank' | 'snake';

export interface RoomDef {
  bg: string;
  enemies: Partial<Record<EnemyKind, number>>;
  /** Seconds between spawn groups. */
  pace: number;
  boss?: 'mutoid';
}

export interface WorldDef {
  name: string;
  map: string;
  mapText: string;
  music: string;
  rooms: RoomDef[];
}

export const WORLDS: WorldDef[] = [
  {
    name: 'MAP ONE',
    map: 'map.1',
    mapText: 'text.map1',
    music: '03',
    rooms: [
      { bg: 'fff62900', enemies: { grunt: 40 }, pace: 1.8 },
      { bg: 'fff62990', enemies: { grunt: 50, orb: 4 }, pace: 1.6 },
      { bg: 'fff62870', enemies: { grunt: 55, mine: 10, orb: 6 }, pace: 1.5 },
      { bg: 'fff62900', enemies: { grunt: 50, spear: 12, tank: 1 }, pace: 1.4 },
      { bg: 'fff62990', enemies: { grunt: 60, spear: 18, orb: 8, tank: 2 }, pace: 1.3 },
      { bg: 'fff62a20', enemies: { grunt: 30 }, pace: 2.2, boss: 'mutoid' },
    ],
  },
  {
    name: 'MAP TWO',
    map: 'map.2',
    mapText: 'text.map2',
    music: '03',
    rooms: [
      { bg: 'fff81dd0', enemies: { grunt: 50, spear: 15, orb: 6 }, pace: 1.4 },
      { bg: 'fff81e60', enemies: { grunt: 55, spear: 20, mine: 12 }, pace: 1.3 },
      { bg: 'fff81f80', enemies: { grunt: 60, orb: 12, tank: 2 }, pace: 1.3 },
      { bg: 'fff82010', enemies: { grunt: 50, spear: 30, tank: 3 }, pace: 1.2 },
      { bg: 'fff82130', enemies: { grunt: 70, spear: 25, orb: 12, tank: 3 }, pace: 1.1 },
      { bg: 'fff82250', enemies: { spear: 30 }, pace: 2, boss: 'mutoid' },
    ],
  },
  {
    name: 'MAP THREE',
    map: 'map.3',
    mapText: 'text.map3',
    music: '03',
    rooms: [
      { bg: 'fff8bcf0', enemies: { grunt: 50, snake: 15 }, pace: 1.3 },
      { bg: 'fff8bd80', enemies: { grunt: 50, snake: 20, orb: 8 }, pace: 1.2 },
      { bg: 'fff94af0', enemies: { spear: 40, snake: 20, mine: 15 }, pace: 1.2 },
      { bg: 'fff94b80', enemies: { grunt: 60, spear: 30, tank: 4 }, pace: 1.1 },
      { bg: 'fff8bea0', enemies: { grunt: 80, snake: 30, orb: 15, tank: 4 }, pace: 1.0 },
      { bg: 'fff94c10', enemies: { snake: 30, spear: 30 }, pace: 1.6, boss: 'mutoid' },
    ],
  },
];

export const TITLE_ROOM = 'fff6dc10';
export const STUDIO_ROOM = 'fff6c840';
export const SCORES_ROOM = 'fff9cab0';

export function allRooms(): string[] {
  return [TITLE_ROOM, STUDIO_ROOM, ...new Set(WORLDS.flatMap((w) => w.rooms.map((r) => r.bg)))];
}
