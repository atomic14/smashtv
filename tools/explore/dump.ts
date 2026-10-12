import { loadRom, PROG_BASE, u16 } from '../rom';
const rom = loadRom(process.env.HOME + '/Downloads/smashtv.zip');
const [a, n, per] = [parseInt(process.argv[2], 16), Number(process.argv[3] ?? 64), Number(process.argv[4] ?? 8)];
for (let r = 0; r < n; r++) {
  const base = a + r * per * 16;
  const w = []; for (let k = 0; k < per; k++) w.push(u16(rom, base + k * 16).toString(16).padStart(4, '0'));
  console.log(base.toString(16), w.join(' '));
}
