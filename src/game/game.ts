import { assets, anim, loadImage } from '../assets';
import { ctx, W, H, drawText, drawFrameAt, fillRect, drawAt, textWidth } from '../gfx';
import { input } from '../input';
import { audio, SND } from '../audio';
import { DT, ROOM_X, ROOM_Y, FLOOR, DOORS, DOOR_IDS, type DoorId, rand, irand, pick, clamp } from './world';
import {
  Player, Shot, Effect, Enemy, Grunt, Spear, Orb, Mine, SpikeMine, Tank, Snake, Pickup,
  POWERUPS, PRIZES, type PickupKind, type Entity,
} from './entities';
import { Boss, MutoidMan } from './boss';
import { CobraDeath } from './cobra';
import { WORLDS, TITLE_ROOM, STUDIO_ROOM, WorldMap, mapCell, type EnemyKind, type RoomDef } from './levels';

type State = 'title' | 'intro' | 'map' | 'play' | 'transition' | 'continue' | 'gameover' | 'victory';

const OPPOSITE: Record<DoorId, DoorId> = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' };
const FLOOR_COLOR = '#313131'; // palette entry 0x3D (0x18C6), the arena autoerase colour

interface SpawnGroup {
  kind: EnemyKind;
  count: number;
}

export class Game {
  state: State = 'title';
  stateT = 0;
  paused = false;
  player = new Player();
  enemies: Enemy[] = [];
  shots: Shot[] = [];
  effects: Effect[] = [];
  pickups: Pickup[] = [];
  world = 0;
  /** The current world's room grid and the rooms already cleared. */
  map!: WorldMap;
  visited = new Set<RoomDef>();
  roomsCleared = 0;
  room!: RoomDef;
  queue: SpawnGroup[] = [];
  pending: { at: number; enemy: Enemy }[] = [];
  spawnT = 0;
  pickupT = 0;
  cleared = false;
  clearT = 0;
  entry: DoorId | null = null;
  boss: Boss | null = null;
  bossSpawned = false;
  /** Callbacks scheduled in game time (so they respect pause). */
  timers: { at: number; fn: () => void }[] = [];
  shake = 0;
  message: { text: string; t: number; big?: boolean } | null = null;
  transition: { from: string; to: string; door: DoorId; t: number } | null = null;
  hiScore = Number(localStorageGet('smashtv.hi') ?? 0);
  time = 0;
  /** Debug hook drawn on top of each frame (used for sprite checks from the console). */
  overlay: (() => void) | null = null;

  // ---------------------------------------------------------------- state changes

  setState(s: State) {
    this.state = s;
    this.stateT = 0;
  }

  newGame() {
    this.timers = [];
    this.player = new Player();
    this.world = 0;
    this.roomsCleared = 0;
    audio.play(SND.start);
    this.setState('intro');
    void this.preloadWorld(0);
  }

  async preloadWorld(w: number) {
    for (const r of assets.worlds[w]?.rooms ?? []) await ensureRoom(r.bg);
  }

  startWorld() {
    this.map = new WorldMap(WORLDS[this.world], this.world, assets.worlds[this.world]);
    this.visited.clear();
    this.setState('map');
    audio.playMusic(null);
  }

  /** Walk in from the TV studio, which sits to the left of the first arena. */
  enterWorld() {
    const s = this.map.data.start;
    this.room = this.map.through(s.col, s.row, 'right')!;
    this.startRoom('left');
  }

  startRoom(entry: DoorId | null) {
    const w = WORLDS[this.world];
    const revisit = this.visited.has(this.room);
    this.visited.add(this.room);
    this.enemies = [];
    this.shots = [];
    this.effects = [];
    this.pickups = [];
    this.pending = [];
    this.boss = null;
    this.bossSpawned = false;
    this.cleared = false;
    this.clearT = 0;
    this.entry = entry;
    this.spawnT = 2;
    this.pickupT = rand(4, 7);
    this.queue = revisit ? [] : buildQueue(this.room);
    const p = this.player;
    p.exiting = null;
    p.dying = 0;
    if (entry) {
      const d = DOORS[entry];
      p.x = d.x;
      p.y = d.y;
      p.auto = { x: d.ix, y: d.iy };
      p.invuln = 1.5;
    } else {
      p.x = 201;
      p.y = 180;
      p.auto = null;
      p.invuln = 2.5;
    }
    if (revisit) {
      this.cleared = true;
    } else if (this.room.boss) {
      this.say('BOSS ROOM', 2.5);
      audio.play(SND.noWay);
    } else if (this.room.kind === 'bonus') {
      this.say('BIG MONEY', 2);
      audio.play(SND.bigMoney);
      this.pickupT = 1;
    } else if (this.room.depth === 1) {
      audio.play(SND.letsGo);
    }
    audio.playMusic(w.music);
    this.setState('play');
  }

