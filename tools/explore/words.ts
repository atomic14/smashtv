// Dump N 16-bit words at an address: npx tsx tools/explore/words.ts <addr> [n]
import { loadRom, u16 } from '../rom';
const rom = loadRom(process.env.HOME + '/Downloads/smashtv.zip');
const [a, n = '16'] = process.argv.slice(2);
const base = parseInt(a, 16);
console.log(Array.from({ length: +n }, (_, i) => u16(rom, base + i * 16).toString(16).padStart(4, '0')).join(' '));
