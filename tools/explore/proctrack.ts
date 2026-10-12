// Follow the objects of one process id through a room recording: every Nth logged frame,
// print each live process's object position, velocity and image.
//   npx tsx tools/explore/proctrack.ts <room.jsonl> <id hex> [every=60] [limit=40]
import { createReadStream, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const [file, idHex, every = '60', limit = '40'] = process.argv.slice(2);
const id = parseInt(idHex, 16);
const anims = JSON.parse(readFileSync('public/assets/anims.json', 'utf8')).anims as Record<string, [string, number][]>;
const name = new Map<number, string>();
for (const [n, fr] of Object.entries(anims)) for (const [k] of fr) { const a = parseInt(k.split('~')[0], 16) & 0xffffff; if (!name.has(a)) name.set(a, n); }

let shown = 0;
const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
for await (const line of rl) {
  const r = JSON.parse(line) as { t: number; p: number[]; pr: number[][]; ob?: number[][] };
  if (!r.ob || r.t % Number(every) !== 0) continue;
  const objs = new Map(r.ob.map((o) => [o[0], o]));
  const mine = r.pr.filter((p) => p[0] === id);
  if (!mine.length) continue;
  const desc = mine.map(([, , obj]) => {
    const o = objs.get(obj);
    if (!o) return '-';
    return `${(name.get(o[1]) ?? o[1].toString(16))}@${o[2].toFixed(0)},${o[3].toFixed(0)} v${o[4].toFixed(2)},${o[5].toFixed(2)}`;
  });
  console.log(`t${(r.t / 60).toFixed(1)} player ${r.p.join(',')}: ${desc.join(' | ')}`);
  if (++shown >= Number(limit)) break;
}
