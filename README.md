# Smash T.V. — a browser port

**Play it at [smashtv.atomic14.com](https://smashtv.atomic14.com)** — on a desktop, with a
gamepad, or on your phone.

A port of the 1990 arcade game *Smash T.V.* to the browser, written in TypeScript with Vite.
It is not an emulator: the game logic has been rewritten from scratch, while the graphics,
sound, music, level layouts and enemy waves are read straight out of the original arcade
ROMs.

## Credits

**Smash T.V.** was created by **Eugene Jarvis** and **Mark Turmell** and released by
**Williams Electronics Games, Inc.** in 1990. Everything that makes it *Smash T.V.* — the
characters, artwork, music, sound effects, speech, level design and the game itself — is
their work. The Williams/Midway catalogue, including Smash T.V., is now owned by
Warner Bros.

This is a non-commercial fan project made out of admiration for the original. It is not
affiliated with or endorsed by Williams, Midway or Warner Bros. All trademarks and
copyrights in *Smash T.V.* belong to their respective owners. If you enjoy this, play the
real thing.

The port leans heavily on:

- **[MAME](https://www.mamedev.org/)** and its developers. MAME's `midyunit` driver
  documents the Williams Y-unit hardware, and MAME's Lua scripting and debugger made it
  possible to watch the original game run: its blitter, palette, sound commands, process
  lists and RAM.
- **[Whisper](https://github.com/openai/whisper)** (via
  [faster-whisper](https://github.com/SYSTRAN/faster-whisper)) for working out which speech
  clip is which.
- [Vite](https://vitejs.dev/) and [TypeScript](https://www.typescriptlang.org/).

## Controls

| | Move | Fire | Start / pause |
|---|---|---|---|
| Keyboard | WASD | Arrow keys (or IJKL) | Enter / P or Esc (M mutes) |
| Gamepad | Left stick / d-pad | Right stick, or face buttons | Start |
| Touch | Left thumbstick | Right thumbstick | Tap |

On phones, portrait shows the screen on top with the thumbsticks below; landscape puts the
sticks beside the screen. The first tap goes fullscreen where the browser allows it
(Android); on iPhone, use Share → Add to Home Screen to play fullscreen.

## How it was ported

The aim was a faithful port without running an emulator in the page, so the original ROM
set is treated as two things: a **data source** (art, sound, levels, waves), and, run under
MAME, a **reference** to measure the new code against.

1. **Graphics.** The Y-unit has no sprite hardware. A DMA blitter copies images out of the
   graphics ROMs, and the program ROM holds an image header for each one (size, anchor,
   graphics address, palette). `tools/extract.ts` scans the program ROM for those headers,
   decodes every image with its palette into a sprite atlas, and `tools/catalog.ts` names
   them: player legs and torsos, enemy direction sets, bosses, fonts, pickups.
2. **Arenas.** Each room background is assembled at run time from blocks, so the room
   builder's code was disassembled to recover how blocks, flips and palettes combine. Every
   arena, the TV studio and the title screen render pixel-for-pixel from the ROM.
3. **Sound.** The sound board is driven by one-byte commands. A MAME script plays each
   command on the sound board alone and records it, giving every effect, speech clip and
   music track (with loop points found by analysis). Whisper put names to the speech.
4. **Game logic.** Movement, shooting, collisions, pickups, the HUD and the room flow were
   written fresh in TypeScript, at a fixed 60 Hz step.
5. **World maps.** Tables in the ROM give each world's grid of arenas and the corridors
   between them, so the branching routes, `$` rooms and world 3's gauntlet are the
   original's, along with the map screens.
6. **Bosses.** A MAME bot plays the original with its lives pinned, walks the room graph to
   each boss and records every blitter command during the fight. Mutoid Man, Scarface,
   Cobra Death and the host were rebuilt from those recordings: how their mirrored parts
   fit together, their attacks and their damage states.
7. **Waves.** Following the code that spawns grunts led to the room director and its
   per-room tables. Every room's waves come from the ROM: which enemy types, how many, when
   each wave starts, how often it spawns, how many may be alive at once, grunt speed tiers,
   squads through a door, and when the exits open.
8. **Behaviour.** A second recorder logs every game process and its object (position,
   velocity, image) every frame while the bot plays all three worlds. That identified each
   wave type's enemy and measured how it behaves, which corrected a lot of guesswork:
   - the arcade runs at **54.7 Hz**, not 60, so every speed and timer from the ROM is
     converted at that rate;
   - grunts commit to a heading for ~0.8s (often several seconds) instead of homing in
     every frame, and some wait in the doorway first;
   - Mr. Shrapnel wanders, turns slowly towards the player, and only bursts into a fan of
     shrapnel when lined up (velocity tables read from the ROM);
   - tanks sit still most of the time and drive in short bursts;
   - the player's gun fires every 8 frames at 10 px/frame;
   - the continue screen plays "No way!" and its sting, from a log of sound commands.

**Still approximate:** some enemy details (how often wall guns and tanks fire, the orb
swarm's exact motion), power-up durations, scoring, and boss timings and hit points. Only
one player is supported.

## Building it yourself

You need your own copy of the *Smash T.V.* arcade ROM set (`smashtv.zip`, as used by MAME).
The extracted data is derived from the copyrighted ROMs, so it is not in this repository.

```sh
npm install
npm run extract -- /path/to/smashtv.zip    # graphics, arenas, maps and waves
tools/record-audio.sh /path/to/rom-dir      # sound: needs mame, ffmpeg and uv (optional)
npm run dev                                 # http://localhost:5173 (also on your LAN)
npm run build                               # static site in dist/
```

The extracted data lands in `public/assets/` (git-ignored). Python tooling runs through
[uv](https://docs.astral.sh/uv/).

## Technical notes

The hardware is the Williams Y-unit: a TMS34010 CPU (bit-addressed) and a DMA blitter.
Addresses below are TMS34010 bit addresses.

- **Graphics ROM**: three groups of chips (u111–113, u95–97, u106–108) each give 2 bits of
  a 6-bit pixel, four pixels per byte. Address = `(bitaddr − 0x02000000) >> 3`, rows padded
  to a multiple of 4 pixels.
- **Image headers** (program ROM): `w, h, xoff, yoff, gfx_addr, palette_ptr` (16 bytes), or
  12 bytes without the palette for the player parts, which use the fixed system palette at
  `FFFC6160`. Sprites are drawn at `left = x − xoff`, `top = y − yoff`, mirrored as
  `x − (w − 1 − xoff)`.
- **Palettes**: a u16 count followed by xRRRRRGGGGGBBBBB words.
- **Backgrounds**: room descriptors (`w, h, count, layout*, block_table*, palette_list*`).
  Layout records are `flags, x, y, block`. The palette is
  `list[(flags & 0xF) + 16·(block >> 12)]`, `0x10`/`0x20` are flips, `0x40` means
  transparent and the high byte is draw priority (room builder at `FFE0CD00`). The floor
  colour is the autoerase colour (palette entry 0x3D).
- **Animations / directions**: lists of header pointers, e.g. the grunt direction table at
  `FFE4DD00` and the player leg cycles at `FFE24A00`.
- **Fonts**: ASCII tables at `FFE64630` (two fonts, 93 glyphs each).
- **World maps**: `FFE72650` points at one list per world of `(room descriptor, x, y)`.
  Arenas sit on a ~472×332 grid; corridor pieces (`FFF6C720` horizontal, `FFF6C690`
  vertical, `FFF6C7B0` from the studio) say which rooms connect. RAM: current list
  `010DD4E0`, camera `01000240/260`, lives `01086360`.
- **Bosses**: each boss's parts share one anchor and are drawn as mirrored pairs. Cobra
  Death and Scarface mirror their right half 5 px left of the generic flip rule, the host's
  torso 1 px, and Mutoid Man's chassis not at all.
- **Rooms and waves**: rooms are numbered per world (RAM `010EB630`); the records at
  `FFECCE80[world]` give each room's exits, and so its grid cell. The room director
  (`FFE18150`) reads 6-word entries from `FFE13790[world]`:
  `[type, count, p1, interval, p2, delay]`, timed in 3-frame ticks. Types with an init
  routine (`FFE13380`) create `p2` at room start; each slot then counts its delay down and
  calls the type's spawn routine (`FFE13580`). Per-room byte tables cap how many of a kind
  may be alive (minus a margin for one player, plus a difficulty bonus: −1 at the default
  setting). Grunts walk at `0.5 + tier/8` px/frame (1/16 slower vertically, 0.8x on
  diagonals), and 14% of grunt spawns are a squad of 7–16 through one door. When a room's
  main wave is in, the game waits 120 frames, stops the other spawners, and opens the exits
  once the enemies are dead. `tools/waves.ts` decodes this into `worlds.json`.
- **Processes and objects**: the active process list is at `01000000` (process: `+0` link,
  `+20` id, `+C0` object) and the gameplay objects are in the lists at
  `01000040`/`01000060` (object: `+20/+40` velocity and `+60/+80` position, both 16.16,
  `+130` image header). Ids seen: grunt `EC`, tank `EF`, Mr. Shrapnel `F0`, saucer `EE`,
  crab `114`, wall gun `10A`, floor mine `100`, orbs `116`/`900`/`902`/`903`, snake `11C`.
- **Sound**: the main CPU writes `0xFD00|cmd` then `0xFF00|cmd` to `01E00000`. Commands
  `01–10` are music, `11–2E`/`60–7E` are volume, and the rest are effects and speech.

### Tools

- `tools/extract.ts`: builds `public/assets/` from the ROM zip (sprites, anims, rooms,
  worlds with waves).
- `tools/mame/sndrec.lua`, `tools/record-audio.sh`, `tools/cut-audio.ts`,
  `tools/music-loops.py`: the sound capture pipeline.
- `tools/mame/bossrun.lua`: plays to each boss and records the fights.
- `tools/mame/waverun.lua`: plays every reachable room and records processes and objects
  (`TRACK=1` for per-frame tracks); `PROBE=` loads one-off scripts such as
  `tools/explore/sndlog.lua`.
- `tools/explore/procs.ts`, `behaviour.ts`: summarise those recordings per enemy type.
- `tools/contact-sheet.ts`, `tools/replay.ts`, and the rest of `tools/explore/`: one-off ROM
  probes and viewers.
