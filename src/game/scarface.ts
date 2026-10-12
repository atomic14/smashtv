// Scarface (world 2), reconstructed from a MAME trace of the original fight. He is a giant
// face in a ring of armour plates; every part shares one anchor and is drawn as a mirrored
// pair. The trace shows each plate (eight per side) stepping through five damage stages
// independently as it is shot, the brain cap cracking, the eyes glancing about and the jaw
// opening when he fires sprays of small yellow pellets (sprite 647).
import { anim, assets } from '../assets';
import { drawFrame } from '../gfx';
import { audio, SND } from '../audio';
import { type Vec } from '../input';
import { DT, FLOOR, rand, clamp } from './world';
import { Shot } from './entities';
import { Boss } from './boss';
import type { Game } from './game';

/** Anchor to the bottom of the bottom plate. */
const FEET = 126;
const PLATES = 8;
const STAGES = 5;
const HITS_PER_STAGE = 3;
/** The game mirrors this boss's right half 5px further left than the generic flip rule. */
const MIRROR = -5;

export class Scarface extends Boss {
  readonly title = 'SCARFACE';
  hp = 220;
  maxHp = 220;
  score = 60000;
  r = 46;
  bodyH = 56;
  speed = 40;
  goal = { x: 200, y: 200 };
  /** Hits taken per plate, [side][plate]; side 0 = left (unflipped art). */
  plateHits = [new Array(PLATES).fill(0), new Array(PLATES).fill(0)];
  brainHits = 0;
  fireCd = 2.5;
  jawOpen = 0;
  look = 0;
  flash = 0;

  constructor() {
    super(320, 270);
    this.tx = 300;
    this.ty = 200;
    this.entering = true;
  }

  explosionPoint() {
    return { x: this.x + rand(-50, 50), y: this.y - rand(10, 110) };
  }

  think(g: Game) {
    this.flash = Math.max(0, this.flash - DT);
    this.jawOpen = Math.max(0, this.jawOpen - DT);
    const p = g.player;
    const rage = this.hp < this.maxHp / 2 ? 1.35 : 1;

    // roll slowly around the arena, drifting towards the player
    if (Math.hypot(this.goal.x - this.x, this.goal.y - this.y) < 4) {
      this.goal = {
        x: clamp((this.x + p.x) / 2 + rand(-90, 90), FLOOR.x0 + 60, FLOOR.x1 - 60),
        y: clamp((this.y + p.y) / 2 + rand(-50, 50), FLOOR.y0 + 70, FLOOR.y1),
      };
    }
    const dx = this.goal.x - this.x, dy = this.goal.y - this.y;
    const d = Math.hypot(dx, dy) || 1;
    this.x += (dx / d) * this.speed * rage * DT;
    this.y += (dy / d) * this.speed * rage * DT;
    this.look = Math.sign(p.x - this.x);

    // sprays of pellets from the mouth: a ring, then aimed spreads
    this.fireCd -= DT;
    if (this.fireCd <= 0) {
      this.fireCd = rand(0.9, 1.6) / rage;
      this.jawOpen = 0.35;
      const mouth = this.mouth;
      if (Math.random() < 0.4) {
        const n = 12, a0 = rand(0, Math.PI * 2);
        for (let i = 0; i < n; i++) this.pellet(g, mouth, a0 + (i / n) * Math.PI * 2);
      } else {
        const base = Math.atan2(p.y - 14 - mouth.y, p.x - mouth.x);
        for (let i = -2; i <= 2; i++) this.pellet(g, mouth, base + i * 0.16);
      }
      audio.play(SND.rocket, { volume: 0.5 });
    }
  }

  private get anchor() {
    return { x: Math.round(this.x), y: Math.round(this.y - FEET) };
  }

  private get mouth() {
    const a = this.anchor;
    return { x: a.x, y: a.y + 84 };
  }

