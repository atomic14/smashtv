import { readFileSync } from 'node:fs';
const [wav, log] = process.argv.slice(2);
const buf = readFileSync(wav);
const dataOff = buf.indexOf('data') + 8;
const rate = 48000;
const n = (buf.length - dataOff) / 4;
const sample = (i: number) => (buf.readInt16LE(dataOff + i * 4) + buf.readInt16LE(dataOff + i * 4 + 2)) / 2;
const lines = readFileSync(log, 'utf8').trim().split('\n').map(l => l.split(' ').map(Number));
for (let k = 0; k < lines.length; k++) {
  const [cmd, t] = lines[k];
  const end = k + 1 < lines.length ? lines[k + 1][1] : t + 4;
  const a = Math.floor(t * rate), b = Math.min(n, Math.floor(end * rate));
  let peak = 0, last = -1, first = -1;
  const win = 480;
  for (let i = a; i < b; i += win) {
    let lo = 1e9, hi = -1e9; for (let j = i; j < Math.min(b, i + win); j++) { const v = sample(j); lo = Math.min(lo, v); hi = Math.max(hi, v); } const s = hi - lo;
    peak = Math.max(peak, s);
    if (s > 300) { last = i; if (first < 0) first = i; }
  }
  const dur = last < 0 ? 0 : (last - a) / rate;
  const st = first < 0 ? 0 : (first - a) / rate;
  console.log(cmd.toString(16).padStart(2, '0'), 'peak', peak, 'start', st.toFixed(2), 'until', dur.toFixed(2), dur > 3.8 ? 'LONG' : '');
}
