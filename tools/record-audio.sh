#!/usr/bin/env bash
# Record every sound-board command from the original game using MAME, then cut the
# recording into clips in public/assets/audio (requires mame, ffmpeg and uv).
# usage: tools/record-audio.sh /path/to/dir-containing-smashtv.zip
set -euo pipefail
ROMDIR="${1:?usage: tools/record-audio.sh <rom directory>}"
HERE="$(cd "$(dirname "$0")" && pwd)"
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# Sound commands found by sweeping 0x01-0xff (0x11-0x2e and 0x60-0x7e are volume/control).
SFX="2f 30 31 32 33 34 35 36 37 38 39 3a 3b 3c 3d 3e 3f 4f 50 51 52 53 54 55 56 57 58 59 5a 7f 80 81 82 83 84 85 86 87 89 8a 8b 8c 8d 8e 8f 90 91 92 93 94 95 96 97 98 99 9a 9b 9c 9d 9e 9f a0 a1 a2 a3 a4 a5 a6 a7 a8 a9 aa ab ac ad ae af b0 b1 b2 b3 b4 b5 b6 bf c0 c1 c2 c3 c4 c5 c6 c7 c8 c9 ca cb cc cd ce cf "
MUSIC="01 02 03 04 05 06 07 08 09 0a 0b 0c 0d 0e 0f 10"

record() { # name, commands, seconds per command
  OUT="$WORK/$1.txt" CMDS="$2" LEN="$3" mame smashtv -rompath "$ROMDIR" -video none -nothrottle \
    -wavwrite "$WORK/$1.wav" -autoboot_script "$HERE/mame/sndrec.lua" >/dev/null 2>&1
}
record sfx "$SFX" 10 &
record music "$MUSIC" 150 &
wait

rm -f public/assets/audio/audio.json
npx tsx "$HERE/cut-audio.ts" "$WORK/sfx.wav" "$WORK/sfx.txt" 10
npx tsx "$HERE/cut-audio.ts" "$WORK/music.wav" "$WORK/music.txt" 150 music
uv run --with numpy python "$HERE/music-loops.py" public/assets/audio
