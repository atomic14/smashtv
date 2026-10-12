// Cut a MAME -wavwrite recording (made with tools/mame/sndrec.lua) into one clip per
// sound command, removing the DAC's DC offset and trimming silence.
// usage: tsx tools/cut-audio.ts <recording.wav> <commands.txt> <seconds-per-command> [music]
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';

const [wav, log, lenArg, kind = 'sfx'] = process.argv.slice(2);
const LEN = Number(lenArg);
const OUT = 'public/assets/audio';
mkdirSync(OUT, { recursive: true });
const indexPath = `${OUT}/audio.json`;
const index: Record<string, { file: string; dur: number; music?: boolean }> = existsSync(indexPath)
  ? JSON.parse(readFileSync(indexPath, 'utf8'))
  : {};

for (const line of readFileSync(log, 'utf8').trim().split('\n')) {
  const [cmd, t] = line.split(' ').map(Number);
  const id = cmd.toString(16).padStart(2, '0');
  const file = `s${id}.mp3`;
  // highpass removes the DC offset; silenceremove trims leading and trailing silence
  const filter = [
    'aformat=channel_layouts=mono',
    'highpass=f=20',
    'silenceremove=start_periods=1:start_threshold=-55dB',
    'areverse',
    'silenceremove=start_periods=1:start_threshold=-55dB',
    'areverse',
  ].join(',');
  execFileSync('ffmpeg', [
    '-loglevel', 'error', '-y', '-ss', String(t), '-t', String(LEN - 0.05), '-i', wav,
    '-af', filter, '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', kind === 'music' ? '128k' : '96k', `${OUT}/${file}`,
  ]);
  if (!existsSync(`${OUT}/${file}`) || statSync(`${OUT}/${file}`).size < 1000) {
    console.log(id, 'silent, skipped');
    continue;
  }
  const dur = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', `${OUT}/${file}`]).toString());
  index[id] = { file, dur: Math.round(dur * 100) / 100, ...(kind === 'music' ? { music: true } : {}) };
  console.log(id, index[id].dur);
}
writeFileSync(indexPath, JSON.stringify(index, null, 1));
