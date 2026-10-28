import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';
// @ts-expect-error — JS 플러그인 (타입 선언 없음)
import { bitsoriSamples } from '@bitsori/audio/vite-plugin';

// 휴대폰 브라우저에서 카메라를 쓰려면 https가 필요하다 → 개발 서버는 자체 서명 인증서로 띄운다
export default defineConfig({
  base: './',
  plugins: [bitsoriSamples(), basicSsl()],
  server: { port: 5174 },
});
