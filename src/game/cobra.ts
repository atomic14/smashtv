// Cobra Death (world 3), reconstructed from a MAME trace of the original fight:
//  - two cobras, purple and blue (same art, the blue one uses the palette of header 1140),
//    rise out of the two pits in the temple arena (body roots at the pit positions);
//  - each body is a chain of segment sprites laid along the head's path back to its pit;
//  - the head is two mirrored halves plus a jaw, all on one anchor;
//  - to attack, a cobra rears up (frames 1134-1135) and breathes a column of fire straight
//    down (518-526) that ends in a burning ring (527-529). The flame art is anchored to the
//    head anchor, so the whole sequence is drawn at the head position.
import { anim } from '../assets';
import { drawFrame, drawFrameAt } from '../gfx';
import { audio, SND } from '../audio';
import { type Vec } from '../input';
import { DT, FLOOR, rand, clamp } from './world';
import { Enemy } from './entities';
import { Boss } from './boss';
import type { Game } from './game';

/** Pit positions (top-left of the root sprite) in the temple arena, from the trace. */
const PITS = [
  { x: 89, y: 110 },
  { x: 274, y: 110 },
];
const SEG = 3; // trail spacing between body segments (px)
const MAX_SEGS = 70;
const FLAME = { rear: 0.3, breathe: 0.62, ring: 0.27 };
/** The game mirrors the cobra's right half 5px further left than the generic flip rule. */
const MIRROR = -5;

class Cobra extends Enemy {
  hp = 55;
  score = 5000;
  r = 15;
  /** Negative: the hittable head hangs 30px below the anchor (x, y). */
  bodyH = -30;
  counts = false;
  speed = 80;
  /** Body path from the pit towards the head (segment centres). */
  trail: Vec[] = [];
  heading = -Math.PI / 2;
  goal = { x: 200, y: 120 };
  attack = 0; // seconds into the current fire attack, 0 when idle
  flash = 0;
  rising = true;

  constructor(
    private pit: { x: number; y: number },
    private skin: 'cobra' | 'cobra.blue',
  ) {
    super(pit.x + 17, pit.y + 20);
    this.entering = false;
    this.trail.push({ x: this.x, y: this.y });
  }

  /** Head anchor; (x, y) is the anchor, the head art hangs below it. */
  get mouth() {
    return { x: this.x, y: this.y + 56 };
  }

  think(g: Game) {
    this.flash = Math.max(0, this.flash - DT);
    const p = g.target(this);
    if (this.attack > 0) {
      this.attack += DT;
      const t = this.attack - FLAME.rear;
      if (t > 0 && t < FLAME.breathe + FLAME.ring && p.alive) {
        // fire column under the mouth, then the ring where it lands
        const reach = t < FLAME.breathe ? 56 + Math.min(1, t / (FLAME.breathe * 0.7)) * 104 : 160;
        const inColumn = Math.abs(p.x - this.x) < 11 && p.y - 14 > this.y + 56 && p.y - 14 < this.y + reach;
        const inRing = t >= FLAME.breathe && Math.hypot(p.x - this.x, p.y - (this.y + 150)) < 22;
        if (inColumn || inRing) p.hurt(g);
      }
      if (this.attack > FLAME.rear + FLAME.breathe + FLAME.ring) this.attack = 0;
      return;
    }

    if (this.rising) {
      this.goal = { x: this.pit.x + 17, y: 40 };
      if (this.y < 50) this.rising = false;
    } else if (Math.hypot(this.goal.x - this.x, this.goal.y - this.y) < 10 || Math.random() < 0.004) {
      // wander, often lining up above the player to breathe fire on them
      this.goal = Math.random() < 0.55
        ? { x: clamp(p.x, 40, 360), y: clamp(p.y - 150 + rand(-10, 10), 10, 120) }
        : { x: rand(40, 360), y: rand(10, 140) };
    }

    // steer smoothly (snakes turn, they don't strafe)
    const want = Math.atan2(this.goal.y - this.y, this.goal.x - this.x);
    let da = want - this.heading;
    while (da > Math.PI) da -= Math.PI * 2;
    while (da < -Math.PI) da += Math.PI * 2;
    this.heading += clamp(da, -3.2 * DT, 3.2 * DT);
    this.x += Math.cos(this.heading) * this.speed * DT;
    this.y += Math.sin(this.heading) * this.speed * DT;
    this.x = clamp(this.x, FLOOR.x0, FLOOR.x1);
    this.y = clamp(this.y, -10, FLOOR.y1 - 60);

    const neck = { x: this.x, y: this.y + 25 };
    const last = this.trail[this.trail.length - 1];
    if (Math.hypot(neck.x - last.x, neck.y - last.y) >= SEG) {
      this.trail.push(neck);
      if (this.trail.length > MAX_SEGS) this.trail.shift();
    }

    if (!this.rising && Math.abs(p.x - this.x) < 12 && p.y - 150 > this.y - 40 && p.y > this.y + 70) {
      this.attack = DT;
      audio.play(SND.rocket, { volume: 0.7 });
    }
  }

