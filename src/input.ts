// Twin-stick input from keyboard, gamepad and touch (two floating thumbsticks).

export interface Vec {
  x: number;
  y: number;
}

class Input {
  move: Vec = { x: 0, y: 0 };
  fire: Vec = { x: 0, y: 0 };
  /** Edge-triggered "start / confirm". */
  start = false;
  pause = false;
  /** Edge-triggered "toggle the AI partner" (2 key, or a gamepad's Select). */
  partner = false;
  /** True once any touch has been seen; switches the UI to touch hints. */
  touch = false;

  private keys = new Set<string>();
  private startLatch = false;
  private pauseLatch = false;
  private padStart = false;
  private partnerLatch = false;
  private padSelect = false;
  private touchMove: Vec = { x: 0, y: 0 };
  private touchFire: Vec = { x: 0, y: 0 };
  private touchTap = false;

  init() {
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      this.keys.add(e.code);
      if (e.code === 'Enter' || e.code === 'Space') this.startLatch = true;
      if (e.code === 'Escape' || e.code === 'KeyP') this.pauseLatch = true;
      if (e.code === 'Digit2' || e.code === 'Numpad2') this.partnerLatch = true;
      if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    if (matchMedia('(pointer: coarse)').matches || new URLSearchParams(location.search).has('touch')) {
      this.touch = true;
      document.body.classList.add('touch');
    }
    this.initTouch();
    // phones: go fullscreen on the first tap (browsers only allow it from a user gesture).
    // iPhone Safari has no fullscreen for pages; there, "Add to Home Screen" runs it
    // fullscreen via the manifest and apple-mobile-web-app-capable.
    if (this.touch) {
      const go = () => {
        const el = document.documentElement;
        if (!document.fullscreenElement && el.requestFullscreen) el.requestFullscreen({ navigationUI: 'hide' }).catch(() => {});
      };
      addEventListener('touchend', go, { passive: true });
    }
  }

  /** Call once per game tick. */
  poll() {
    const k = (c: string) => (this.keys.has(c) ? 1 : 0);
    let mx = k('KeyD') - k('KeyA');
    let my = k('KeyS') - k('KeyW');
    let fx = k('ArrowRight') - k('ArrowLeft') + k('KeyL') - k('KeyJ');
    let fy = k('ArrowDown') - k('ArrowUp') + k('KeyK') - k('KeyI');

    let padStart = false, padSelect = false;
    for (const pad of navigator.getGamepads?.() ?? []) {
      if (!pad) continue;
      const dz = (v: number) => (Math.abs(v) < 0.3 ? 0 : v);
      mx += dz(pad.axes[0] ?? 0);
      my += dz(pad.axes[1] ?? 0);
      fx += dz(pad.axes[2] ?? 0);
      fy += dz(pad.axes[3] ?? 0);
      const b = (i: number) => (pad.buttons[i]?.pressed ? 1 : 0);
      mx += b(15) - b(14);
      my += b(13) - b(12);
      // face buttons fire in four directions (Y up, A down, X left, B right)
      fx += b(1) - b(2);
      fy += b(0) - b(3);
      if (b(9)) padStart = true;
      if (b(8)) padSelect = true;
    }
    if (padStart && !this.padStart) this.startLatch = true;
    this.padStart = padStart;
    if (padSelect && !this.padSelect) this.partnerLatch = true;
    this.padSelect = padSelect;

    mx += this.touchMove.x;
    my += this.touchMove.y;
    fx += this.touchFire.x;
    fy += this.touchFire.y;

    this.move = clampVec(mx, my);
    this.fire = clampVec(fx, fy);
    this.start = this.startLatch || this.touchTap;
    this.pause = this.pauseLatch;
    this.partner = this.partnerLatch;
    this.startLatch = this.pauseLatch = this.touchTap = this.partnerLatch = false;
  }

