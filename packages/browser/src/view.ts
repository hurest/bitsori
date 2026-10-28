import type { Score } from '@bitsori/core';

export interface DrawOptions {
  /** 변환 크기 그대로의 이미지 */
  image: CanvasImageSource;
  score: Score | null;
  /** 1칸 = scale 픽셀 */
  scale: number;
  /** 표시할 재생 위치 (없으면 이미지만) */
  step?: number | null;
  /** 쉼표 위치 오버레이 (buildRestOverlay 결과) */
  restOverlay?: HTMLCanvasElement | null;
}

/** 이미지 + 지금 연주 중인 줄 묶음·칸 표시 */
export function drawScoreView(ctx: CanvasRenderingContext2D, o: DrawOptions) {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, W, H);
  ctx.drawImage(o.image, 0, 0, W, H);
  if (o.restOverlay) {
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(o.restOverlay, 0, 0, W, H);
    ctx.imageSmoothingEnabled = false;
  }
  const { score, scale: s, step } = o;
  if (step == null || !score) return;

  const vertical = score.direction === 'vertical';
  const g = Math.floor(step / score.length);
  const pos = step % score.length;
  const bandStart = g * score.chord * s;
  const bandSize = Math.min(score.chord, score.lineCount - g * score.chord) * s;
  const line = Math.max(2, Math.round(Math.max(W, H) / 320));
  const cursor = Math.max(s, line * 2);
  const cursorStart = pos * s + s / 2 - cursor / 2;

  // 가로 방향 좌표(진행 방향, 묶음 방향)로 계산한 사각형을 세로 방향이면 뒤집어 그린다
  const rect = (fn: (x: number, y: number, w: number, h: number) => void, along: number, alongSize: number, across: number, acrossSize: number) =>
    vertical ? fn(across, along, acrossSize, alongSize) : fn(along, across, alongSize, acrossSize);
  const fill = (a: number, b: number, c: number, d: number) => rect(ctx.fillRect.bind(ctx), a, b, c, d);
  const stroke = (a: number, b: number, c: number, d: number) => rect(ctx.strokeRect.bind(ctx), a, b, c, d);
  const alongTotal = vertical ? H : W;
  const acrossTotal = vertical ? W : H;

  ctx.fillStyle = 'rgba(10, 8, 20, 0.55)';
  fill(0, alongTotal, 0, bandStart);
  fill(0, alongTotal, bandStart + bandSize, acrossTotal - bandStart - bandSize);

  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.lineWidth = line;
  stroke(line / 2, alongTotal - line, bandStart + line / 2, Math.max(1, bandSize - line));

  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
  fill(cursorStart, cursor, bandStart, bandSize);
  ctx.strokeStyle = '#ffffff';
  stroke(cursorStart, cursor, bandStart, bandSize);
}

/** 쉼표 픽셀마다 사선 무늬를 그린 오버레이 (악보가 바뀔 때만 다시 만든다) */
export function buildRestOverlay(score: Score, scale: number, reuse?: HTMLCanvasElement | null): HTMLCanvasElement {
  const { width: w, height: h, restMask } = score;
  const cell = Math.max(4, Math.min(scale, 24));
  const c = reuse ?? document.createElement('canvas');
  c.width = w * cell;
  c.height = h * cell;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.fillStyle = 'rgba(255, 0, 110, 0.45)';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.lineWidth = Math.max(1, cell / 8);
  ctx.beginPath();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!restMask[y * w + x]) continue;
      ctx.fillRect(x * cell, y * cell, cell, cell);
      ctx.moveTo(x * cell, y * cell + cell);
      ctx.lineTo(x * cell + cell, y * cell);
    }
  }
  ctx.stroke();
  return c;
}

/** 화면에 보기 좋은 확대 배율 */
export const viewScale = (w: number, h: number, maxW = 960, maxH = 1400) =>
  Math.max(1, Math.floor(Math.min(maxW / w, maxH / h)));

/** 캔버스 클릭 위치 → 재생 칸 */
export function stepAtPoint(canvas: HTMLCanvasElement, score: Score, clientX: number, clientY: number): { x: number; y: number; step: number } {
  const rect = canvas.getBoundingClientRect();
  const x = Math.max(0, Math.min(score.width - 1, Math.floor(((clientX - rect.left) / rect.width) * score.width)));
  const y = Math.max(0, Math.min(score.height - 1, Math.floor(((clientY - rect.top) / rect.height) * score.height)));
  const step = score.direction === 'vertical'
    ? Math.floor(x / score.chord) * score.length + y
    : Math.floor(y / score.chord) * score.length + x;
  return { x, y, step };
}
