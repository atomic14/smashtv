import { anim } from '../assets';
import { drawAt, ctx } from '../gfx';
import { input, dir8, DIR_VEC, DIR_NAME, type Vec } from '../input';
import { audio, SND } from '../audio';
import { DT, FLOOR, DOORS, type DoorId, type Hittable, clamp, rand, pick, overlap, bodyCenter } from './world';
import type { Game } from './game';

export interface Entity extends Hittable {
  update(g: Game): void;
  draw(g: Game): void;
}

// ---------------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------------

export type Weapon = 'gun' | 'spread' | 'rocket';

export class Player implements Entity {
  x = 201;
  y = 180;
  r = 6;
  bodyH = 16;
  dead = false;
  moveDir = 4;
  aimDir = 4;
  walkT = 0;
  fireCd = 0;
  firing = false;
  fireAnim = 0;
  weapon: Weapon = 'gun';
  weaponT = 0;
  shieldT = 0;
  speedT = 0;
  bladesT = 0;
  bladeAngle = 0;
  lives = 3;
  score = 0;
  cash = 0;
  invuln = 2.5;
  dying = 0;
  /** Set when the player walks out through an open exit. */
  exiting: DoorId | null = null;
  /** Scripted movement target (entering/leaving rooms). */
  auto: Vec | null = null;

  update(g: Game) {
    if (this.dying > 0) {
      this.dying -= DT;
      if (this.dying <= 0) g.playerDied();
      return;
    }
    this.invuln = Math.max(0, this.invuln - DT);
    this.shieldT = Math.max(0, this.shieldT - DT);
    this.speedT = Math.max(0, this.speedT - DT);
    this.bladesT = Math.max(0, this.bladesT - DT);
    if (this.weaponT > 0) {
      this.weaponT -= DT;
      if (this.weaponT <= 0) this.weapon = 'gun';
    }

    let mv: Vec = input.move;
    if (this.auto) {
      const dx = this.auto.x - this.x, dy = this.auto.y - this.y;
      const d = Math.hypot(dx, dy);
      mv = d < 2 ? { x: 0, y: 0 } : { x: dx / d, y: dy / d };
    }
    const md = dir8(mv);
    const speed = (this.speedT > 0 ? 125 : 96) * Math.min(1, Math.hypot(mv.x, mv.y) * 1.4);
    if (md >= 0) {
      this.moveDir = md;
      const v = this.auto ? mv : DIR_VEC[md];
      this.x += v.x * speed * DT;
      this.y += v.y * speed * DT;
      this.walkT += DT * (speed / 96);
    } else {
      this.walkT = 0;
    }
    if (!this.auto) {
      const exit = g.exitFor(this);
      if (exit) {
        this.exiting = exit;
      } else {
        this.x = clamp(this.x, FLOOR.x0, FLOOR.x1);
        this.y = clamp(this.y, FLOOR.y0, FLOOR.y1);
      }
    }

    // firing
    const fd = this.auto ? -1 : dir8(input.fire, 0.3);
    this.firing = fd >= 0;
    this.aimDir = this.firing ? fd : this.moveDir;
    this.fireCd -= DT;
    if (this.firing && this.fireCd <= 0 && g.canFire()) this.shoot(g, fd);
    this.fireAnim = Math.max(0, this.fireAnim - DT);

    // orbiting blades
    if (this.bladesT > 0) {
      this.bladeAngle += DT * 7;
      for (let i = 0; i < 3; i++) {
        const a = this.bladeAngle + (i * Math.PI * 2) / 3;
        const bx = this.x + Math.cos(a) * 24, by = this.y - 14 + Math.sin(a) * 18;
        for (const e of g.enemies) {
          if (e.dead || !e.shootable) continue;
          const c = bodyCenter(e);
          if ((c.x - bx) ** 2 + (c.y - by) ** 2 < (e.r + 7) ** 2) e.damage(g, 2, { x: Math.cos(a), y: Math.sin(a) });
        }
      }
    }
  }

