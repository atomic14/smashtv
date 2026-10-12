// The original's room director (FFE18150), driving the wave slots decoded from the ROM
// (tools/waves.ts). Each slot is [type, count, p1, interval, p2, delay]:
//  - at room start, types with an init routine create p2 of their kind straight away;
//  - then every 3 frames each slot with count left counts its delay down and, at zero,
//    reloads it from `interval` and runs the type's spawn routine, which usually adds one
//    (if fewer than the room's cap are alive) and decrements count;
//  - when the room's main wave (its grunts, crabs or saucer orbs) has all come in, the game
//    waits 2s, stops the other spawners, and opens the exits once the enemies are dead.
import { DOORS, DOOR_IDS, FLOOR, rand, irand, pick, ARCADE_HZ, type DoorId } from './world';
import { Enemy, Effect, Grunt, Orb, Tank, Snake } from './entities';
import { Crab, Shrapnel, Turret, FloorMine, SwarmLeader, FloatOrb } from './enemies';
import type { RoomDef, WaveSlot } from './levels';
import type { Game } from './game';

const TICK = 3 / ARCADE_HZ;
/** Types whose wave decides when the room ends, in priority order. */
const MAIN = [6, 10, 2];
/** Boss types: spawned by the game, not the director. */
const BOSSES = [8, 9, 15];
/** Wall-gun positions (FFF1AB80/FFF1ABC0). */
const TURRET_AT = [117, 285];
/** Chance per spawn of a grunt squad through one door instead of a single grunt (FFE3B150). */
const SQUAD_CHANCE = 140 / 1000;
/** The room ends this long after its main wave is in (FFEC6CF0 sleeps 120 frames). */
const WIND_DOWN = 120 / ARCADE_HZ;

interface Slot {
  type: number;
  count: number;
  p1: number;
  interval: number;
  delay: number;
}

export class WaveDirector {
  slots: Slot[];
  private acc = 0;
  private main: Slot | undefined;
  /** Seconds since the main wave ran out (-1 while it is still coming). */
  private mainDoneT = -1;
  private turrets = 0;

  constructor(
    private g: Game,
    private room: RoomDef,
  ) {
    this.slots = [];
    for (const [type, count, p1, interval, p2, delay] of room.waves as WaveSlot[]) {
      if (BOSSES.includes(type)) continue;
      const s = { type, count, p1, interval, delay };
      this.slots.push(s);
      if (p2) this.init(s, p2);
    }
    this.main = MAIN.map((t) => this.slots.find((s) => s.type === t)).find(Boolean);
  }

  /** True once the main wave is in and the other spawners have been stopped. */
  get finished() {
    return this.mainDoneT >= WIND_DOWN || (!this.main && this.slots.every((s) => s.count <= 0));
  }

  update(dt: number) {
    if (this.main && this.main.count <= 0 && this.mainDoneT < 0) this.mainDoneT = 0;
    if (this.mainDoneT >= 0) this.mainDoneT += dt;
    if (this.finished) return;
    this.acc += dt;
    while (this.acc >= TICK) {
      this.acc -= TICK;
      for (const s of this.slots) {
        if (s.count <= 0) continue;
        if (--s.delay > 0) continue;
        s.delay = s.interval;
        this.spawn(s);
      }
    }
  }

  private alive(kind: abstract new (...args: never[]) => Enemy) {
    // enemies still queued at a door count too: the original counts a grunt from creation
    const queued = this.g.pending.filter((p) => p.enemy instanceof kind).length;
    return queued + this.g.enemies.filter((e) => e instanceof kind && !e.dead).length;
  }

  private cap(name: string) {
    return this.room.caps[name] ?? 99;
  }

  /** Room-start creation for slots with p2 set. */
  private init(s: Slot, n: number) {
    for (let i = 0; i < n && s.count > 0; i++) {
      switch (s.type) {
        case 5:
          if (this.turrets < TURRET_AT.length) this.add(new Turret(TURRET_AT[this.turrets++], 22));
          break;
        case 7:
          this.add(this.inside(new FloorMine(0, 0), 50));
          break;
        default:
          this.spawnOne(s);
      }
      s.count--;
    }
  }

  private spawn(s: Slot) {
    switch (s.type) {
      case 6:
      case 10: {
        const kind = s.type === 6 ? Grunt : Crab;
        if (this.alive(kind) > this.cap(s.type === 6 ? 'grunt' : 'type10')) return;
        if (Math.random() < SQUAD_CHANCE) {
          // a squad of 7-16 (or whatever is left) through one door
          const n = Math.min(s.count, s.count >= 16 ? irand(7, 16) : s.count);
          const door = this.door();
          for (let i = 0; i < n; i++) this.add(this.make(s), door, i * 0.12);
          s.count -= n;
        } else {
          this.spawnOne(s);
          s.count--;
        }
        return;
      }
      case 2:
        if (this.alive(Orb) >= this.cap('type2')) return;
        break;
      case 3:
        if (this.alive(Tank) >= this.cap('tank')) return;
        break;
      case 4:
        if (this.alive(Shrapnel) > this.cap('type4')) return;
        break;
      case 12:
      case 13:
      case 14:
        if (this.alive(FloatOrb) >= this.cap('type12')) return;
        break;
      case 5:
      case 7:
        return; // placed at room start only
    }
    this.spawnOne(s);
    s.count--;
  }

  private spawnOne(s: Slot) {
    switch (s.type) {
      case 11: {
        const p = this.inside(new FloatOrb(0, 0), 80);
        SwarmLeader.spawn(this.g, p.x, p.y);
        return;
      }
      case 12:
      case 13:
      case 14: {
        const n = s.type === 12 ? 3 : s.type === 13 ? 2 : 1;
        const at = this.inside(new FloatOrb(0, 0), 70);
        for (let i = 0; i < n; i++) {
          const o = new FloatOrb(at.x + rand(-10, 10), at.y + rand(-10, 10));
          this.g.enemies.push(o);
        }
        this.g.effects.push(new Effect('puff', at.x, at.y, 18));
        return;
      }
      default:
        this.add(this.make(s), this.door());
    }
  }

  private make(s: Slot): Enemy {
    switch (s.type) {
      case 6:
        return new Grunt(0, 0, s.p1, this.g.world === 2 ? 'spear' : 'grunt');
      case 10:
        return new Crab(0, 0, s.p1);
      case 2:
        return new Orb(0, 0);
      case 3:
        return new Tank(0, 0);
      case 4:
        return new Shrapnel(0, 0);
      default:
        return new Snake(0, 0);
    }
  }

  /** Adds an enemy, walking in through `door` if given (after `delay` seconds). */
  private add(e: Enemy, door?: DoorId, delay = 0) {
    if (door) {
      e.enterFrom(door);
      this.g.pending.push({ at: this.g.stateT + delay, enemy: e });
    } else {
      this.g.enemies.push(e);
    }
  }

  /** Places an enemy on the floor away from the player. */
  private inside<T extends Enemy>(e: T, clearance: number): T {
    const p = this.g.player;
    do {
      e.x = rand(FLOOR.x0 + 16, FLOOR.x1 - 16);
      e.y = rand(FLOOR.y0 + 16, FLOOR.y1 - 8);
    } while (Math.hypot(e.x - p.x, e.y - p.y) < clearance);
    e.entering = false;
    return e;
  }

  /** A door away from the player. */
  private door(): DoorId {
    const p = this.g.player;
    const far = DOOR_IDS.filter((d) => Math.hypot(DOORS[d].ix - p.x, DOORS[d].iy - p.y) > 60);
    return pick(far.length ? far : DOOR_IDS);
  }
}
