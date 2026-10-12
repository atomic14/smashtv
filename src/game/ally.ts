// The AI partner: drives player 2 like a decent human would. It sticks near player 1,
// keeps clear of crowds, mines and incoming fire, grabs pickups when it is safe to, and
// shoots whatever is most dangerous, preferring enemies closing in on player 1.
import { type Vec } from '../input';
import { DT, FLOOR, rand, bodyCenter } from './world';
import type { Brain, Player, Enemy } from './entities';
import { FloorMine } from './enemies';
import type { Game } from './game';

/** Keep within this band of distances from player 1. */
const NEAR = 45, FAR = 110;

export class AllyBrain implements Brain {
  private target: Enemy | null = null;
  private retarget = 0;
  /** A spot near player 1 to drift towards, changed now and then so it doesn't just tail. */
  private post: Vec = { x: 0, y: 0 };
  private postT = 0;

  think(g: Game, me: Player): { move: Vec; fire: Vec } {
    const lead = g.player;
    const foes = g.enemies.filter((e) => !e.dead && e.shootable);

    // --- aim: re-pick a target a few times a second (reaction time, not a perfect bot)
    if ((this.retarget -= DT) <= 0 || !this.target || this.target.dead) {
      this.retarget = rand(0.12, 0.25);
      this.target = this.pickTarget(foes, me, lead);
    }
    let fire: Vec = { x: 0, y: 0 };
    if (this.target && g.state === 'play') {
      const c = bodyCenter(this.target);
      fire = { x: c.x - me.x, y: c.y - (me.y - 14) };
    }

    // --- move: a sum of pushes
    let mx = 0, my = 0;
    const add = (x: number, y: number, w: number) => {
      const d = Math.hypot(x, y) || 1;
      mx += (x / d) * w;
      my += (y / d) * w;
    };
    // keep away from enemies, more strongly the closer they are; mines are worse
    for (const e of g.enemies) {
      if (e.dead || !e.lethal) continue;
      const dx = me.x - e.x, dy = me.y - e.y, d = Math.hypot(dx, dy);
      const range = e instanceof FloorMine ? 34 : 75;
      if (d < range) add(dx, dy, ((range - d) / range) ** 2 * (e instanceof FloorMine ? 3 : 2.2));
    }
    // sidestep enemy shots that are about to pass close by
    for (const s of g.shots) {
      if (s.friendly || s.dead) continue;
      const rx = me.x - s.x, ry = me.y - 10 - s.y;
      const v2 = s.vx * s.vx + s.vy * s.vy || 1;
      const t = (rx * s.vx + ry * s.vy) / v2; // seconds to closest approach
      if (t < 0 || t > 0.7) continue;
      const cx = rx - s.vx * t, cy = ry - s.vy * t;
      if (Math.hypot(cx, cy) < 18) add(cx || -s.vy, cy || s.vx, 2.5);
    }
    // stay with player 1, at a spot beside them
    if ((this.postT -= DT) <= 0) {
      this.postT = rand(1.5, 3);
      const a = rand(0, Math.PI * 2);
      this.post = { x: Math.cos(a) * rand(NEAR, FAR * 0.8), y: Math.sin(a) * rand(NEAR, FAR * 0.6) };
    }
    const lx = lead.x + this.post.x - me.x, ly = lead.y + this.post.y - me.y;
    const ld = Math.hypot(lead.x - me.x, lead.y - me.y);
    const pull = g.cleared ? 1.2 : ld > FAR ? 1.4 : 0.5;
    if (Math.hypot(lx, ly) > 8) add(lx, ly, pull);
    if (ld < NEAR * 0.6) add(me.x - lead.x, me.y - lead.y, 0.8);
    // grab nearby pickups when nothing is too close
    const safe = !g.enemies.some((e) => !e.dead && e.lethal && Math.hypot(e.x - me.x, e.y - me.y) < 60);
    if (safe) {
      let best: Vec | null = null, bd = 110;
      for (const pk of g.pickups) {
        const d = Math.hypot(pk.x - me.x, pk.y - me.y);
        if (d < bd) [best, bd] = [pk, d];
      }
      if (best) add(best.x - me.x, best.y - me.y, 1.1);
    }
    // keep off the walls
    const wall = 22;
    if (me.x < FLOOR.x0 + wall) mx += 1;
    if (me.x > FLOOR.x1 - wall) mx -= 1;
    if (me.y < FLOOR.y0 + wall) my += 1;
    if (me.y > FLOOR.y1 - wall) my -= 1;

    const m = Math.hypot(mx, my);
    const move = m < 0.25 ? { x: 0, y: 0 } : { x: mx / m, y: my / m };
    return { move, fire };
  }

  /** The most pressing enemy: close to player 1, close to me, or about to hit someone. */
  private pickTarget(foes: Enemy[], me: Player, lead: Player) {
    let best: Enemy | null = null, bestScore = Infinity;
    for (const e of foes) {
      if (e.x < FLOOR.x0 - 30 || e.x > FLOOR.x1 + 30 || e.y < FLOOR.y0 - 60 || e.y > FLOOR.y1 + 20) continue;
      const dMe = Math.hypot(e.x - me.x, e.y - me.y);
      const dLead = lead.alive ? Math.hypot(e.x - lead.x, e.y - lead.y) : Infinity;
      const score = Math.min(dMe, dLead * 0.8) + (e instanceof FloorMine ? 80 : 0);
      if (score < bestScore) [best, bestScore] = [e, score];
    }
    return best;
  }
}