  shoot(g: Game, d: number) {
    const v = DIR_VEC[d];
    // shots start at the body centre so enemies hugging the player still get hit
    const muzzle = { x: this.x + v.x * 2, y: this.y - 18 + v.y * 2 };
    this.fireAnim = 0.06;
    if (this.weapon === 'rocket') {
      g.shots.push(new Shot(muzzle.x, muzzle.y, v.x * 260, v.y * 260, 6, true, 'rocket'));
      this.fireCd = 0.28;
      audio.play(SND.rocket);
    } else if (this.weapon === 'spread') {
      for (const da of [-0.26, 0, 0.26]) {
        const a = Math.atan2(v.y, v.x) + da;
        g.shots.push(new Shot(muzzle.x, muzzle.y, Math.cos(a) * 380, Math.sin(a) * 380, 1, true, 'shot'));
      }
      this.fireCd = 0.13;
      audio.play(SND.gun);
    } else {
      g.shots.push(new Shot(muzzle.x, muzzle.y, v.x * 400, v.y * 400, 1, true, 'shot'));
      this.fireCd = 0.1;
      audio.play(SND.gun);
    }
  }

  hurt(g: Game) {
    if (this.dying > 0 || this.invuln > 0 || this.shieldT > 0 || this.auto) return;
    this.dying = 1.6;
    audio.play(SND.playerDie);
    g.shake = 0.3;
  }

  get alive() {
    return this.dying <= 0;
  }

  draw() {
    if (this.dying > 0) {
      const f = Math.floor((1.6 - this.dying) * 15);
      if (f < anim('player.die').length) drawAt('player.die', f, this.x, this.y, 'player.die');
      return;
    }
    const blink = this.invuln > 0 && Math.floor(this.invuln * 12) % 2 === 0;
    if (this.invuln > 0 || this.shieldT > 0) {
      const ring = this.shieldT > 0 ? 'ring.p1' : 'ring.p1';
      drawAt(ring, 0, this.x, this.y + 6, ring, this.shieldT > 0 ? 0.9 : 0.6);
    }
    if (blink) return;
    const ld = DIR_NAME[this.moveDir];
    const legs = `legs.${ld}`;
    const frame = this.walkT > 0 ? Math.floor(this.walkT * 14) : 0;
    const td = DIR_NAME[this.aimDir];
    const torso = `torso.${td}`;
    const tf = this.fireAnim > 0 ? 1 : 0;
    // torso behind legs when facing up, in front otherwise
    if (this.aimDir === 0 || this.aimDir === 1 || this.aimDir === 7) {
      drawAt(legs, frame, this.x, this.y, 'legs.d');
      drawAt(torso, tf, this.x, this.y, 'legs.d');
    } else {
      drawAt(legs, frame, this.x, this.y, 'legs.d');
      drawAt(torso, tf, this.x, this.y, 'legs.d');
    }
    if (this.bladesT > 0) {
      for (let i = 0; i < 3; i++) {
        const a = this.bladeAngle + (i * Math.PI * 2) / 3;
        drawAt('blade', Math.floor(this.bladeAngle * 4) + i, this.x + Math.cos(a) * 24, this.y - 6 + Math.sin(a) * 18, 'blade');
      }
    }
  }
}

// ---------------------------------------------------------------------------------
// Shots
// ---------------------------------------------------------------------------------

export type ShotKind = 'shot' | 'rocket' | 'eshot' | 'shell' | 'pellet' | 'pellet2';

export class Shot implements Entity {
  r = 2;
  bodyH = 0;
  dead = false;
  t = 0;
  constructor(
    public x: number,
    public y: number,
    public vx: number,
    public vy: number,
    public dmg: number,
    public friendly: boolean,
    public kind: ShotKind,
  ) {
    if (kind === 'rocket') this.r = 4;
    if (kind === 'eshot' || kind === 'shell' || kind === 'pellet' || kind === 'pellet2') this.r = 3;
  }