  after(seconds: number, fn: () => void) {
    this.timers.push({ at: this.time + seconds, fn });
  }

  say(text: string, t = 2, big = true) {
    this.message = { text, t, big };
  }

  // ---------------------------------------------------------------- per-frame

  update() {
    this.time += DT;
    if (input.pause && (this.state === 'play' || this.state === 'transition')) this.paused = !this.paused;
    if (this.paused) {
      if (input.start) this.paused = false;
      return;
    }
    this.stateT += DT;
    const due = this.timers.filter((t) => t.at <= this.time);
    if (due.length) {
      this.timers = this.timers.filter((t) => t.at > this.time);
      for (const t of due) t.fn();
    }
    if (this.message && (this.message.t -= DT) <= 0) this.message = null;
    this.shake = Math.max(0, this.shake - DT);

    switch (this.state) {
      case 'title':
        if (input.start) this.newGame();
        break;
      case 'intro':
        if (this.stateT > 0.6 && this.stateT - DT <= 0.6) audio.play(SND.goodLuck);
        if (this.stateT > 1.9 && this.stateT - DT <= 1.9) audio.play(SND.needIt);
        if (this.stateT > 3.6 || (input.start && this.stateT > 0.3)) this.startWorld();
        break;
      case 'map':
        if (this.stateT > 3 || (input.start && this.stateT > 0.3)) this.enterWorld();
        break;
      case 'play':
        this.updatePlay();
        break;
      case 'transition': {
        const tr = this.transition!;
        tr.t += DT / 0.7;
        if (tr.t >= 1) {
          this.transition = null;
          this.startRoom(OPPOSITE[tr.door]);
        }
        break;
      }
      case 'continue':
        if (input.start && this.stateT > 0.5) {
          this.player.lives = 3;
          this.player.score = 0;
          this.player.dying = 0;
          this.respawn();
          this.setState('play');
          audio.playMusic(WORLDS[this.world].music);
        } else if (this.stateT > 10) {
          this.setState('gameover');
          audio.playMusic('0d');
        }
        break;
      case 'gameover':
      case 'victory':
        if (this.stateT > 6 || (input.start && this.stateT > 1.5)) {
          this.setState('title');
          audio.playMusic(null);
        }
        break;
    }
  }

  private updatePlay() {
    const p = this.player;
    p.update(this);
    if (p.auto && Math.hypot(p.auto.x - p.x, p.auto.y - p.y) < 3) {
      if (p.exiting) {
        this.beginTransition(p.exiting);
        return;
      }
      p.auto = null;
    }
    if (p.exiting && !p.auto) {
      const d = DOORS[p.exiting];
      p.auto = { x: d.x, y: d.y };
      audio.play(SND.door);
    }

    this.spawn();
    for (const list of [this.enemies, this.shots, this.effects, this.pickups] as Entity[][]) {
      for (const e of list) if (!e.dead) e.update(this);
    }
    this.enemies = this.enemies.filter((e) => !e.dead || (e === this.boss && this.boss.dying > 0));
    separate(this.enemies);
    this.shots = this.shots.filter((e) => !e.dead);
    this.effects = this.effects.filter((e) => !e.dead);
    this.pickups = this.pickups.filter((e) => !e.dead);

    // random prizes and power-ups dropped into the arena
    if (!this.cleared && (this.pickupT -= DT) <= 0) {
      const bonus = this.room.kind === 'bonus';
      this.pickupT = bonus ? rand(0.6, 1.2) : rand(5, 9);
      const kind: PickupKind = bonus ? pick(['money', 'cash', 'cash', 'prize'] as const) : Math.random() < 0.45 ? pick(POWERUPS) : pick(PRIZES);
      let x = 0, y = 0;
      do {
        x = rand(FLOOR.x0 + 20, FLOOR.x1 - 20);
        y = rand(FLOOR.y0 + 20, FLOOR.y1 - 10);
      } while (Math.hypot(x - p.x, y - p.y) < 50);
      this.pickups.push(new Pickup(x, y, kind));
    }

    const bossDone = !this.room.boss || (this.bossSpawned && !this.boss);
    if (!this.cleared && bossDone && this.queue.length === 0 && this.pending.length === 0 && !this.enemies.some((e) => e.counts)) {
      this.roomCleared();
    }
    if (this.cleared) this.clearT += DT;
  }

