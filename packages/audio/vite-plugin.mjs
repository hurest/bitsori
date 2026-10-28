// 앱(웹·모바일)에서 피아노 샘플을 /samples/ 경로로 제공한다.
// 개발 서버에서는 이 패키지의 samples 폴더를 그대로 보여 주고, 빌드할 때 dist/samples로 복사한다.
import { cpSync, createReadStream, existsSync, statSync } from 'node:fs';
import { dirname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SAMPLES_DIR = join(dirname(fileURLToPath(import.meta.url)), 'samples');
const TYPES = { '.mp3': 'audio/mpeg', '.md': 'text/markdown; charset=utf-8' };

/** @returns {import('vite').Plugin} */
export function bitsoriSamples() {
  let outDir = 'dist';
  return {
    name: 'bitsori-samples',
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    configureServer(server) {
      server.middlewares.use('/samples', (req, res, next) => {
        const path = normalize(join(SAMPLES_DIR, decodeURIComponent((req.url ?? '/').split('?')[0])));
        if (!path.startsWith(SAMPLES_DIR) || !existsSync(path) || !statSync(path).isFile()) return next();
        const ext = path.slice(path.lastIndexOf('.'));
        res.setHeader('Content-Type', TYPES[ext] ?? 'application/octet-stream');
        createReadStream(path).pipe(res);
      });
    },
    closeBundle() {
      cpSync(SAMPLES_DIR, join(outDir, 'samples'), { recursive: true });
    },
  };
}
