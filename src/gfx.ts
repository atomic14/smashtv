// Canvas renderer working in the original 400x256 screen space.
// Sprites are drawn with the ROM's anchor convention:
//   left = x - xoff (flipped: x - (w - 1 - xoff)),  top = y - yoff
import { assets, anim, type AnimFrame } from './assets';

export const W = 400;
export const H = 256;

export let ctx: CanvasRenderingContext2D;

export function initGfx(canvas: HTMLCanvasElement) {
  ctx = canvas.getContext('2d', { alpha: false })!;
  ctx.imageSmoothingEnabled = false;
}

export function drawFrame([key, flip]: AnimFrame, x: number, y: number, alpha = 1) {
  const f = assets.frames[key];
  if (!f) return;
  const [page, sx, sy, w, h, xoff, yoff] = f;
  const top = Math.round(y - yoff);
  if (alpha !== 1) ctx.globalAlpha = alpha;
  if (flip) {
    const left = Math.round(x - (w - 1 - xoff));
    ctx.save();
    ctx.translate(left + w, top);
    ctx.scale(-1, 1);
    ctx.drawImage(assets.pages[page], sx, sy, w, h, 0, 0, w, h);
    ctx.restore();
  } else {
    ctx.drawImage(assets.pages[page], sx, sy, w, h, Math.round(x - xoff), top, w, h);
  }
  if (alpha !== 1) ctx.globalAlpha = 1;
}

/** Draws a frame's raw image with its top-left corner at (x, y), ignoring the anchor. */
export function drawFrameAt([key, flip]: AnimFrame, x: number, y: number) {
  const f = assets.frames[key];
  if (!f) return;
  const [, , , w, , xoff] = f;
  drawFrame([key, flip], x + (flip ? w - 1 - xoff : xoff), y + f[6]);
}

export function frameSize(name: string, i = 0): { w: number; h: number } {
  const f = assets.frames[anim(name)[i][0]];
  return { w: f[3], h: f[4] };
}

const footCache = new Map<string, { x: number; y: number }>();
/**
 * Offset from an animation's anchor to its "feet" (bottom centre of the first frame), so
 * game objects can be positioned by their feet regardless of how the art was anchored.
 */
export function footOffset(name: string): { x: number; y: number } {
  let o = footCache.get(name);
  if (!o) {
    const [key, flip] = anim(name)[0];
    const [, , , w, h, xoff, yoff] = assets.frames[key];
    const left = flip ? -(w - 1 - xoff) : -xoff;
    o = { x: left + w / 2, y: -yoff + h };
    footCache.set(name, o);
  }
  return o;
}

/** Draw frame `i` of an animation positioned by its feet, with the given foot offset name. */
export function drawAt(name: string, i: number, feetX: number, feetY: number, base = name, alpha = 1) {
  const frames = anim(name);
  const o = footOffset(base);
  drawFrame(frames[((i % frames.length) + frames.length) % frames.length], feetX - o.x, feetY - o.y, alpha);
}

// ---- text ---------------------------------------------------------------------------

export type Font = 'big' | 'small';

export function textWidth(s: string, font: Font = 'small'): number {
  let w = 0;
  for (const ch of s) w += glyphAdvance(ch, font);
  return w;
}

function glyphAdvance(ch: string, font: Font) {
  if (ch === ' ') return font === 'big' ? 8 : 6;
  const key = assets.fonts[font][ch] ?? assets.fonts[font][ch.toUpperCase()];
  if (!key) return 0;
  return assets.frames[key][3] + 1;
}

export function drawText(s: string, x: number, y: number, font: Font = 'small', align: 'left' | 'center' | 'right' = 'left') {
  if (align !== 'left') {
    const w = textWidth(s, font);
    x -= align === 'center' ? w / 2 : w;
  }
  x = Math.round(x);
  for (const ch of s) {
    const key = assets.fonts[font][ch] ?? assets.fonts[font][ch.toUpperCase()];
    if (key) {
      const [page, sx, sy, w, h] = assets.frames[key];
      ctx.drawImage(assets.pages[page], sx, sy, w, h, x, y, w, h);
    }
    x += glyphAdvance(ch, font);
  }
}

export function fillRect(x: number, y: number, w: number, h: number, color: string) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}
