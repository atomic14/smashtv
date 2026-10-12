// The final boss: the game show host himself, reconstructed from a MAME trace. He rides
// Mutoid Man's chassis (same parts, same anchor) with his own torso, arms and head on top;
// his right half mirrors 1px further left than the generic flip rule, the chassis not at all.
// He throws a trail of red sparkles from his hand that ends in a burst (811, then 812-814),
// laid down segment by segment like Mutoid Man's lightning, and fires orange pellets. When
// badly hurt his jacket is gone, revealing the polka-dot shirt.
import { anim, assets } from '../assets';
import { drawFrame, drawFrameAt } from '../gfx';
import { audio, SND } from '../audio';
import { type Vec } from '../input';
import { DT, rand, irand, clamp, FLOOR } from './world';
import { Shot } from './entities';
import { Boss } from './boss';
import type { Game } from './game';

const FEET = 128;
const MIRROR = -1;

export class Host extends Boss {
  readonly title = 'THE HOST';
  hp = 260;
  maxHp = 260;
  score = 100000;
  r = 28;
  bodyH = 70;
  speed = 50;
  goal = { x: 201, y: 230 };
  fireCd = 2;
  sparkCd = 3;
  flash = 0;
  armL = 0;
  armR = 0;
  spark: SparkTrail | null = null;

  constructor() {
    super(201, 60);
    this.tx = 201;
    this.ty = 160;
    this.entering = true;
  }

  explosionPoint() {
    return { x: this.x + rand(-40, 40), y: this.y - rand(10, 130) };
  }

  update(g: Game) {
    super.update(g);
    if (this.dying > 0) return;
    if (this.spark) {
      this.spark.update(g);
      if (this.spark.done) this.spark = null;
    }
  }

  think(g: Game) {
    this.flash = Math.max(0, this.flash - DT);
    const p = g.player;
    const rage = this.hp < this.maxHp / 2 ? 1.4 : 1;
    if (Math.hypot(this.goal.x - this.x, this.goal.y - this.y) < 2) {
      const top = this.y > 180;
      this.goal = { x: clamp(p.x + rand(-60, 60), 90, 312), y: top ? rand(125, 145) : rand(220, 244) };
    } else if (!this.spark) {
      const dx = this.goal.x - this.x, dy = this.goal.y - this.y;
      const d = Math.hypot(dx, dy) || 1;
      this.x += (dx / d) * this.speed * rage * DT;
      this.y += (dy / d) * this.speed * rage * DT;
    }
    this.x = clamp(this.x, FLOOR.x0 + 40, FLOOR.x1 - 40);
    // arms gesture as he talks
    this.armL = Math.floor(this.t * 3) % 5;
    this.armR = Math.floor(this.t * 3 + 2) % 5;

    const chest = { x: this.x, y: this.y - 60 };
    this.fireCd -= DT;
    if (this.fireCd <= 0 && !this.spark) {
      this.fireCd = rand(1.1, 2) / rage;
      const base = Math.atan2(p.y - 14 - chest.y, p.x - chest.x);
      const n = irand(4, 6);
      for (let i = 0; i < n; i++) {
        const a = base + (i - (n - 1) / 2) * 0.2;
        g.shots.push(new Shot(chest.x, chest.y, Math.cos(a) * 95, Math.sin(a) * 95, 1, false, 'pellet'));
      }
      audio.play(SND.rocket, { volume: 0.5 });
    }
    this.sparkCd -= DT;
    if (this.sparkCd <= 0 && !this.spark && p.alive) {
      this.sparkCd = rand(3, 5) / rage;
      // thrown from whichever hand is nearer the player
      const side = p.x < this.x ? -1 : 1;
      const hand = { x: this.x + side * 62, y: this.y - 100 };
      this.spark = new SparkTrail(hand, { x: p.x, y: p.y - 14 });
      if (side < 0) this.armL = 2;
      else this.armR = 2;
      audio.play(SND.hit, { volume: 0.7 });
    }
  }

  damage(g: Game, n: number, from: Vec) {
    if (this.dying > 0 || this.entering) return;
    this.hp -= n;
    this.flash = 0.05;
    if (Math.random() < 0.15) audio.play(SND.hit, { volume: 0.5 });
    if (this.hp <= 0) this.startDying(g);
    void from;
  }

  die() {}

  draw() {
    const X = Math.round(this.x), Y = Math.round(this.y - FEET);
    const f = (name: string, i = 0) => anim(name)[i % anim(name).length];
    const pair = (name: string, i = 0, shift = 0) => {
      const fr = f(name, i);
      drawFrame([fr[0], 0], X, Y);
      drawFrame([fr[0], 1], X + shift, Y);
    };
    const walk = Math.floor(this.t * 8);
    // chassis: drawn exactly like Mutoid Man's
    drawFrame(f('mutoid.shadow'), X, Y);
    drawFrame(f('mutoid.gun'), X, Y);
    pair('mutoid.body');
    pair('mutoid.chain', walk);
    pair('mutoid.tread', walk);
    drawFrame(f('mutoid.plate'), X, Y);
    // host
    const hurt = this.hp < this.maxHp / 2;
    pair(hurt ? 'host.shirt' : 'host.torso', 0, MIRROR);
    drawFrame([f('host.arm', this.armL)[0], 0], X, Y);
    drawFrame([f('host.arm', this.armR)[0], 1], X + MIRROR, Y);
    const heads = anim('host.head');
    const h = hurt ? 5 : Math.floor(this.t * 1.5) % 4;
    drawFrame([heads[h][0], Math.floor(this.t / 2) % 2], X, Y, this.flash > 0 ? 0.6 : 1);
    this.spark?.draw();
  }
}

/** A trail of sparkle sprites laid towards the target one step per two frames, then a burst. */
class SparkTrail {
  t = 0;
  done = false;
  private ux: number;
  private uy: number;
  private len: number;

  constructor(
    private from: Vec,
    to: Vec,
  ) {
    const dx = to.x - from.x, dy = to.y - from.y;
    const d = Math.hypot(dx, dy) || 1;
    this.ux = dx / d;
    this.uy = dy / d;
    this.len = Math.min(240, d);
  }

  get reach() {
    return Math.min(this.len, this.t * 30 * STEP);
  }

  update(g: Game) {
    this.t += DT;
    const burstT = this.t - this.len / (30 * STEP);
    if (burstT > 0.5) this.done = true;
    const p = g.player;
    if (!p.alive) return;
    const px = p.x - this.from.x, py = p.y - 14 - this.from.y;
    const along = clamp(px * this.ux + py * this.uy, 0, this.reach);
    const ex = px - along * this.ux, ey = py - along * this.uy;
    if (ex * ex + ey * ey < 9 * 9) p.hurt(g);
  }

  draw() {
    const seg = anim('host.spark')[0];
    const flip: [string, number] = [seg[0], this.ux > 0 ? 1 : 0];
    const n = Math.floor(this.reach / STEP);
    for (let k = 0; k <= n; k++) centered(flip, this.from.x + this.ux * STEP * k, this.from.y + this.uy * STEP * k);
    const burstT = this.t - this.len / (30 * STEP);
    if (burstT > 0) {
      const b = anim('host.burst');
      centered(b[Math.min(b.length - 1, Math.floor(burstT * 8))], this.from.x + this.ux * this.len, this.from.y + this.uy * this.len);
    }
  }
}

const STEP = 13;

function centered(f: [string, number], x: number, y: number) {
  const [, , , w, h] = assets.frames[f[0]];
  drawFrameAt(f, Math.round(x - w / 2), Math.round(y - h / 2));
}