  update(g: Game) {
    this.t += DT;
    this.x += this.vx * DT;
    this.y += this.vy * DT;
    if (this.x < 8 || this.x > 396 || this.y < 40 || this.y > 252) {
      this.dead = true;
      if (this.kind === 'rocket') g.explode(this.x, this.y, 18, 4, true);
      return;
    }
    if (this.friendly) {
      for (const e of g.enemies) {
        if (e.dead || !e.shootable) continue;
        if (overlap(this, e)) {
          this.dead = true;
          const n = Math.hypot(this.vx, this.vy) || 1;
          e.damage(g, this.dmg, { x: this.vx / n, y: this.vy / n });
          if (this.kind === 'rocket') g.explode(this.x, this.y, 24, 4, true);
          return;
        }
      }
    } else if (g.player.alive && overlap(this, g.player)) {
      this.dead = true;
      g.player.hurt(g);
    }
  }

  draw() {
    if (this.kind === 'rocket') {
      const n = Math.hypot(this.vx, this.vy) || 1;
      const ux = this.vx / n, uy = this.vy / n;
      ctx.strokeStyle = '#ff6a00';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(this.x - ux * 8, this.y - uy * 8);
      ctx.lineTo(this.x, this.y);
      ctx.stroke();
      ctx.fillStyle = '#fff1a0';
      ctx.fillRect(Math.round(this.x) - 1, Math.round(this.y) - 1, 3, 3);
      return;
    }
    if (this.kind === 'eshot') {
      drawAt('eshot', Math.floor(this.t * 12), this.x, this.y + 3, 'eshot');
      return;
    }
    if (this.kind === 'pellet' || this.kind === 'pellet2') {
      const name = this.kind === 'pellet' ? 'boss.pellet' : 'scar.pellet';
      drawAt(name, 0, this.x, this.y + 2, name);
      return;
    }
    if (this.kind === 'shell') {
      drawAt('eshot.green', Math.floor(this.t * 12), this.x, this.y + 3, 'eshot.green');
      return;
    }
    // player bullet: short bright streak along its path
    const n = Math.hypot(this.vx, this.vy) || 1;
    const ux = this.vx / n, uy = this.vy / n;
    ctx.strokeStyle = '#ffd84a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(Math.round(this.x - ux * 6) + 0.5, Math.round(this.y - uy * 6) + 0.5);
    ctx.lineTo(Math.round(this.x) + 0.5, Math.round(this.y) + 0.5);
    ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(Math.round(this.x), Math.round(this.y), 1, 1);
  }
}

// ---------------------------------------------------------------------------------
// Effects (one-shot animations)
// ---------------------------------------------------------------------------------

export class Effect implements Entity {
  r = 0;
  bodyH = 0;
  dead = false;
  t = 0;
  constructor(
    public name: string,
    public x: number,
    public y: number,
    public fps = 15,
    public vx = 0,
    public vy = 0,
  ) {}
  update() {
    this.t += DT;
    this.x += this.vx * DT;
    this.y += this.vy * DT;
    this.vx *= 0.92;
    this.vy *= 0.92;
    if (this.t * this.fps >= anim(this.name).length) this.dead = true;
  }
  draw() {
    if (this.t < 0) return;
    drawAt(this.name, Math.floor(this.t * this.fps), this.x, this.y);
  }
}

// ---------------------------------------------------------------------------------
// Enemies
// ---------------------------------------------------------------------------------

export abstract class Enemy implements Entity {
  dead = false;
  r = 8;
  bodyH = 12;
  hp = 1;
  score = 100;
  speed = 40;
  t = 0;
  dir = 4;
  shootable = true;
  /** Walking in from a door: heads to (tx, ty) before normal behaviour. */
  entering = true;
  tx = 0;
  ty = 0;
  /** Counts towards clearing the room. */
  counts = true;
  /** Touching the player kills them. */
  lethal = true;

  constructor(
    public x: number,
    public y: number,
  ) {}

