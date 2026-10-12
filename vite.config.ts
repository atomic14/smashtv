import { defineConfig } from 'vite';

export default defineConfig({
  base: './',
  server: { host: true },
  // public/assets holds the extracted game data, so keep Vite's own output separate
  build: { assetsDir: 'build' },
});