  private spawn() {
    if (this.cleared) return;
    const now = this.stateT;
    while (this.pending.length && this.pending[0].at <= now) {
      const e = this.pending.shift()!.enemy;
      this.enemies.push(e);
    }
    if (this.room.boss && !this.bossSpawned && this.stateT > 2.5) {
      this.bossSpawned = true;
      this.boss = this.room.boss === 'cobra' ? new CobraDeath() : new MutoidMan();
      this.enemies.push(this.boss);
      for (let i = 0; i < (this.room.boss === 'cobra' ? 0 : 6); i++) {
        const m = new SpikeMine(rand(FLOOR.x0 + 30, FLOOR.x1 - 30), rand(FLOOR.y0 + 40, FLOOR.y1 - 10));
        m.entering = false;
        if (Math.hypot(m.x - this.player.x, m.y - this.player.y) > 50) this.enemies.push(m);
      }
      audio.play(SND.explode);
      this.shake = 0.5;
    }
    const alive = this.enemies.filter((e) => e.counts).length;
    if (this.queue.length === 0 || alive > 45) return;
    if ((this.spawnT -= DT) > 0) return;
    this.spawnT = this.room.pace * rand(0.7, 1.3);
    const g = this.queue.shift()!;
    const doors = DOOR_IDS.filter((d) => {
      const dd = DOORS[d];
      return Math.hypot(dd.ix - this.player.x, dd.iy - this.player.y) > 60;
    });
    const door = pick(doors.length ? doors : DOOR_IDS);
    for (let i = 0; i < g.count; i++) {
      const e = makeEnemy(g.kind);
      e.speed *= this.difficulty;
      if (g.kind === 'mine' || g.kind === 'orb') {
        // these materialise inside the arena
        e.entering = false;
        do {
          e.x = rand(FLOOR.x0 + 16, FLOOR.x1 - 16);
          e.y = rand(FLOOR.y0 + 16, FLOOR.y1 - 8);
        } while (Math.hypot(e.x - this.player.x, e.y - this.player.y) < 60);
        this.effects.push(new Effect('puff', e.x, e.y, 18));
      } else {
        e.enterFrom(door);
      }
      this.pending.push({ at: now + i * 0.18, enemy: e });
    }
  }

  private roomCleared() {
    this.cleared = true;
    this.roomsCleared++;
    for (const e of this.enemies) if (!e.dead && !e.counts) e.damage(this, 99, { x: 0, y: 0 });
    this.shots = this.shots.filter((s) => s.friendly);
    if (this.room.boss) return; // bossDefeated handles it
    this.say('TOTAL CARNAGE', 2.2);
    audio.play(SND.carnage);
    this.after(1.1, () => audio.play(SND.loveIt));
  }

  bossDefeated(b: Boss) {
    this.boss = null;
    this.say(`${b.title} DESTROYED`, 3);
    audio.play(SND.buyThat);
    this.addScore(0);
    this.cleared = true;
    this.after(3.5, () => {
      if (this.world + 1 >= WORLDS.length) {
        this.setState('victory');
        audio.playMusic('0d');
      } else {
        this.world++;
        void this.preloadWorld(this.world);
        this.startWorld();
      }
    });
  }

  /** Doors that lead somewhere: connected rooms, preferring ones not yet cleared. */
  openDoors(): DoorId[] {
    if (!this.cleared || this.room.boss) return [];
    const all = DOOR_IDS.filter((d) => d !== this.entry && this.map.through(this.room.col, this.room.row, d));
    const fresh = all.filter((d) => !this.visited.has(this.map.through(this.room.col, this.room.row, d)!));
    if (fresh.length) return fresh;
    // dead end: open only the door on the shortest path back to an uncleared room
    const step = this.map.routeToUnvisited(this.room, this.visited);
    return step ? [step] : [];
  }

