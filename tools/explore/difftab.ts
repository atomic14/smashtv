// Print word tables indexed by the difficulty adjustment (FFE103B0, FFE10460, ...).
import { loadRom, u16 } from '../rom';
const rom = loadRom(process.env.HOME + '/Downloads/smashtv.zip');
for (const t of process.argv.slice(2)) {
  const a = parseInt(t, 16);
  console.log(t, Array.from({ length: 11 }, (_, i) => u16(rom, a + i * 16)).join(' '));
}