  onHit() {
    this.flash = 0.06;
  }

  die(g: Game) {
    g.explode(this.x, this.y + 20, 0, 0, false);
    g.explode(this.x + rand(-12, 12), this.y + 40, 0, 0, false, 0.2);
  }

  /** Draws the body from the pit to the neck, then the head. */
  draw() {
    const k = this.skin;
    const root = anim(`${k}.root`)[0];
    drawFrameAt(root, this.pit.x, this.pit.y);
    const seg = anim(`${k}.body`)[0];
    const base = { x: this.pit.x + 17, y: this.pit.y + 20 };
    // join the pit to the start of the trail if the tail end has moved on
    const first = this.trail[0];
    const gap = Math.hypot(first.x - base.x, first.y - base.y);
    for (let d = 0; d < gap; d += SEG * 2) {
      const u = d / gap;
      drawFrameAt(seg, Math.round(base.x + (first.x - base.x) * u) - 15, Math.round(base.y + (first.y - base.y) * u) - 16);
    }
    for (const s of this.trail) drawFrameAt(seg, Math.round(s.x) - 15, Math.round(s.y) - 16);

    const X = Math.round(this.x), Y = Math.round(this.y);
    const pair = (name: string, i = 0) => {
      const f = anim(name)[i % anim(name).length];
      drawFrame([f[0], 0], X, Y);
      drawFrame([f[0], 1], X + MIRROR, Y);
    };
    if (this.attack > 0) {
      pair(`${k}.rear`, this.attack < FLAME.rear / 2 ? 0 : 1);
      const t = this.attack - FLAME.rear;
      if (t > 0) {
        const flame = anim('cobra.flame');
        const ring = anim('cobra.fire');
        const f = t < FLAME.breathe
          ? flame[Math.min(flame.length - 1, Math.floor((t / FLAME.breathe) * flame.length))]
          : ring[Math.min(ring.length - 1, Math.floor(((t - FLAME.breathe) / FLAME.ring) * ring.length))];
        drawFrame(f, X, Y);
      }
      return;
    }
    const jaw = Math.floor(this.t * 6) % 4;
    pair(`${k}.jaw`, jaw);
    pair(this.flash > 0 ? `${k}.flash` : `${k}.head`);
  }
}

export class CobraDeath extends Boss {
  readonly title = 'COBRA DEATH';
  score = 75000;
  shootable = false;
  lethal = false;
  heads: Cobra[] = [];

  constructor() {
    super(200, 120);
    this.entering = false;
  }

  get health() {
    const max = this.heads.length * 55 || 1;
    return Math.max(0, this.heads.reduce((n, h) => n + Math.max(0, h.hp), 0) / max);
  }

  explosionPoint() {
    const h = this.heads[Math.floor(Math.random() * this.heads.length)];
    const s = h.trail[Math.floor(Math.random() * h.trail.length)];
    return { x: s.x, y: s.y };
  }

  think(g: Game) {
    if (!this.heads.length) {
      this.heads = [new Cobra(PITS[0], 'cobra'), new Cobra(PITS[1], 'cobra.blue')];
      g.enemies.push(...this.heads);
    }
    if (this.heads.every((h) => h.dead)) this.startDying(g);
  }

  damage() {}
  die() {}
  draw() {}
}