  /** Which open exit (if any) the player is pushing into. */
  exitFor(p: Player): DoorId | null {
    if (!this.cleared || p.dying > 0) return null;
    const m = input.move;
    for (const id of this.openDoors()) {
      const d = DOORS[id];
      if (id === 'top' && p.y <= FLOOR.y0 + 1 && Math.abs(p.x - d.x) < 22 && m.y < -0.5) return id;
      if (id === 'bottom' && p.y >= FLOOR.y1 - 1 && Math.abs(p.x - d.x) < 26 && m.y > 0.5) return id;
      if (id === 'left' && p.x <= FLOOR.x0 + 1 && Math.abs(p.y - d.y) < 30 && m.x < -0.5) return id;
      if (id === 'right' && p.x >= FLOOR.x1 - 1 && Math.abs(p.y - d.y) < 30 && m.x > 0.5) return id;
    }
    return null;
  }

  private beginTransition(door: DoorId) {
    const from = this.room.bg;
    this.room = this.map.through(this.room.col, this.room.row, door)!;
    const to = this.room.bg;
    this.transition = { from, to, door, t: 0 };
    this.enemies = [];
    this.shots = [];
    this.effects = [];
    this.pickups = [];
    this.setState('transition');
  }

  /** Enemy speed multiplier: ramps up through each world and from world to world. */
  get difficulty() {
    return 1 + this.world * 0.1 + Math.max(0, (this.room?.depth ?? 1) - 1) * 0.04;
  }

  canFire() {
    return this.state === 'play';
  }

  playerDied() {
    const p = this.player;
    p.lives--;
    if (p.lives < 0) {
      this.setState('continue');
      audio.playMusic(null);
      audio.play(SND.byeBye);
      return;
    }
    this.respawn();
  }

  private respawn() {
    const p = this.player;
    p.dying = 0;
    p.x = 201;
    p.y = 170;
    p.invuln = 3;
    p.weapon = 'gun';
    p.weaponT = 0;
    this.shots = this.shots.filter((s) => s.friendly);
    // push nearby enemies away from the respawn point
    for (const e of this.enemies) {
      const dx = e.x - p.x, dy = e.y - p.y;
      const d = Math.hypot(dx, dy);
      if (d < 70 && !(e instanceof Boss)) {
        e.x = clamp(p.x + (dx / (d || 1)) * 90, FLOOR.x0, FLOOR.x1);
        e.y = clamp(p.y + (dy / (d || 1)) * 70, FLOOR.y0, FLOOR.y1);
      }
    }
  }

  addScore(n: number) {
    const p = this.player;
    const before = p.score;
    p.score += n;
    if (Math.floor(p.score / 500000) > Math.floor(before / 500000)) {
      p.lives++;
      this.say('EXTRA MAN', 1.5);
    }
    if (p.score > this.hiScore) {
      this.hiScore = p.score;
      localStorageSet('smashtv.hi', String(this.hiScore));
    }
  }

  maybeDrop(x: number, y: number, chance: number) {
    if (Math.random() < chance) this.pickups.push(new Pickup(x, y, Math.random() < 0.6 ? pick(PRIZES) : pick(POWERUPS)));
  }

  explode(x: number, y: number, radius: number, dmg: number, friendly: boolean, delay = 0) {
    const fx = new Effect('boom', x, y + 20, 18);
    fx.t = -delay;
    this.effects.push(fx);
    audio.play(SND.explode, { overlap: true, volume: 0.7 });
    this.shake = Math.max(this.shake, 0.15);
    if (radius > 0 && friendly) {
      for (const e of this.enemies) {
        if (e.dead || !e.shootable) continue;
        const dx = e.x - x, dy = e.y - e.bodyH - y;
        if (dx * dx + dy * dy < (radius + e.r) ** 2) e.damage(this, dmg, { x: Math.sign(dx), y: Math.sign(dy) });
      }
    }
  }

