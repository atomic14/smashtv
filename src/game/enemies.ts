// Enemies added with the original wave data (see waves.ts). Speeds and behaviours are from
// the ROM and from MAME recordings of each enemy's process (tools/explore/procs.ts).
import { anim, assets } from '../assets';
import { drawAt, drawFrame } from '../gfx';
import { audio, SND } from '../audio';
import { type Vec, DIR_NAME } from '../input';
import { DT, FLOOR, rand, clamp, pick, ARCADE_HZ } from './world';
import { Enemy, Shot, Effect, headingHold } from './entities';
import type { Game } from './game';

/** px/frame in the original -> px/s here. */
const PF = ARCADE_HZ;

/**
 * Speed of a grunt-style walker in tier `t` (wave p1): 0.5 + t/8 px/frame across, 1/16
 * less up and down, and 0.8x of each on diagonals (FFE3EC30).
 */
export function tierSpeed(t: number) {
  const x = (0.5 + 0.125 * t) * PF;
  return { x, y: x - PF / 16 };
}

/** Moves in one of 8 directions towards (ux, uy) at per-axis speeds; returns the dir8. */
function walk8(e: Enemy, ux: number, uy: number, sx: number, sy: number) {
  const ax = Math.abs(ux) > 0.38 ? Math.sign(ux) : 0;
  const ay = Math.abs(uy) > 0.38 ? Math.sign(uy) : 0;
  const k = ax && ay ? 0.8 : 1;
  e.x += ax * sx * k * DT;
  e.y += ay * sy * k * DT;
  // 0 = up, clockwise (DIR_NAME order)
  const dirs: Record<string, number> = { '0,-1': 0, '1,-1': 1, '1,0': 2, '1,1': 3, '0,1': 4, '-1,1': 5, '-1,0': 6, '-1,-1': 7 };
  const d = dirs[`${ax},${ay}`];
  if (d !== undefined) e.dir = d;
}

/** Crab (world 2 and 3 walker, wave type 10): heads for the player like a grunt. */
export class Crab extends Enemy {
  r = 9;
  bodyH = 10;
  score = 150;
  // gold outnumber red about three to one in the recordings
  skin = Math.random() < 0.75 ? 'crab.gold' : 'crab.red';
  sx: number;
  sy: number;

  ux = 0;
  uy = 0;
  hold = 0;

  constructor(x: number, y: number, tier: number) {
    super(x, y);
    ({ x: this.sx, y: this.sy } = tierSpeed(tier));
    this.speed = this.sx;
  }

  think(g: Game) {
    // keeps a heading for a while, like the grunts
    if ((this.hold -= DT) <= 0) {
      this.hold = headingHold();
      const t = g.target(this);
      const dx = t.x - this.x, dy = t.y - this.y;
      const d = Math.hypot(dx, dy) || 1;
      [this.ux, this.uy] = [dx / d, dy / d];
    }
    walk8(this, this.ux, this.uy, this.sx, this.sy);
    this.x = clamp(this.x, FLOOR.x0 - 10, FLOOR.x1 + 10);
    this.y = clamp(this.y, FLOOR.y0 - 6, FLOOR.y1 + 4);
  }

  draw() {
    drawAt(`${this.skin}.${DIR_NAME[this.dir]}`, 0, this.x, this.y, `${this.skin}.d`);
  }

  die(g: Game, from: Vec) {
    audio.play(SND.splat, { overlap: true, volume: 0.8 });
    g.explode(this.x, this.y - 8, 0, 0, false);
    g.maybeDrop(this.x, this.y, 0.015);
    void from;
  }
}

/**
 * Burst velocities (px/frame) by facing 1..8 (1 = left, 3 = down, 5 = right, 7 = up): five
 * pieces fanned along the facing (FFEED010/FFEED130).
 */
