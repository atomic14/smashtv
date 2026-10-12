import { loadRom, PROG_BASE } from '../rom';
const rom = loadRom(process.env.HOME + '/Downloads/smashtv.zip');
const dv = new DataView(rom.prog.buffer);
const ctx = Number(process.env.CTX ?? 8);
for (const a of process.argv.slice(2)) {
  const v = parseInt(a, 16) >>> 0;
  for (let i = 0; i + 4 <= rom.prog.length; i += 2) {
    if (dv.getUint32(i, true) === v) {
      const words = [];
      for (let k = -ctx; k < ctx + 2; k++) words.push(i + k * 2 >= 0 ? dv.getUint16(i + k * 2, true).toString(16).padStart(4, '0') : '----');
      console.log(a, '@', (PROG_BASE + i * 8).toString(16), words.join(' '));
    }
  }
}
