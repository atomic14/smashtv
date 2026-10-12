# Find seamless loop points in recorded music tracks and trim them to one loop.
# usage: uv run --with numpy python tools/music-loops.py public/assets/audio
# Updates audio.json with loopStart/loopEnd (seconds, in the trimmed file's timeline).
import sys, subprocess, json, os, numpy as np

D = sys.argv[1]
SR = 22050
index = json.load(open(f'{D}/audio.json'))

def decode(path, sr=SR):
    raw = subprocess.run(['ffmpeg', '-loglevel', 'error', '-i', path, '-ac', '1', '-ar', str(sr), '-f', 's16le', '-'], capture_output=True).stdout
    return np.frombuffer(raw, dtype=np.int16).astype(np.float32)

def period(x, sr):
    """Coarse loop period from self-similarity of short-time spectra."""
    hop = sr // 20
    n = len(x) // hop - 1
    fr = np.stack([np.log1p(np.abs(np.fft.rfft(x[i * hop:i * hop + 2 * hop] * np.hanning(2 * hop)))) for i in range(n)])
    fr -= fr.mean(1, keepdims=True)
    best = (0, -1.0)
    for lag in range(160, n - 200):
        a, b = fr[:n - lag][-600:], fr[lag:][-600:]
        c = float((a * b).sum() / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-9))
        if c > best[1]:
            best = (lag, c)
    return best[0] * hop / sr, best[1]

for cid, clip in index.items():
    if not clip.get('music') or clip['dur'] < 60:
        continue
    path = f"{D}/{clip['file']}"
    x = decode(path)
    p, score = period(x, SR)
    if score < 0.6:
        print(cid, 'no clear loop', score)
        continue
    # refine: match the last 4s before `end` against the same span one period earlier
    end = int((len(x) / SR - 3) * SR)
    win = 4 * SR
    ref = x[end - win:end]
    best = (0, -1.0)
    for lag in range(int((p - 0.15) * SR), int((p + 0.15) * SR)):
        seg = x[end - win - lag:end - lag]
        c = float(np.dot(seg, ref) / (np.linalg.norm(seg) * np.linalg.norm(ref) + 1e-9))
        if c > best[1]:
            best = (lag, c)
    lag = best[0]
    loop_end = end / SR
    loop_start = loop_end - lag / SR
    # keep one loop (plus the intro) and a little tail
    keep = loop_end + 0.5
    tmp = path + '.tmp.mp3'
    subprocess.run(['ffmpeg', '-loglevel', 'error', '-y', '-i', path, '-t', f'{keep:.3f}', '-c:a', 'libmp3lame', '-b:a', '96k', tmp], check=True)
    os.replace(tmp, path)
    clip.update(loopStart=round(loop_start, 4), loopEnd=round(loop_end, 4), dur=round(keep, 2))
    print(cid, f'period {lag / SR:.3f}s corr {best[1]:.3f} loop {loop_start:.2f}-{loop_end:.2f}')

json.dump(index, open(f'{D}/audio.json', 'w'), indent=1)