  collect(pk: Pickup) {
    const p = this.player;
    switch (pk.kind) {
      case 'spread':
      case 'rocket':
        p.weapon = pk.kind;
        p.weaponT = 12;
        audio.play(SND.pickup);
        break;
      case 'shield':
        p.shieldT = 10;
        audio.play(SND.pickup);
        break;
      case 'blades':
        p.bladesT = 12;
        audio.play(SND.pickup);
        break;
      case 'speed':
        p.speedT = 12;
        audio.play(SND.pickup);
        break;
      case 'life':
        p.lives++;
        audio.play(SND.yeah);
        break;
      case 'bomb':
        audio.play(SND.explode);
        this.shake = 0.5;
        for (const e of this.enemies) if (!e.dead && e.shootable && !(e instanceof Boss)) e.damage(this, 99, { x: 0, y: 0 });
        break;
      case 'cash':
        this.addScore(irand(1, 5) * 1000);
        p.cash += 1000;
        audio.play(SND.prize);
        break;
      case 'gift':
        this.addScore(5000);
        audio.play(SND.bigPrizes);
        break;
      case 'prize':
        this.addScore(10000);
        audio.play(SND.bigPrizes);
        break;
      case 'money':
        this.addScore(25000);
        p.cash += 25000;
        audio.play(SND.bigMoney);
        break;
    }
  }

  // ---------------------------------------------------------------- drawing

  draw() {
    ctx.save();
    if (this.shake > 0) ctx.translate(Math.round(rand(-2, 2)), Math.round(rand(-2, 2)));
    switch (this.state) {
      case 'title':
        this.drawTitle();
        break;
      case 'intro':
        this.drawIntro();
        break;
      case 'map':
        this.drawMap();
        break;
      case 'transition':
        this.drawTransition();
        break;
      default:
        this.drawArena();
    }
    ctx.restore();
    this.overlay?.();
    if (this.paused && !this.overlay) {
      fillRect(0, 0, W, H, 'rgba(0,0,0,0.6)');
      drawText('PAUSED', W / 2, 40, 'big', 'center');
      if (this.map && this.room && this.state !== 'title') this.drawWorldMap(Math.round(W / 2 - 72), 70);
    }
  }

  private drawRoom(id: string, dx = 0, dy = 0, fill = FLOOR_COLOR) {
    fillRect(0, 0, W, H, fill);
    const img = assets.roomImages.get(id);
    if (img) ctx.drawImage(img, ROOM_X + dx, ROOM_Y + dy);
  }

  private drawArena() {
    this.drawRoom(this.room.bg);
    const list: Entity[] = [...this.pickups, ...this.enemies, ...this.shots, ...this.effects, this.player];
    list.sort((a, b) => a.y - b.y);
    for (const e of list) e.draw(this);
    if (this.cleared) this.drawExits();
    this.drawHud();
    if (this.message) {
      const m = this.message;
      if (m.big) drawText(m.text, W / 2, 120, 'big', 'center');
      else drawText(m.text, W / 2, 124, 'small', 'center');
    }
    if (this.state === 'continue') {
      fillRect(0, 96, W, 64, 'rgba(0,0,0,0.6)');
      drawText('CONTINUE?', W / 2, 104, 'big', 'center');
      drawText(String(Math.max(0, Math.ceil(10 - this.stateT))), W / 2, 124, 'big', 'center');
      drawText(input.touch ? 'TAP TO CONTINUE' : 'PRESS START TO CONTINUE', W / 2, 146, 'small', 'center');
    } else if (this.state === 'gameover') {
      fillRect(0, 100, W, 40, 'rgba(0,0,0,0.6)');
      drawText('GAME OVER', W / 2, 112, 'big', 'center');
    } else if (this.state === 'victory') {
      fillRect(0, 90, W, 70, 'rgba(0,0,0,0.6)');
      drawText('CONGRATULATIONS!', W / 2, 98, 'big', 'center');
      drawText(`FINAL SCORE ${this.player.score}`, W / 2, 124, 'small', 'center');
      drawText("I'D BUY THAT FOR A DOLLAR!", W / 2, 140, 'small', 'center');
    }
  }

