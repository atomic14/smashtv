// List image headers between two addresses with scan indices: npx tsx tools/explore/range.ts <from> <to>
import { loadRom, scanHeaders } from '../rom';
const rom = loadRom(process.env.HOME + '/Downloads/smashtv.zip');
const [a, b] = process.argv.slice(2).map((x) => parseInt(x, 16));
scanHeaders(rom).forEach((h, i) => { const at = h.at >>> 0; if (at >= a && at < b) console.log(`#${i} ${at.toString(16)} ${h.w}x${h.h} off ${h.xoff},${h.yoff}`); });
