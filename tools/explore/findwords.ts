import { loadRom, PROG_BASE } from '../rom';
const rom = loadRom(process.env.HOME + '/Downloads/smashtv.zip');
const ws = process.argv.slice(2).map(x => parseInt(x, 16));
const dv = new DataView(rom.prog.buffer);
for (let i = 0; i + ws.length * 2 <= rom.prog.length; i += 2) {
  if (ws.every((w, k) => dv.getUint16(i + k * 2, true) === w)) console.log((PROG_BASE + i * 8).toString(16), dv.getUint16(i - 2, true).toString(16), dv.getUint16(i - 4, true).toString(16));
}
