import { loadRom, scanHeaders, PROG_BASE } from '../rom';
const rom = loadRom(process.env.HOME + '/Downloads/smashtv.zip');
const hs = scanHeaders(rom);
const at = new Map(hs.map((h, i) => [h.at, i]));
const dv = new DataView(rom.prog.buffer);
// every 16-bit aligned 32-bit value that points at a header
const refs: [number, number][] = [];
for (let i = 0; i + 4 <= rom.prog.length; i += 2) {
  const v = dv.getUint32(i, true);
  if (at.has(v)) refs.push([PROG_BASE + i * 8, at.get(v)!]);
}
console.log('headers', hs.length, 'refs', refs.length, 'referenced headers', new Set(refs.map(r => r[1])).size);
// stride histogram between consecutive refs
const st = new Map<number, number>();
for (let k = 1; k < refs.length; k++) { const d = refs[k][0] - refs[k - 1][0]; st.set(d, (st.get(d) ?? 0) + 1); }
console.log([...st].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([d, n]) => `${d / 16}w:${n}`).join(' '));
for (const r of refs.slice(200, 240)) {
  const i = (r[0] - PROG_BASE) / 8;
  const w = []; for (let k = -4; k < 8; k++) w.push(dv.getUint16(i + k * 2, true).toString(16).padStart(4, '0'));
  console.log(r[0].toString(16), 'hdr#' + r[1], w.join(' '));
}
