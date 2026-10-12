// Shared game-world types and arena geometry (screen coordinates, 400x256).

export const DT = 1 / 60;

/** The room art is drawn at this screen offset. */
export const ROOM_X = 4;
export const ROOM_Y = 0;

/** Walkable floor (feet positions). */
export const FLOOR = { x0: 32, x1: 366, y0: 96, y1: 244 };

export type DoorId = 'top' | 'bottom' | 'left' | 'right';
/** Door mouths: where enemies enter from and where the player exits. */
export const DOORS: Record<DoorId, { x: number; y: number; ix: number; iy: number }> = {
  top: { x: 201, y: 62, ix: 201, iy: 104 },
  bottom: { x: 201, y: 266, ix: 201, iy: 232 },
  left: { x: -6, y: 146, ix: 40, iy: 146 },
  right: { x: 408, y: 146, ix: 360, iy: 146 },
};
export const DOOR_IDS: DoorId[] = ['top', 'bottom', 'left', 'right'];

export interface Hittable {
  x: number;
  y: number;
  /** Collision radius around the body centre (x, y - bodyH). */
  r: number;
  bodyH: number;
  dead: boolean;
}

export function bodyCenter(e: Hittable) {
  return { x: e.x, y: e.y - e.bodyH };
}

export function overlap(a: Hittable, b: Hittable, extra = 0): boolean {
  const ca = bodyCenter(a), cb = bodyCenter(b);
  const r = a.r + b.r + extra;
  return (ca.x - cb.x) ** 2 + (ca.y - cb.y) ** 2 < r * r;
}

export const rand = (a: number, b: number) => a + Math.random() * (b - a);
export const irand = (a: number, b: number) => Math.floor(rand(a, b + 1));
export const pick = <T>(xs: readonly T[]): T => xs[Math.floor(Math.random() * xs.length)];
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