  private initTouch() {
    const moveEl = document.getElementById('stick-move')!;
    const fireEl = document.getElementById('stick-fire')!;
    const RADIUS = 48;
    interface Stick { id: number; ox: number; oy: number; el: HTMLElement; out: Vec; moved: boolean; t: number }
    const sticks = new Map<number, Stick>();
    const home = () => {
      const portrait = innerHeight > innerWidth;
      const y = portrait ? innerHeight - Math.min(140, innerHeight * 0.2) : innerHeight - 90;
      // in landscape, sit the sticks in the margins beside the game screen when there's room
      const screenW = document.getElementById('screen')?.getBoundingClientRect().width ?? innerWidth;
      const margin = (innerWidth - screenW) / 2;
      const fx = !portrait && margin > 90 ? margin / 2 / innerWidth : 0.2;
      for (const [el, x] of [[moveEl, fx], [fireEl, 1 - fx]] as const) {
        if ([...sticks.values()].some((s) => s.el === el)) continue;
        el.style.left = `${innerWidth * x}px`;
        el.style.top = `${y}px`;
        (el.firstElementChild as HTMLElement).style.transform = '';
      }
    };
    home();
    addEventListener('resize', () => requestAnimationFrame(home));

    const setKnob = (s: Stick, dx: number, dy: number) => {
      const d = Math.hypot(dx, dy);
      const k = d > RADIUS ? RADIUS / d : 1;
      (s.el.firstElementChild as HTMLElement).style.transform = `translate(${dx * k}px, ${dy * k}px)`;
      const m = Math.min(1, d / RADIUS);
      s.out.x = d > 6 ? (dx / d) * m : 0;
      s.out.y = d > 6 ? (dy / d) * m : 0;
      if (d > 10) s.moved = true;
    };

    const onStart = (e: TouchEvent) => {
      if (!this.touch) {
        this.touch = true;
        document.body.classList.add('touch');
      }
      for (const t of Array.from(e.changedTouches)) {
        const left = t.clientX < innerWidth / 2;
        const el = left ? moveEl : fireEl;
        if ([...sticks.values()].some((s) => s.el === el)) continue;
        const s: Stick = { id: t.identifier, ox: t.clientX, oy: t.clientY, el, out: left ? this.touchMove : this.touchFire, moved: false, t: performance.now() };
        sticks.set(t.identifier, s);
        el.style.left = `${t.clientX}px`;
        el.style.top = `${t.clientY}px`;
        el.classList.add('active');
      }
      e.preventDefault();
    };
    const onMove = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        const s = sticks.get(t.identifier);
        if (s) setKnob(s, t.clientX - s.ox, t.clientY - s.oy);
      }
      e.preventDefault();
    };
    const onEnd = (e: TouchEvent) => {
      for (const t of Array.from(e.changedTouches)) {
        const s = sticks.get(t.identifier);
        if (!s) continue;
        if (!s.moved && performance.now() - s.t < 300) this.touchTap = true;
        s.out.x = s.out.y = 0;
        s.el.classList.remove('active');
        sticks.delete(t.identifier);
      }
      home();
      e.preventDefault();
    };
    const opts = { passive: false } as AddEventListenerOptions;
    addEventListener('touchstart', onStart, opts);
    addEventListener('touchmove', onMove, opts);
    addEventListener('touchend', onEnd, opts);
    addEventListener('touchcancel', onEnd, opts);
  }
}

function clampVec(x: number, y: number): Vec {
  const d = Math.hypot(x, y);
  return d > 1 ? { x: x / d, y: y / d } : { x, y };
}

export const input = new Input();

/** Quantise a vector to one of 8 directions (0 = up, clockwise), or -1 if idle. */
export function dir8(v: Vec, dead = 0.35): number {
  if (Math.hypot(v.x, v.y) < dead) return -1;
  const a = Math.atan2(v.x, -v.y);
  return (Math.round(a / (Math.PI / 4)) + 8) % 8;
}

export const DIR_VEC: Vec[] = [
  { x: 0, y: -1 },
  { x: Math.SQRT1_2, y: -Math.SQRT1_2 },
  { x: 1, y: 0 },
  { x: Math.SQRT1_2, y: Math.SQRT1_2 },
  { x: 0, y: 1 },
  { x: -Math.SQRT1_2, y: Math.SQRT1_2 },
  { x: -1, y: 0 },
  { x: -Math.SQRT1_2, y: -Math.SQRT1_2 },
];
export const DIR_NAME = ['u', 'ur', 'r', 'dr', 'd', 'dl', 'l', 'ul'];