  enterFrom(door: DoorId) {
    const d = DOORS[door];
    this.x = d.x + rand(-14, 14);
    this.y = d.y + rand(-6, 6);
    this.tx = d.ix + rand(-20, 20);
    this.ty = d.iy + rand(-10, 10);
    this.entering = true;
    return this;
  }

  update(g: Game) {
    this.t += DT;
    if (this.entering) {
      const dx = this.tx - this.x, dy = this.ty - this.y;
      const d = Math.hypot(dx, dy);
      if (d < 3) this.entering = false;
      else this.step(dx / d, dy / d, Math.max(this.speed, 45));
    } else {
      this.think(g);
    }
    if (this.lethal && g.player.alive && overlap(this, g.player, -2)) g.player.hurt(g);
  }

  step(ux: number, uy: number, speed = this.speed) {
    this.x += ux * speed * DT;
    this.y += uy * speed * DT;
    const d = dir8({ x: ux, y: uy }, 0.01);
    if (d >= 0) this.dir = d;
  }

  chase(g: Game, wobble = 0.4) {
    const p = g.player;
    const dx = p.x - this.x + Math.sin(this.t * 2 + this.x) * 30 * wobble;
    const dy = p.y - this.y + Math.cos(this.t * 2 + this.y) * 30 * wobble;
    const d = Math.hypot(dx, dy) || 1;
    this.step(dx / d, dy / d);
    this.x = clamp(this.x, FLOOR.x0 - 10, FLOOR.x1 + 10);
    this.y = clamp(this.y, FLOOR.y0 - 6, FLOOR.y1 + 4);
  }

  abstract think(g: Game): void;
  abstract draw(g: Game): void;

  damage(g: Game, n: number, from: Vec) {
    if (this.dead) return;
    this.hp -= n;
    this.onHit(g, from);
    if (this.hp <= 0) {
      this.dead = true;
      g.addScore(this.score);
      this.die(g, from);
    }
  }

  onHit(_g: Game, _from: Vec) {}
  abstract die(g: Game, from: Vec): void;
}

/** Club-wielding grunt: walks straight at the player. */
export class Grunt extends Enemy {
  speed = rand(24, 36);
  r = 7;
  think(g: Game) {
    this.chase(g, 0.5);
  }
  draw() {
    drawAt(`grunt.${DIR_NAME[this.dir]}`, Math.floor(this.t * 10), this.x, this.y, 'grunt.d');
  }
  die(g: Game, from: Vec) {
    audio.play(SND.splat, { overlap: true, volume: 0.8 });
    g.effects.push(new Effect(Math.random() < 0.5 ? 'grunt.die' : 'grunt.blast', this.x, this.y, 16, from.x * 60, from.y * 60));
    g.maybeDrop(this.x, this.y, 0.015);
  }
}

/** Purple spear guy: faster, takes two hits. */
export class Spear extends Enemy {
  speed = rand(38, 50);
  hp = 2;
  score = 200;
  flash = 0;
  think(g: Game) {
    this.flash = Math.max(0, this.flash - DT);
    this.chase(g, 0.25);
  }
  onHit() {
    this.flash = 0.08;
  }
  draw() {
    if (this.flash > 0 && Math.floor(this.flash * 60) % 2) return;
    drawAt(`spear.${DIR_NAME[this.dir]}`, Math.floor(this.t * 12), this.x, this.y, 'spear.d');
  }
  die(g: Game) {
    audio.play(SND.hit, { overlap: true, volume: 0.8 });
    g.effects.push(new Effect('spear.die', this.x, this.y, 18));
    g.maybeDrop(this.x, this.y, 0.05);
  }
}