  private drawExits() {
    if (Math.floor(this.clearT * 4) % 2) return;
    for (const id of this.openDoors()) {
      const d = DOORS[id];
      if (id === 'top') drawAt('arrow.u', 0, d.x, FLOOR.y0 - 2);
      if (id === 'bottom') {
        ctx.save();
        ctx.translate(0, 2 * FLOOR.y1 + 4);
        ctx.scale(1, -1);
        drawAt('arrow.u', 0, d.x, FLOOR.y1 + 4);
        ctx.restore();
      }
      if (id === 'left') drawFrameAt(anim('arrow.l')[0], FLOOR.x0 - 10, d.y - 22);
      if (id === 'right') drawFrameAt([anim('arrow.l')[0][0], 1], FLOOR.x1 + 2, d.y - 22);
      // the original also labels the open door with an EXIT sign on the floor
      const exit = anim('exit')[0];
      const pos = { top: [d.x - 14, FLOOR.y0 + 4], bottom: [d.x - 14, FLOOR.y1 - 26], left: [FLOOR.x0 + 8, d.y - 18], right: [FLOOR.x1 - 36, d.y - 18] }[id];
      drawFrameAt(exit, pos[0], pos[1]);
    }
  }

  private drawHud() {
    const p = this.player;
    // left panel (player one)
    drawText('PLAYER 1', 40, 52, 'small');
    drawText(String(p.score).padStart(7, ' '), 132, 52, 'small', 'right');
    drawText(`x${Math.max(0, p.lives)}`, 40, 64, 'small');
    if (p.weaponT > 0) {
      drawText(p.weapon.toUpperCase(), 64, 64, 'small');
      fillRect(104, 66, Math.max(0, (p.weaponT / 12) * 28), 3, '#ffd84a');
    }
    // right panel: room / boss status
    drawText(`ROOMS ${this.roomsCleared}`, 270, 52, 'small');
    drawText(`HI ${this.hiScore}`, 270, 64, 'small');
    if (this.boss) {
      fillRect(130, 244, 140, 6, '#300');
      fillRect(130, 244, 140 * this.boss.health, 6, '#e22');
    }
  }

  private drawTitle() {
    this.drawRoom(TITLE_ROOM, 2, 0, '#000');
    drawFrameAt(anim('logo.smash')[0], 92, 40);
    drawFrameAt(anim('logo.tv')[0], 232, 110);
    if (Math.floor(this.stateT * 2) % 2 === 0) {
      const t = input.touch ? 'TAP TO START' : 'PRESS ENTER TO START';
      fillRect(W / 2 - textWidth(t) / 2 - 4, 196, textWidth(t) + 8, 12, 'rgba(0,0,0,0.6)');
      drawText(t, W / 2, 198, 'small', 'center');
    }
    if (this.hiScore) drawText(`HI SCORE ${this.hiScore}`, W / 2, 4, 'small', 'center');
  }

  private drawIntro() {
    this.drawRoom(STUDIO_ROOM);
    drawFrameAt(anim('text.applause')[0], 160, 60);
    drawText('CONTESTANT 1', W / 2, 92, 'big', 'center');
    if (this.stateT > 0.6) drawText('GOOD LUCK!', W / 2, 112, 'small', 'center');
    if (this.stateT > 1.9) drawText("YOU'LL NEED IT!", W / 2, 124, 'small', 'center');
  }

  private drawMap() {
    fillRect(0, 0, W, H, '#000');
    const w = WORLDS[this.world];
    const t = anim(w.mapText)[0];
    const ft = assets.frames[t[0]];
    drawFrameAt(t, Math.round(W / 2 - ft[3] / 2), 30);
    const f = this.drawWorldMap(Math.round(W / 2 - 72), 60);
    const boss = this.map.room(w.boss.col, w.boss.row);
    if (boss) drawText(`${boss.depth - 1} ROOMS TO THE BOSS`, W / 2, 60 + f.h + 14, 'small', 'center');
  }

