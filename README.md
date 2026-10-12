# Smash T.V. — TypeScript remake

A browser remake of Williams' *Smash T.V.* (1990), built with Vite and TypeScript. It is
not an emulator: the game logic is new code, and all graphics and sound come from your
own copy of the arcade ROM set.

## Setup

```sh
npm install
npm run extract -- /path/to/smashtv.zip    # graphics: sprites, fonts, arenas, title art
tools/record-audio.sh /path/to/rom-dir      # sound: needs mame, ffmpeg and uv (optional)
npm run dev                                 # http://localhost:5173 (also on your LAN for phones)
```

The extracted data lands in `public/assets/`. It is git-ignored because it is derived
from the copyrighted ROMs.

## Controls

| | Move | Fire | Start / pause |
|---|---|---|---|
| Keyboard | WASD | Arrow keys (or IJKL) | Enter / P or Esc (M mutes) |
| Gamepad | Left stick / d-pad | Right stick, or face buttons | Start |
| Touch | Left thumbstick | Right thumbstick | Tap |

On phones, portrait shows the screen on top with the thumbsticks below; landscape overlays
the sticks beside the screen.

## How the assets were reverse engineered

The hardware is the Williams Y-unit: a TMS34010 CPU (bit-addressed) and a DMA blitter, with
no hardware sprites. MAME's `midyunit` driver documents the blitter. Everything else was
found by tracing the game in MAME (Lua taps on the DMA, palette and sound registers, plus
debugger watchpoints) and by reading the disassembly.

- **Graphics ROM**: three groups of chips (u111–113, u95–97, u106–108) each give 2 bits of
  a 6-bit pixel, four pixels per byte. Address = `(bitaddr − 0x02000000) >> 3`, rows padded
  to a multiple of 4 pixels.
- **Image headers** (program ROM): `w, h, xoff, yoff, gfx_addr, palette_ptr` (16 bytes), or
  12 bytes without the palette for the player parts, which use the fixed system palette at
  `0xFFFC6160`. Sprites are drawn at `left = x − xoff`, `top = y − yoff`, mirrored as
  `x − (w − 1 − xoff)`.
- **Palettes**: a u16 count followed by xRRRRRGGGGGBBBBB words.
- **Backgrounds**: room descriptors (`w, h, count, layout*, block_table*, palette_list*`).
  Layout records are `flags, x, y, block`. The palette is
  `list[(flags & 0xF) + 16·(block >> 12)]`, `0x10`/`0x20` are flips, `0x40` means
  transparent and the high byte is draw priority. This was decoded from the room builder at
  `FFE0CD00`. The floor colour is the autoerase colour (palette entry 0x3D).
- **Animations / directions**: lists of header pointers, e.g. the grunt direction table at
  `FFE4DD00` and the player leg cycles at `FFE24A00`. Names are assigned in
  `tools/catalog.ts`.
- **Fonts**: ASCII tables at `FFE64630` (two fonts, 93 glyphs each).
- **World maps**: the table at `FFE72650` points at one list per world of
  `(room descriptor, x, y)`. Arenas sit on a ~472×332 grid, and corridor pieces
  (`FFF6C720` horizontal, `FFF6C690` vertical, `FFF6C7B0` from the studio) record which
  rooms connect. The current list lives at RAM `010DD4E0` and the camera at `01000240/260`.
- **Bosses**: each boss's parts share one anchor and are drawn as mirrored pairs. Cobra
  Death and Scarface mirror their right half 5 px left of the generic flip rule, the host's
  torso 1 px, and Mutoid Man's chassis not at all. `tools/mame/bossrun.lua` pins the lives
  counter (RAM `01086360`), walks the room graph to each boss and records the fight.
- **Sound**: the main CPU writes `0xFD00|cmd` then `0xFF00|cmd` to `0x01E00000`. Commands
  `01–10` are music, `11–2E`/`60–7E` are volume, and the rest are effects and speech.
  `tools/mame/sndrec.lua` drives the sound board directly, one latch write per frame, and
  records each command. Speech clips were identified with Whisper.

Developer tools: `tools/contact-sheet.ts` dumps every image, `tools/replay.ts` replays
captured blitter display lists (`tools/mame/framelog.lua`) through a software blitter, and
`tools/explore/` holds the one-off ROM probes.

## Status

**Ported from the original:**
- All art, palettes, arenas, fonts, sound effects, speech and music.
- The player's legs + torso compositing and the enemy direction sets.
- The real world maps (branching room grids, `$` bonus rooms, world 3's gauntlet to the
  finale) and scrolling room transitions with EXIT signs.
- Prize captions.
- All four bosses (Mutoid Man, Scarface, Cobra Death and the host). Their construction,
  attacks and damage states come from MAME traces of the real fights
  (`tools/mame/bossrun.lua`).

**Approximated:** regular enemy AI, speeds and wave sizes, power-up durations, scoring,
and boss timings and hit points are hand-tuned rather than lifted from the original code.
Only player 1 is supported.
