// Loads the assets produced by tools/extract.ts (sprites, named animations, fonts, rooms).

/** [page, x, y, w, h, xoff, yoff] */
export type FrameData = [number, number, number, number, number, number, number];
/** A frame reference inside an animation: [frame key, flipped] */
export type AnimFrame = [string, number];

export interface Assets {
  pages: HTMLImageElement[];
  frames: Record<string, FrameData>;
  anims: Record<string, AnimFrame[]>;
  fonts: { big: Record<string, string>; small: Record<string, string> };
  rooms: Record<string, { w: number; h: number }>;
  roomImages: Map<string, HTMLImageElement>;
}

const BASE = `${import.meta.env.BASE_URL}assets/`;

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load ${url}`));
    img.src = url;
  });
}

async function json<T>(name: string): Promise<T> {
  const r = await fetch(BASE + name);
  if (!r.ok) throw new Error(`failed to load ${name} (run "npm run extract -- <smashtv.zip>")`);
  return r.json() as Promise<T>;
}

export let assets: Assets;

export async function loadAssets(roomsToPreload: string[]): Promise<Assets> {
  const [sprites, anims, rooms] = await Promise.all([
    json<{ pages: number; frames: Record<string, FrameData> }>('sprites.json'),
    json<{ anims: Assets['anims']; fonts: Assets['fonts'] }>('anims.json'),
    json<Assets['rooms']>('rooms.json'),
  ]);
  const pages = await Promise.all(Array.from({ length: sprites.pages }, (_, i) => loadImage(`${BASE}sprites-${i}.png`)));
  const roomImages = new Map<string, HTMLImageElement>();
  await Promise.all(
    roomsToPreload.map(async (id) => roomImages.set(id, await loadImage(`${BASE}rooms/${id}.png`))),
  );
  assets = { pages, frames: sprites.frames, anims: anims.anims, fonts: anims.fonts, rooms, roomImages };
  return assets;
}

export function anim(name: string): AnimFrame[] {
  const a = assets.anims[name];
  if (!a) throw new Error(`unknown animation ${name}`);
  return a;
}