  /** The original map art with cleared rooms crossed out and the current room flashing. */
  private drawWorldMap(x: number, y: number) {
    const map = anim(WORLDS[this.world].map)[0];
    const f = assets.frames[map[0]];
    drawFrameAt(map, x, y);
    for (const r of this.visited) {
      if (r === this.room) continue;
      const c = mapCell(r.col, r.row);
      ctx.strokeStyle = '#e21';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x + c.x - 5, y + c.y - 4);
      ctx.lineTo(x + c.x + 5, y + c.y + 4);
      ctx.moveTo(x + c.x + 5, y + c.y - 4);
      ctx.lineTo(x + c.x - 5, y + c.y + 4);
      ctx.stroke();
    }
    const here = this.state === 'map' ? { col: this.map.data.start.col + 1, row: this.map.data.start.row } : this.room;
    if (here && Math.floor(this.time * 4) % 2 === 0) {
      const c = mapCell(here.col, here.row);
      ctx.strokeStyle = '#ffe14a';
      ctx.lineWidth = 1;
      ctx.strokeRect(Math.round(x + c.x - 9) + 0.5, Math.round(y + c.y - 7) + 0.5, 18, 14);
    }
    return { w: f[3], h: f[4] };
  }

  private drawTransition() {
    const tr = this.transition!;
    const k = easeInOut(Math.min(1, tr.t));
    const v = { top: [0, 1], bottom: [0, -1], left: [1, 0], right: [-1, 0] }[tr.door];
    const ox = Math.round(v[0] * W * k), oy = Math.round(v[1] * H * k);
    fillRect(0, 0, W, H, FLOOR_COLOR);
    const a = assets.roomImages.get(tr.from), b = assets.roomImages.get(tr.to);
    if (a) ctx.drawImage(a, ROOM_X + ox, ROOM_Y + oy);
    if (b) ctx.drawImage(b, ROOM_X + ox - v[0] * W, ROOM_Y + oy - v[1] * H);
  }
}

function buildQueue(room: RoomDef): SpawnGroup[] {
  const groups: SpawnGroup[] = [];
  const size: Record<EnemyKind, [number, number]> = {
    grunt: [4, 8], spear: [3, 5], orb: [1, 3], mine: [3, 5], tank: [1, 1], snake: [2, 4],
  };
  for (const [kind, total] of Object.entries(room.enemies) as [EnemyKind, number][]) {
    let left = total;
    while (left > 0) {
      const n = Math.min(left, irand(...size[kind]));
      groups.push({ kind, count: n });
      left -= n;
    }
  }
  // shuffle, but keep the heavy hitters out of the opening seconds
  for (let i = groups.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [groups[i], groups[j]] = [groups[j], groups[i]];
  }
  groups.sort((a, b) => (a.kind === 'tank' ? 1 : 0) - (b.kind === 'tank' ? 1 : 0) || 0);
  const firstTank = groups.findIndex((g) => g.kind === 'tank');
  if (firstTank >= 0) {
    // spread tanks through the second half of the room
    const tanks = groups.splice(firstTank);
    const half = Math.floor(groups.length / 2);
    tanks.forEach((t, i) => groups.splice(half + Math.floor(((groups.length - half) * (i + 1)) / (tanks.length + 1)), 0, t));
  }
  return groups;
}

/** Nudge walking enemies apart so crowds spread out instead of collapsing onto one spot. */
function separate(list: Enemy[]) {
  const walkers = list.filter((e) => !e.entering && (e instanceof Grunt || e instanceof Spear || e instanceof Snake));
  for (let i = 0; i < walkers.length; i++) {
    const a = walkers[i];
    for (let j = i + 1; j < walkers.length; j++) {
      const b = walkers[j];
      const dx = b.x - a.x, dy = b.y - a.y;
      const d2 = dx * dx + dy * dy;
      if (d2 > 0 && d2 < 100) {
        const d = Math.sqrt(d2), push = (10 - d) * 0.25;
        a.x -= (dx / d) * push;
        a.y -= (dy / d) * push;
        b.x += (dx / d) * push;
        b.y += (dy / d) * push;
      } else if (d2 === 0) {
        b.x += rand(-1, 1);
      }
    }
  }
}

function makeEnemy(kind: EnemyKind): Enemy {
  switch (kind) {
    case 'grunt': return new Grunt(0, 0);
    case 'spear': return new Spear(0, 0);
    case 'orb': return new Orb(0, 0);
    case 'mine': return new Mine(0, 0);
    case 'tank': return new Tank(0, 0);
    case 'snake': return new Snake(0, 0);
  }
}

export async function ensureRoom(id: string) {
  if (!assets.roomImages.has(id)) {
    assets.roomImages.set(id, await loadImage(`${import.meta.env.BASE_URL}assets/rooms/${id}.png`));
  }
}

function easeInOut(t: number) {
  return t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
}

function localStorageGet(k: string): string | null {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
}
function localStorageSet(k: string, v: string) {
  try {
    localStorage.setItem(k, v);
  } catch {
    // storage unavailable (private mode); high score just won't persist
  }
}
