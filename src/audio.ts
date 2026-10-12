// Sound playback for clips recorded from the original sound board (see tools/cut-audio.ts).
// Clips are named by the sound command byte the game sent to the board.

interface Clip {
  file: string;
  dur: number;
  music?: boolean;
  loopStart?: number;
  loopEnd?: number;
}

/** Sound commands, as sent by the original game code. */
export const SND = {
  gun: '9a',
  splat: 'c4',
  hit: 'c2',
  coin: '50',
  start: '58',
  playerDie: 'c9',
  pickup: '80',
  prize: '83',
  explode: 'cb',
  door: '7f',
  tick: 'c5',
  rocket: 'b0',
  // speech
  buyThat: '32',
  bigMoney: '51',
  bigPrizes: '52',
  goodLuck: '53',
  carnage: '56',
  loveIt: '57',
  letsGo: '58',
  needIt: '5a',
  bingo: '50',
  noWay: '3f',
  byeBye: '3e',
  yeah: '30',
  tenSeconds: '59',
} as const;

const BASE = `${import.meta.env.BASE_URL}assets/audio/`;

class Audio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private sfxGain!: GainNode;
  private musicGain!: GainNode;
  private clips: Record<string, Clip> = {};
  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  private playing = new Map<string, AudioBufferSourceNode>();
  private music: { id: string; src: AudioBufferSourceNode } | null = null;
  private wantMusic: string | null = null;
  muted = false;

  async init() {
    try {
      const r = await fetch(BASE + 'audio.json');
      if (r.ok) this.clips = await r.json();
    } catch {
      // audio is optional
    }
    const unlock = () => {
      this.ensureContext();
      void this.ctx?.resume();
    };
    for (const ev of ['pointerdown', 'touchend', 'keydown']) addEventListener(ev, unlock, { passive: true });
  }

  private ensureContext() {
    if (this.ctx) return;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    this.ctx = new Ctor();
    this.master = this.ctx.createGain();
    this.master.connect(this.ctx.destination);
    this.sfxGain = this.ctx.createGain();
    this.sfxGain.gain.value = 0.8;
    this.sfxGain.connect(this.master);
    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 0.55;
    this.musicGain.connect(this.master);
    // preload the most common effects
    for (const id of [SND.gun, SND.splat, SND.hit, SND.pickup]) void this.load(id);
    if (this.wantMusic) this.playMusic(this.wantMusic);
  }

  private load(id: string): Promise<AudioBuffer | null> {
    let p = this.buffers.get(id);
    if (!p) {
      const clip = this.clips[id];
      p = clip && this.ctx
        ? fetch(BASE + clip.file)
            .then((r) => r.arrayBuffer())
            .then((b) => this.ctx!.decodeAudioData(b))
            .catch(() => null)
        : Promise.resolve(null);
      this.buffers.set(id, p);
    }
    return p;
  }

  /** Play a clip; by default a new instance of the same clip cuts off the previous one. */
  play(id: string, opts: { volume?: number; overlap?: boolean } = {}) {
    if (this.muted || !this.ctx || !this.clips[id]) return;
    void this.load(id).then((buf) => {
      if (!buf || !this.ctx) return;
      if (!opts.overlap) this.playing.get(id)?.stop();
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      let node: AudioNode = src;
      if (opts.volume !== undefined) {
        const g = this.ctx.createGain();
        g.gain.value = opts.volume;
        src.connect(g);
        node = g;
      }
      node.connect(this.sfxGain);
      src.start();
      this.playing.set(id, src);
      src.onended = () => {
        if (this.playing.get(id) === src) this.playing.delete(id);
      };
    });
  }

  playMusic(id: string | null) {
    this.wantMusic = id;
    if (!this.ctx) return;
    if (this.music?.id === id) return;
    this.music?.src.stop();
    this.music = null;
    if (!id || !this.clips[id]) return;
    void this.load(id).then((buf) => {
      if (!buf || !this.ctx || this.wantMusic !== id || this.music) return;
      const src = this.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const clip = this.clips[id];
      if (clip.loopStart !== undefined) {
        src.loopStart = clip.loopStart;
        src.loopEnd = clip.loopEnd ?? buf.duration;
      }
      src.connect(this.musicGain);
      src.start();
      this.music = { id, src };
    });
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.ctx) this.master.gain.value = this.muted ? 0 : 1;
  }
}

export const audio = new Audio();