  private pellet(g: Game, from: Vec, a: number) {
    g.shots.push(new Shot(from.x, from.y, Math.cos(a) * 100, Math.sin(a) * 100, 1, false, 'pellet2'));
  }

  damage(g: Game, n: number, from: Vec) {
    if (this.dying > 0 || this.entering) return;
    this.hp -= n;
    this.flash = 0.05;
    // chip the plate nearest to where the shot struck (shots arrive along `from`)
    const c = { x: this.x - from.x * 40, y: this.y - this.bodyH - from.y * 40 };
    this.damagePlateNear(c);
    if (Math.random() < 0.15) audio.play(SND.hit, { volume: 0.5 });
    if (this.hp <= 0) this.startDying(g);
  }

  private damagePlateNear(at: Vec) {
    const a = this.anchor;
    let best = { side: 0, k: -1, d: 1e9 };
    for (let side = 0; side < 2; side++) {
      for (let k = 0; k < PLATES; k++) {
        const [key] = anim(`scar.plate${k}`)[0];
        const [, , , w, h, xoff, yoff] = assets.frames[key];
        const cx = side === 0 ? a.x - xoff + w / 2 : a.x + xoff - w / 2;
        const cy = a.y - yoff + h / 2;
        const dd = (cx - at.x) ** 2 + (cy - at.y) ** 2;
        if (dd < best.d && this.plateHits[side][k] < (STAGES - 1) * HITS_PER_STAGE) best = { side, k, d: dd };
      }
    }
    if (best.k >= 0) this.plateHits[best.side][best.k]++;
    else this.brainHits++;
  }

  die() {}

  draw() {
    const { x: X, y: Y } = this.anchor;
    const stage = (side: number, k: number) => Math.min(STAGES - 1, Math.floor(this.plateHits[side][k] / HITS_PER_STAGE));
    const plate = (k: number) => {
      drawFrame([anim(`scar.plate${k}`)[stage(0, k)][0], 0], X, Y);
      drawFrame([anim(`scar.plate${k}`)[stage(1, k)][0], 1], X + MIRROR, Y);
    };
    const pair = (name: string, i = 0) => {
      const f = anim(name)[Math.min(i, anim(name).length - 1)];
      drawFrame([f[0], 0], X, Y);
      drawFrame([f[0], 1], X + MIRROR, Y);
    };
    const health = this.health;
    const wear = Math.min(3, Math.floor((1 - health) * 4)); // 0..3 for the 4-stage parts
    // draw order as traced from the original
    plate(0);
    plate(1);
    pair('scar.brain', Math.min(4, Math.floor(this.brainHits / 4) + wear));
    plate(2);
    pair('scar.tube.c', wear);
    pair('scar.tube.b', wear);
    if (health < 0.15) pair('scar.skull.upper');
    else {
      // eyes glance towards the player: one half looks across, the other is mirrored
      const eyes = anim('scar.eyes');
      const blink = Math.floor(this.t * 2.3) % 7 === 0;
      if (blink) pair('scar.eyes', 1);
      else if (this.look < 0) {
        drawFrame([eyes[2][0], 0], X, Y);
        drawFrame([eyes[4][0], 1], X + MIRROR, Y);
      } else {
        drawFrame([eyes[4][0], 0], X, Y);
        drawFrame([eyes[2][0], 1], X + MIRROR, Y);
      }
    }
    plate(3);
    pair('scar.teeth.lower');
    pair('scar.teeth.upper');
    pair('scar.tube.a', wear);
    plate(4);
    if (health < 0.15) pair('scar.skull.jaw');
    else pair('scar.jaw', this.jawOpen > 0 ? 3 : 0);
    plate(5);
    pair('scar.chin', wear);
    plate(6);
    plate(7);
    if (this.flash > 0) {
      // brief brighten on hit
      drawFrame([anim('scar.eyes')[0][0], 0], X, Y, 0.3);
    }
  }
}