/** Floating orb: drifts toward the player, bouncing off walls. */
export class Orb extends Enemy {
  hp = 3;
  score = 300;
  r = 9;
  bodyH = 9;
  vx = rand(-40, 40);
  vy = rand(-40, 40);
  flash = 0;
  think(g: Game) {
    this.flash = Math.max(0, this.flash - DT);
    const p = g.player;
    const dx = p.x - this.x, dy = p.y - this.y;
    const d = Math.hypot(dx, dy) || 1;
    this.vx += (dx / d) * 70 * DT;
    this.vy += (dy / d) * 70 * DT;
    const s = Math.hypot(this.vx, this.vy);
    if (s > 70) {
      this.vx *= 70 / s;
      this.vy *= 70 / s;
    }
    this.x += this.vx * DT;
    this.y += this.vy * DT;
    if (this.x < FLOOR.x0 || this.x > FLOOR.x1) this.vx *= -1;
    if (this.y < FLOOR.y0 || this.y > FLOOR.y1) this.vy *= -1;
    this.x = clamp(this.x, FLOOR.x0, FLOOR.x1);
    this.y = clamp(this.y, FLOOR.y0, FLOOR.y1);
  }
  onHit(_g: Game, from: Vec) {
    this.flash = 0.08;
    this.vx += from.x * 60;
    this.vy += from.y * 60;
  }
  draw() {
    if (this.flash > 0 && Math.floor(this.flash * 60) % 2) return;
    drawAt('orb', Math.floor(this.t * 8), this.x, this.y);
  }
  die(g: Game) {
    g.explode(this.x, this.y - 6, 0, 0, false);
  }
}

/** Spinning mine: stationary, blocks movement. */
export class Mine extends Enemy {
  score = 50;
  counts = false;
  bodyH = 8;
  r = 7;
  life = rand(14, 22);
  think(g: Game) {
    this.life -= DT;
    if (this.life <= 0) {
      this.dead = true;
      g.effects.push(new Effect('puff', this.x, this.y, 14));
    }
  }
  draw() {
    drawAt('mine', Math.floor(this.t * 10), this.x, this.y);
  }
  die(g: Game) {
    g.explode(this.x, this.y - 4, 0, 0, false);
  }
}

/** Spiked floor mine scattered around boss arenas: static, deadly to touch, shootable. */
export class SpikeMine extends Enemy {
  score = 100;
  counts = false;
  hp = 2;
  bodyH = 7;
  r = 7;
  think() {}
  draw() {
    drawAt('mine.spike', 0, this.x, this.y);
  }
  die(g: Game) {
    g.explode(this.x, this.y - 4, 0, 0, false);
  }
}

/** Tank: rolls around slowly and lobs shells at the player. */
export class Tank extends Enemy {
  hp = 14;
  score = 1000;
  speed = 26;
  r = 15;
  bodyH = 14;
  cd = rand(1, 2.5);
  heading = 0;
  flash = 0;
  goal = { x: 200, y: 160 };
  think(g: Game) {
    this.flash = Math.max(0, this.flash - DT);
    if (Math.hypot(this.goal.x - this.x, this.goal.y - this.y) < 8 || Math.random() < 0.003) {
      this.goal = { x: rand(FLOOR.x0 + 20, FLOOR.x1 - 20), y: rand(FLOOR.y0 + 20, FLOOR.y1 - 10) };
    }
    const dx = this.goal.x - this.x, dy = this.goal.y - this.y;
    const d = Math.hypot(dx, dy) || 1;
    this.x += (dx / d) * this.speed * DT;
    this.y += (dy / d) * this.speed * DT;
    this.heading = Math.atan2(dx, -dy);
    this.cd -= DT;
    if (this.cd <= 0 && g.player.alive) {
      this.cd = rand(1.4, 2.6);
      const p = g.player;
      const ax = p.x - this.x, ay = p.y - 12 - (this.y - 16);
      const n = Math.hypot(ax, ay) || 1;
      g.shots.push(new Shot(this.x, this.y - 16, (ax / n) * 110, (ay / n) * 110, 1, false, 'shell'));
    }
  }
  onHit() {
    this.flash = 0.06;
    audio.play(SND.hit, { volume: 0.5 });
  }
  draw() {
    if (this.flash > 0 && Math.floor(this.flash * 60) % 2) return;
    const frames = anim('tank.all');
    const i = Math.round((this.heading / (Math.PI * 2)) * 16 + 16) % 16;
    drawAt('tank.all', i, this.x, this.y, 'tank.v');
    void frames;
  }
  die(g: Game) {
    g.explode(this.x, this.y - 10, 0, 0, false);
    g.explode(this.x + rand(-10, 10), this.y - rand(4, 20), 0, 0, false, 0.15);
    g.maybeDrop(this.x, this.y, 0.6);
  }
}

