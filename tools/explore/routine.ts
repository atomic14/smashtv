// Summarise routines in the MAME disassembly: processes they create (MOVI id,A1 + MOVI
// entry,A7 + CALLA FFE0ABA0) and image headers they reference, named via anims.json.
// Follows created processes and local calls a couple of levels deep.
//   npx tsx tools/explore/routine.ts <prog.txt> <addr>...
import { readFileSync } from 'node:fs';
const [file, ...addrs] = process.argv.slice(2);
const lines = readFileSync(file, 'utf8').split('\n');
const at = new Map<number, number>();
lines.forEach((l, i) => { const m = /^([0-9A-F]{8}):/.exec(l); if (m) at.set(parseInt(m[1], 16), i); });
const anims = JSON.parse(readFileSync('public/assets/anims.json', 'utf8')).anims as Record<string, [string, number][]>;
const name = new Map<number, string>();
for (const [n, fr] of Object.entries(anims)) for (const [k] of fr) { const a = parseInt(k.split('~')[0], 16); if (!name.has(a)) name.set(a, n); }

function scan(addr: number, depth: number, seen: Set<number>, indent: string) {
  if (seen.has(addr) || depth > 2) return;
  seen.add(addr);
  let i = at.get(addr);
  if (i === undefined) { console.log(indent + addr.toString(16) + ' ?'); return; }
  const imgs = new Set<string>(), calls: number[] = [], procs: string[] = [];
  let lastId = -1, lastEntry = -1;
  for (let n = 0; n < 160; n++, i++) {
    const l = lines[i] ?? '';
    const ins = l.replace(/^[0-9A-F]{8}: (?:[0-9A-F]{4} )+\s*/, '').trim();
    let m;
    if ((m = /MOVI\s+([0-9A-F]+)h,A1$/.exec(ins)) && parseInt(m[1], 16) < 0x10000) lastId = parseInt(m[1], 16);
    if ((m = /MOVI\s+(FF[0-9A-F]{6})h,A7$/.exec(ins))) lastEntry = parseInt(m[1], 16);
    if (/CALLA\s+FFE0ABA0h/.test(ins)) { procs.push(`proc ${lastId.toString(16)} @${lastEntry.toString(16)}`); if (lastEntry > 0) calls.push(lastEntry); }
    for (const mm of ins.matchAll(/(FF[F][0-9A-F]{5})h/g)) { const v = parseInt(mm[1], 16); if (name.has(v)) imgs.add(name.get(v)!); }
    if ((m = /CALL[AR]\s+(FFE[0-9A-F]{5})h/.exec(ins))) { const v = parseInt(m[1], 16); if (v > 0xffe10000) calls.push(v); }
    if (/^RETS|^JA\s+FFE0A5F0h|^JA\s+FFE0A5F0/.test(ins) && n > 2) break;
  }
  console.log(`${indent}${addr.toString(16)}: ${procs.join(', ')}${imgs.size ? '  imgs: ' + [...imgs].join(' ') : ''}`);
  for (const c of calls) scan(c, depth + 1, seen, indent + '  ');
}
for (const a of addrs) { console.log('== ' + a); scan(parseInt(a, 16), 0, new Set(), '  '); }
