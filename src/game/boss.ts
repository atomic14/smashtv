// Mutoid Man, assembled the way the original draws him: every part shares one anchor and
// the body/tread/chain/arm parts are drawn twice, the second copy mirrored.
import { anim, assets } from '../assets';
import { drawFrame, drawFrameAt } from '../gfx';
import { audio, SND } from '../audio';
import { type Vec } from '../input';
import { DT, rand, irand, clamp } from './world';
import { Enemy, Shot, Effect } from './entities';
import type { Game } from './game';

const FEET = 128; // anchor-to-tread-bottom distance in the art

export class MutoidMan extends Enemy {
  hp = 160;
  maxHp = 160;
  score = 50000;
  r = 26;
  bodyH = 66;
  /** ~0.8 px/frame in the original, sweeping up and down the arena. */
  speed = 48;
  punch = 0;
  shootCd = 2.5;
  boltCd = 4;
  flash = 0;
  dying = 0;
  goal = { x: 201, y: 240 };
  bolt: Bolt | null = null;

  constructor() {
    super(201, 60);
    this.tx = 201;
    this.ty = 150;
    this.entering = true;
  }

  update(g: Game) {
    if (this.dying > 0) {
      this.dying -= DT;
      if (Math.random() < 0.3) g.explode(this.x + rand(-34, 34), this.y - rand(10, 110), 0, 0, false, 0);
      if (this.dying <= 0) {
        this.dead = true;
        g.bossDefeated(this);
      }
      return;
    }
    super.update(g);
    if (this.bolt) {
      this.bolt.update(g);
      if (this.bolt.done) this.bolt = null;
    }
  }

  think(g: Game) {
    this.flash = Math.max(0, this.flash - DT);
    const p = g.player;
    const rage = this.hp < this.maxHp / 2 ? 1.4 : 1;

    // patrol: long vertical sweeps, sidestepping towards the player at each turn
    const dx = this.goal.x - this.x, dy = this.goal.y - this.y;
    const d = Math.hypot(dx, dy);
    if (d < 2) {
      const top = this.y > 180;
      this.goal = { x: clamp(p.x + rand(-40, 40), 90, 312), y: top ? rand(120, 140) : rand(225, 244) };
      if (Math.random() < 0.6) this.goal.x = this.x; // mostly straight up/down like the original
    } else if (!this.bolt) {
      this.x += (dx / d) * this.speed * rage * DT;
      this.y += (dy / d) * this.speed * rage * DT;
    }

    const chest = { x: this.x, y: this.y - 40 };
    const toP = Math.hypot(p.x - chest.x, p.y - 14 - chest.y);
    if (this.punch > 0) this.punch -= DT;
    else if (toP < 60) this.punch = 0.6;

    // volleys of slow orange pellets
    this.shootCd -= DT;
    if (this.shootCd <= 0 && !this.bolt) {
      this.shootCd = rand(1.2, 2.2) / rage;
      const base = Math.atan2(p.y - 14 - chest.y, p.x - chest.x);
      const n = irand(3, 5);
      for (let i = 0; i < n; i++) {
        const a = base + (i - (n - 1) / 2) * 0.18;
        g.shots.push(new Shot(chest.x, chest.y, Math.cos(a) * 90, Math.sin(a) * 90, 1, false, 'pellet'));
      }
      audio.play(SND.rocket, { volume: 0.5 });
    }

    // lightning from the chest, grown one segment per frame towards the player
    this.boltCd -= DT;
    if (this.boltCd <= 0 && !this.bolt && p.alive) {
      this.boltCd = rand(3.5, 6) / rage;
      this.bolt = new Bolt(chest.x, chest.y, p.x, p.y - 14);
      audio.play(SND.hit, { volume: 0.7 });
    }
  }

  damage(g: Game, n: number, from: Vec) {
    if (this.dying > 0 || this.entering) return;
    this.hp -= n;
    this.flash = 0.05;
    if (Math.random() < 0.2) audio.play(SND.hit, { volume: 0.5 });
    if (this.hp <= 0) {
      this.shootable = false;
      this.lethal = false;
      this.dying = 2.5;
      audio.play(SND.explode);
      g.addScore(this.score);
      void from;
    }
  }