/** Snake (jungle levels): slithers in straight lines, turning towards the player. */
export class Snake extends Enemy {
  hp = 2;
  score = 300;
  speed = 55;
  vx = 1;
  vy = 0;
  turn = 0;
  bodyH = 11;
  r = 12;
  think(g: Game) {
    this.turn -= DT;
    if (this.turn <= 0) {
      this.turn = rand(0.6, 1.4);
      const p = g.player;
      if (Math.abs(p.x - this.x) > Math.abs(p.y - this.y)) {
        this.vx = Math.sign(p.x - this.x) || 1;
        this.vy = 0;
      } else {
        this.vy = Math.sign(p.y - this.y) || 1;
        this.vx = 0;
      }
    }
    this.step(this.vx, this.vy);
    // hitbox follows the sprite: 23x22 slithering sideways, 10x31 slithering up/down
    this.bodyH = this.vx !== 0 ? 11 : 15;
    this.r = this.vx !== 0 ? 12 : 10;
    this.x = clamp(this.x, FLOOR.x0, FLOOR.x1);
    this.y = clamp(this.y, FLOOR.y0, FLOOR.y1);
  }
  draw() {
    const name = this.vx !== 0 ? 'snake.h' : 'snake.v';
    drawAt(name, Math.floor(this.t * 12), this.x, this.y, name);
  }
  die(g: Game) {
    audio.play(SND.splat, { overlap: true, volume: 0.7 });
    g.effects.push(new Effect('snake.die', this.x, this.y, 12));
  }
}

// ---------------------------------------------------------------------------------
// Pickups
// ---------------------------------------------------------------------------------

export type PickupKind =
  | 'spread' | 'rocket' | 'shield' | 'blades' | 'speed' | 'bomb' | 'life'
  | 'cash' | 'gift' | 'prize' | 'money';

const PICKUP_ANIM: Record<PickupKind, string> = {
  spread: 'pu.spread',
  rocket: 'pu.rocket',
  shield: 'pu.shield',
  blades: 'pu.blades',
  speed: 'pu.speed',
  bomb: 'pu.bomb',
  life: 'pu.life',
  cash: 'prize.cash',
  gift: 'prize.gift',
  prize: 'prize.box',
  money: 'money',
};

export class Pickup implements Entity {
  r = 9;
  bodyH = 8;
  dead = false;
  t = 0;
  frame = 0;
  life = 9;
  constructor(
    public x: number,
    public y: number,
    public kind: PickupKind,
  ) {
    this.frame = Math.floor(Math.random() * anim(PICKUP_ANIM[kind]).length);
    if (kind === 'money') this.frame = 3;
  }

  update(g: Game) {
    this.t += DT;
    if (this.t > this.life) this.dead = true;
    if (g.player.alive && overlap(this, g.player, 2)) {
      this.dead = true;
      g.collect(this);
    }
  }

  draw() {
    if (this.life - this.t < 2 && Math.floor(this.t * 10) % 2) return;
    drawAt(PICKUP_ANIM[this.kind], this.frame, this.x, this.y, PICKUP_ANIM[this.kind]);
  }
}

export const POWERUPS: PickupKind[] = ['spread', 'rocket', 'shield', 'blades', 'speed', 'bomb', 'spread', 'rocket'];
export const PRIZES: PickupKind[] = ['cash', 'cash', 'gift', 'prize', 'money'];
export { pick };
