// Dev tool: replay a captured display list (from tools/mame/framelog.lua) through the
// blitter model and save the result as PNG.
// usage: tsx tools/replay.ts <smashtv.zip> <frames.jsonl> <from-to> <out.png> [filter]
//   all blits from frames from..to are drawn cumulatively (VRAM persists between frames)
//   filter: optional JS expression over (cmd, off, w, h, skip, x, y, pal, color, i)
import { readFileSync, writeFileSync } from 'node:fs';
import { PNG } from 'pngjs';
import { loadRom } from './rom';
import { Blitter, penIndex, parsePaletteHex, rgb555, type Blit } from './blitter';

const [zip, log, frameArg, out, filterSrc] = process.argv.slice(2);
const rom = loadRom(zip);
const [from, to = from] = frameArg.split('-').map(Number);
const filter = filterSrc
  ? (new Function('cmd', 'off', 'w', 'h', 'skip', 'x', 'y', 'pal', 'color', 'i', `return (${filterSrc});`) as (...a: number[]) => boolean)
  : null;

const b = new Blitter(rom);
let palHex = '';
let count = 0;
for (const line of readFileSync(log, 'utf8').split('\n')) {
  if (!line) continue;
  const frame = Number(line.slice(9, line.indexOf(',')));
  if (frame > to) break;
  const rec = JSON.parse(line) as { frame: number; blits: Blit[]; pal?: string };
  if (rec.pal) palHex = rec.pal;
  if (frame < from) continue;
  b.autoerase();
  rec.blits.forEach((bl, i) => {
    if (!filter || filter(...bl, i)) b.draw(bl);
  });
  count += rec.blits.length;
}
const pal = parsePaletteHex(palHex);
const png = new PNG({ width: 512, height: 512 });
for (let i = 0; i < 512 * 512; i++) {
  const [r, g, bl] = rgb555(pal[penIndex(b.vram[i])]);
  png.data.set([r, g, bl, 255], i * 4);
}
writeFileSync(out, PNG.sync.write(png));
console.log(`${count} blits`);