  die() {}

  draw() {
    const X = Math.round(this.x), Y = Math.round(this.y - FEET);
    const hurt = this.hp < this.maxHp / 2;
    const f = (name: string, i = 0) => anim(name)[i % anim(name).length];
    const pair = (name: string, i = 0) => {
      const fr = f(name, i);
      drawFrame([fr[0], 0], X, Y);
      drawFrame([fr[0], 1], X, Y);
    };
    const walk = Math.floor(this.t * 8);
    drawFrame(f('mutoid.shadow'), X, Y);
    drawFrame(f('mutoid.gun'), X, Y);
    pair('mutoid.body');
    pair('mutoid.chain', walk);
    pair('mutoid.tread', walk);
    drawFrame(f('mutoid.plate'), X, Y);
    pair(hurt ? 'mutoid.torso.hurt' : 'mutoid.torso');
    const arm = this.punch > 0 ? Math.min(4, Math.floor((0.6 - this.punch) * 14)) : Math.floor(this.t * 2) % 2;
    pair('mutoid.arm', arm);
    this.bolt?.draw();
    const heads = hurt ? anim('mutoid.head.hurt') : anim('mutoid.head');
    if (!(this.flash > 0)) drawFrame(heads[Math.floor(this.t * 3) % heads.length], X, Y);
    else drawFrame(heads[0], X, Y, 0.5);
  }

  /** Remaining health 0..1 for the HUD bar. */
  get health() {
    return Math.max(0, this.hp / this.maxHp);
  }
}

export function bossIntro(g: Game) {
  g.effects.push(new Effect('boom', 201, 120, 12));
}

/**
 * Mutoid Man's lightning: segment sprites laid end to end from his chest towards where the
 * player was, one per frame (as traced from the original), then held briefly.
 */
class Bolt {
  t = 0;
  done = false;
  private ux: number;
  private uy: number;
  private len: number;
  private frame: [string, number];

  constructor(
    private x: number,
    private y: number,
    tx: number,
    ty: number,
  ) {
    const dx = tx - x, dy = ty - y;
    const d = Math.hypot(dx, dy) || 1;
    this.ux = dx / d;
    this.uy = dy / d;
    this.len = Math.min(260, d + 40);
    // the art leans '/', so mirror it for '\' directions; pick by angle from vertical
    const slope = (Math.atan2(Math.abs(dx), Math.abs(dy)) * 180) / Math.PI;
    const i = slope < 20 ? 0 : slope < 40 ? 1 : slope < 62 ? 2 : 3;
    const [key] = anim('mutoid.bolt')[i];
    this.frame = [key, dx * dy > 0 ? 1 : 0];
  }

  get reach() {
    return Math.min(this.len, this.t * 60 * STEP);
  }

  update(g: Game) {
    this.t += DT;
    if (this.t > this.len / (60 * STEP) + 0.45) this.done = true;
    const p = g.player;
    if (!p.alive) return;
    // distance from the player's body to the drawn part of the beam
    const px = p.x - this.x, py = p.y - 14 - this.y;
    const along = clamp(px * this.ux + py * this.uy, 0, this.reach);
    const ex = px - along * this.ux, ey = py - along * this.uy;
    if (ex * ex + ey * ey < 8 * 8) p.hurt(g);
  }

  draw() {
    const n = Math.floor(this.reach / STEP);
    for (let k = 1; k <= n; k++) {
      drawCentered(this.frame, this.x + this.ux * STEP * k, this.y + this.uy * STEP * k);
    }
    const tip = anim('mutoid.spark')[Math.floor(this.t * 20) % 2];
    drawCentered(tip, this.x + this.ux * this.reach, this.y + this.uy * this.reach);
  }
}

const STEP = 15;

function drawCentered(f: [string, number], x: number, y: number) {
  const [, , , w, h] = assets.frames[f[0]];
  drawFrameAt(f, Math.round(x - w / 2), Math.round(y - h / 2));
}