const BURST: [number, number][][] = [
  [],
  [[-1, -2], [-1.5, -1], [-1.75, 0], [-1.5, 1], [-1, 2]],
  [[-1.5, 0], [-1.75, 1], [-1.63, 1.75], [-1, 2], [0, 2]],
  [[-2, 1], [-1, 2], [0, 2.19], [1, 2], [2, 1]],
  [[1.5, 0], [1.75, 1], [1.63, 1.75], [1, 2], [0, 2]],
  [[1, -2], [1.5, -1], [1.75, 0], [1.5, 1], [1, 2]],
  [[1.5, 0], [1.75, -1], [1.63, -1.75], [1, -2], [0, -2]],
  [[-2, -1], [-1, -2], [0, -2.19], [1, -2], [2, -1]],
  [[-1.5, 0], [-1.75, -1], [-1.63, -1.75], [-1, -2], [0, -2]],
];

/** Facing 1..8 (1 = left, anticlockwise through down) of a vector. */
function facing(dx: number, dy: number) {
  const a = Math.atan2(dy, -dx); // 0 = left, positive towards down
  return ((Math.round(a / (Math.PI / 4)) + 8) % 8) + 1;
}

/**
 * Mr. Shrapnel (wave type 4, process F0, FFEE9A40): wanders in long straight lines at
 * 0.5 px/frame (0.44 up and down), turning his facing a step at a time towards the player.
 * When the player lines up with it he stops for 40 frames, shakes for 20 and bursts into
 * five pieces fanned along his facing.
 */
export class Shrapnel extends Enemy {
  hp = 3;
  score = 500;
  r = 10;
  bodyH = 14;
  vx = 0;
  vy = 1;
  hold = 0;
  face = 3;
  turnT = 0;
  /** Seconds into the stop-and-shake before bursting (0 while walking). */
  burst = 0;
  flash = 0;

  think(g: Game) {
    this.flash = Math.max(0, this.flash - DT);
    const p = g.target(this);
    if (this.burst > 0) {
      this.burst += DT;
      if (this.burst >= 60 / PF) this.blowUp(g);
      return;
    }
    // turn the facing one step towards the player now and then; burst when lined up
    if ((this.turnT -= DT) <= 0) {
      this.turnT = 5 / PF;
      const want = facing(p.x - this.x, p.y - this.y);
      if (want === this.face && p.alive && this.t > 1.5) {
        this.burst = DT;
        return;
      }
      const d = (want - this.face + 8) % 8;
      this.face = ((this.face - 1 + (d < 4 ? 1 : -1) + 8) % 8) + 1;
    }
    // straight walks of a second or few, along one axis
    if ((this.hold -= DT) <= 0 || this.x < FLOOR.x0 || this.x > FLOOR.x1 || this.y < FLOOR.y0 || this.y > FLOOR.y1) {
      this.hold = rand(0.8, 4);
      const dx = rand(FLOOR.x0, FLOOR.x1) - this.x, dy = rand(FLOOR.y0, FLOOR.y1) - this.y;
      if (Math.abs(dx) > Math.abs(dy)) [this.vx, this.vy] = [Math.sign(dx) || 1, 0];
      else [this.vx, this.vy] = [0, Math.sign(dy) || 1];
    }
    const v = this.vx ? 0.5 * PF : 0.44 * PF;
    this.x = clamp(this.x + this.vx * v * DT, FLOOR.x0 - 2, FLOOR.x1 + 2);
    this.y = clamp(this.y + this.vy * v * DT, FLOOR.y0 - 2, FLOOR.y1 + 2);
  }

  private blowUp(g: Game) {
    this.dead = true;
    g.explode(this.x, this.y - 10, 0, 0, false);
    for (const [vx, vy] of BURST[this.face]) {
      g.shots.push(new Shot(this.x, this.y - 10, vx * PF, vy * PF, 1, false, 'pellet'));
    }
    audio.play(SND.explode, { volume: 0.6 });
  }

  onHit() {
    this.flash = 0.08;
  }

