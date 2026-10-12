// Mutoid Man, assembled the way the original draws him: every part shares one anchor and
// the body/tread/chain/arm parts are drawn twice, the second copy mirrored.
import { anim } from '../assets';
import { drawFrame } from '../gfx';
import { audio, SND } from '../audio';
import { type Vec } from '../input';
import { DT, FLOOR, rand, clamp } from './world';
import { Enemy, Shot, Effect } from './entities';
import type { Game } from './game';

const FEET = 128; // anchor-to-tread-bottom distance in the art

export class MutoidMan extends Enemy {
  hp = 160;
  maxHp = 160;
  score = 50000;
  r = 26;
  bodyH = 66;
  speed = 22;
  punch = 0;
  shootCd = 3;
  flash = 0;
  dying = 0;

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
  }

  think(g: Game) {
    this.flash = Math.max(0, this.flash - DT);
    const p = g.player;
    const dx = p.x - this.x, dy = p.y - 20 - this.y;
    const d = Math.hypot(dx, dy) || 1;
    const rage = this.hp < this.maxHp / 2 ? 1.5 : 1;
    this.x += (dx / d) * this.speed * rage * DT;
    this.y += (dy / d) * this.speed * rage * DT;
    this.x = clamp(this.x, FLOOR.x0 + 40, FLOOR.x1 - 40);
    this.y = clamp(this.y, FLOOR.y0 + 50, FLOOR.y1);

    if (this.punch > 0) this.punch -= DT;
    else if (d < 70) this.punch = 0.6;

    this.shootCd -= DT;
    if (this.shootCd <= 0) {
      this.shootCd = rand(1.6, 2.6) / rage;
      const base = Math.atan2(p.y - 16 - (this.y - 70), p.x - this.x);
      for (let i = -2; i <= 2; i++) {
        const a = base + i * 0.22;
        g.shots.push(new Shot(this.x, this.y - 70, Math.cos(a) * 120, Math.sin(a) * 120, 1, false, 'eshot'));
      }
      audio.play(SND.rocket, { volume: 0.6 });
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
