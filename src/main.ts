import './style.css';
import { loadAssets } from './assets';
import { initGfx, W, H, ctx, drawText } from './gfx';
import { input } from './input';
import { audio } from './audio';
import { Game } from './game/game';
import { DT } from './game/world';
import { TITLE_ROOM, STUDIO_ROOM } from './game/levels';

const canvas = document.getElementById('screen') as HTMLCanvasElement;
initGfx(canvas);

/** Scale the 400x256 screen to fit; in portrait leave room underneath for the thumbsticks. */
function layout() {
  const vw = innerWidth, vh = innerHeight;
  const portrait = vh > vw;
  const availH = portrait && document.body.classList.contains('touch') ? vh * 0.62 : vh;
  const scale = Math.min(vw / W, availH / H);
  // integer scaling when it fits comfortably, smooth fit otherwise
  const s = scale >= 2 ? Math.floor(scale) : scale;
  canvas.style.width = `${Math.floor(W * s)}px`;
  canvas.style.height = `${Math.floor(H * s)}px`;
  const app = document.getElementById('app')!;
  app.style.justifyContent = portrait && document.body.classList.contains('touch') ? 'flex-start' : 'center';
  app.style.paddingTop = portrait ? `max(env(safe-area-inset-top), ${Math.round(vh * 0.06)}px)` : '0';
}
addEventListener('resize', layout);
new MutationObserver(layout).observe(document.body, { attributes: true, attributeFilter: ['class'] });
layout();

async function boot() {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  input.init();
  void audio.init();
  await loadAssets([TITLE_ROOM, STUDIO_ROOM]);
  const game = new Game();
  (window as unknown as { game: Game }).game = game;

  let last = performance.now();
  let acc = 0;
  const frame = (now: number) => {
    acc += Math.min(0.1, (now - last) / 1000);
    last = now;
    while (acc >= DT) {
      input.poll();
      game.update();
      acc -= DT;
    }
    game.draw();
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);

  addEventListener('keydown', (e) => {
    if (e.code === 'KeyM') audio.toggleMute();
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && game.state === 'play') game.paused = true;
  });
}

boot().catch((err) => {
  console.error(err);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#f44';
  ctx.font = '10px monospace';
  ctx.fillText(String(err.message ?? err), 8, 20);
  ctx.fillText('Run: npm run extract -- /path/to/smashtv.zip', 8, 36);
  void drawText;
});
