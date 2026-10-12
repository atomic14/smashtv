import { readFileSync } from 'node:fs';
import { loadRom, PROG_BASE } from '../rom';
const rom = loadRom(process.env.HOME + '/Downloads/smashtv.zip');
const hs = JSON.parse(readFileSync(process.argv[2], 'utf8')) as { i: number; at: number }[];
const at = new Map(hs.map(h => [h.at, h.i]));
const dv = new DataView(rom.prog.buffer);
let lastI = -99, line: string[] = [];
const flush = () => { if (line.length) console.log(line.join(' ')); line = []; };
for (let i = 0; i + 4 <= rom.prog.length; i += 2) {
  const v = dv.getUint32(i, true);
  if (!at.has(v)) continue;
  if (i - lastI > 8) { flush(); line.push((PROG_BASE + i * 8).toString(16) + ':'); }
  else if (i - lastI > 4) line.push('[' + dv.getUint16(i - 2, true).toString(16) + ']');
  line.push(String(at.get(v)));
  lastI = i;
}
flush();
