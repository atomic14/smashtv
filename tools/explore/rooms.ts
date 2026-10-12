import { loadRom, u16, u32, PROG_BASE, isProgAddr } from '../rom';
const rom = loadRom(process.env.HOME + '/Downloads/smashtv.zip');
for (let a = PROG_BASE; a < 0xffffff00; a += 16) {
  const w = u16(rom, a), h = u16(rom, a + 16);
  if (w < 100 || w > 1000 || h < 100 || h > 600) continue;
  const lay = u32(rom, a + 48), tab = u32(rom, a + 80), pl = u32(rom, a + 112);
  if (!isProgAddr(lay) || !isProgAddr(tab) || !isProgAddr(pl)) continue;
  const p0 = u32(rom, pl);
  if (!isProgAddr(p0)) continue;
  console.log(a.toString(16), w, h, u16(rom, a + 32).toString(16), lay.toString(16), tab.toString(16), pl.toString(16), p0.toString(16), u32(rom, pl + 32).toString(16));
}