  draw() {
    if (this.flash > 0 && Math.floor(this.flash * 60) % 2) return;
    const name = this.vy < 0 ? 'shrapnel.u' : this.vy > 0 ? 'shrapnel.d' : this.vx < 0 ? 'shrapnel.l' : 'shrapnel.r';
    if (this.burst > 0) {
      // standing still, then shaking (FFEEA440 jitter) before the burst
      const shake = this.burst > 40 / PF ? rand(-2, 2) : 0;
      drawAt(name, 0, this.x + shake, this.y, 'shrapnel.d');
      return;
    }
    drawAt(name, Math.floor(this.t * 10), this.x, this.y, 'shrapnel.d');
  }

  die(g: Game) {
    g.explode(this.x, this.y - 10, 0, 0, false);
    g.maybeDrop(this.x, this.y, 0.1);
  }
}

/**
 * Wall gun (wave type 5): fixed on the top wall at x 117 or 285 (FFF1AB80/FFF1ABC0),
 * turning to face the player and firing.
 */
export class Turret extends Enemy {
  hp = 12;
  score = 1000;
  r = 11;
  bodyH = 10;
  counts = false;
  entering = false;
  lethal = false;
  cd = rand(1, 2);
  heading = 0;
  flash = 0;

  think(g: Game) {
    this.flash = Math.max(0, this.flash - DT);
    const p = g.target(this);
    this.heading = Math.atan2(p.x - this.x, -(p.y - this.muzzleY));
    this.cd -= DT;
    if (this.cd <= 0 && p.alive) {
      this.cd = rand(1.2, 2.2);
      const dx = p.x - this.x, dy = p.y - 12 - this.muzzleY;
      const d = Math.hypot(dx, dy) || 1;
      g.shots.push(new Shot(this.x, this.muzzleY, (dx / d) * 120, (dy / d) * 120, 1, false, 'eshot'));
    }
  }

  private get muzzleY() {
    return this.y - 4;
  }

  onHit() {
    this.flash = 0.06;
    audio.play(SND.hit, { volume: 0.4 });
  }

  draw() {
    if (this.flash > 0 && Math.floor(this.flash * 60) % 2) return;
    const frames = anim('gunner');
    const i = Math.round((this.heading / (Math.PI * 2)) * 16 + 16) % 16;
    // drawn at the ROM anchor (the art hangs below it)
    drawFrame(frames[i], Math.round(this.x), Math.round(this.y - 47));
  }

  die(g: Game) {
    g.explode(this.x, this.y - 6, 0, 0, false);
  }
}

/** Grey floor mine (wave type 7): sits where it was dropped; deadly to touch. */
export class FloorMine extends Enemy {
  score = 100;
  counts = false;
  entering = false;
  hp = 2;
  bodyH = 7;
  r = 7;
  think() {}
  draw() {
    drawAt('floormine', 0, this.x, this.y);
  }
  die(g: Game) {
    g.explode(this.x, this.y - 4, 0, 0, false);
  }
}

/**
 * Orb swarm (wave type 11): a leader steering after the player at ~1.9 px/frame with
 * twenty small orbs homing on it at up to ~3.3 px/frame (recorded medians).
 */
export class SwarmLeader extends Enemy {
  hp = 6;
  score = 1000;
  r = 9;
  bodyH = 14;
  entering = false;
  vx = pick([-1, 1]) * PF;
  vy = pick([-1, 1]) * PF;
  flash = 0;

  think(g: Game) {
    this.flash = Math.max(0, this.flash - DT);
    // steers smoothly towards the player, overshooting into loops
    const p = g.target(this);
    const dx = p.x - this.x, dy = p.y - 10 - this.y;
    const d = Math.hypot(dx, dy) || 1;
    this.vx += (dx / d) * 2.2 * PF * DT;
    this.vy += (dy / d) * 2.2 * PF * DT;
    const sp = Math.hypot(this.vx, this.vy), max = 1.9 * PF;
    if (sp > max) {
      this.vx *= max / sp;
      this.vy *= max / sp;
    }
    this.x += this.vx * DT;
    this.y += this.vy * DT;
    if (this.x < FLOOR.x0 || this.x > FLOOR.x1) this.vx *= -1;
    if (this.y < FLOOR.y0 || this.y > FLOOR.y1) this.vy *= -1;
    this.x = clamp(this.x, FLOOR.x0, FLOOR.x1);
    this.y = clamp(this.y, FLOOR.y0, FLOOR.y1);
  }

