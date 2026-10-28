import { defineConfig } from 'vite';
// @ts-expect-error — JS 플러그인 (타입 선언 없음)
import { bitsoriSamples } from '@bitsori/audio/vite-plugin';

export default defineConfig({
  base: './',
  plugins: [bitsoriSamples()],
  server: { port: 5173 },
});
