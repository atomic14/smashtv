// Which ROM palette is loaded in a palette slot at a given line of a recording?
import { readFileSync } from 'node:fs';
import { loadRom, u16 } from '../rom';
const [log, lineArg, ...slots] = process.argv.slice(2);
const rom = loadRom(process.env.HOME + '/Downloads/smashtv.zip');
let pal = '';
const lines = readFileSync(log, 'utf8').split('\n');
for (let i = 0; i <= Number(lineArg); i++) { const m = lines[i]?.match(/"pal":"([0-9a-f]+)"/); if (m) pal = m[1]; }
const ram = (i: number) => parseInt(pal.slice(i * 4, i * 4 + 4), 16);
for (const s of slots.map((x) => parseInt(x, 16))) {
  const v = (s << 8) & 0xffff, base = ((v & 0xc000) >> 8) | (v & 0x0f3f);
  let best = [0, 0];
  for (let a = 0xffe00000; a < 0xffffff00; a += 16) {
    const c = u16(rom, a); if (c < 8 || c > 64) continue;
    let ok = 0; for (let i = 0; i < c; i++) if (u16(rom, a + 16 + i * 16) === ram(base + i)) ok++;
    if (ok > best[1]) best = [a, ok];
  }
  console.log(s.toString(16), '->', best[0].toString(16), best[1], 'of', u16(rom, best[0]));
}