  onHit() {
    this.flash = 0.06;
  }

  draw() {
    if (this.flash > 0 && Math.floor(this.flash * 60) % 2) return;
    drawAt('bossorb.red', Math.floor(this.t * 8), this.x, this.y);
  }

  die(g: Game) {
    g.explode(this.x, this.y - 8, 0, 0, false);
    g.maybeDrop(this.x, this.y, 0.3);
  }

  /** Spawns the leader and its swarm at (x, y). */
  static spawn(g: Game, x: number, y: number) {
    const lead = new SwarmLeader(x, y);
    g.enemies.push(lead);
    for (let i = 0; i < 20; i++) {
      const b = new SwarmBit(x + rand(-16, 16), y + rand(-16, 16), lead);
      g.enemies.push(b);
    }
    g.effects.push(new Effect('puff', x, y, 18));
  }
}

export class SwarmBit extends Enemy {
  r = 4;
  bodyH = 6;
  score = 50;
  entering = false;
  vx = rand(-60, 60);
  vy = rand(-60, 60);

  constructor(x: number, y: number, private lead: SwarmLeader) {
    super(x, y);
  }

  think(g: Game) {
    // home on the leader, or on the player once the leader is gone
    const t = this.lead.dead ? g.target(this) : this.lead;
    const dx = t.x - this.x + rand(-10, 10), dy = t.y - this.y + rand(-10, 10);
    const d = Math.hypot(dx, dy) || 1;
    this.vx += (dx / d) * 360 * DT;
    this.vy += (dy / d) * 360 * DT;
    const s = Math.hypot(this.vx, this.vy), max = 3.3 * PF;
    if (s > max) {
      this.vx *= max / s;
      this.vy *= max / s;
    }
    this.x += this.vx * DT;
    this.y += this.vy * DT;
  }

  draw() {
    const [key] = anim('swarm.bit')[0];
    const [, , , w, h] = assets.frames[key];
    drawFrame(anim('swarm.bit')[0], Math.round(this.x - w / 2), Math.round(this.y - h));
  }

  die(g: Game) {
    g.effects.push(new Effect('puff', this.x, this.y, 10));
  }
}

/** Floating orbs of wave types 12-14 (process 900): drift after the player. */
export class FloatOrb extends Enemy {
  hp = 2;
  score = 200;
  r = 8;
  bodyH = 12;
  entering = false;
  vx = rand(-40, 40);
  vy = rand(-40, 40);
  flash = 0;

  think(g: Game) {
    this.flash = Math.max(0, this.flash - DT);
    const p = g.target(this);
    const dx = p.x - this.x, dy = p.y - this.y;
    const d = Math.hypot(dx, dy) || 1;
    this.vx += (dx / d) * 90 * DT;
    this.vy += (dy / d) * 90 * DT;
    const s = Math.hypot(this.vx, this.vy), max = 1.25 * PF;
    if (s > max) {
      this.vx *= max / s;
      this.vy *= max / s;
    }
    this.x = clamp(this.x + this.vx * DT, FLOOR.x0, FLOOR.x1);
    this.y = clamp(this.y + this.vy * DT, FLOOR.y0, FLOOR.y1);
  }

  onHit() {
    this.flash = 0.06;
  }

  draw() {
    if (this.flash > 0 && Math.floor(this.flash * 60) % 2) return;
    // purple only while materialising, then green (as recorded)
    drawAt(this.t < 0.4 ? 'bossorb.purple' : 'bossorb.green', Math.floor(this.t * 8), this.x, this.y);
  }

  die(g: Game) {
    g.explode(this.x, this.y - 6, 0, 0, false);
  }
}
