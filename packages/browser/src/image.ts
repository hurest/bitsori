import { readPngMeta, toSample, type BitsoriMeta, type PixelData, type Sample } from '@bitsori/core';

export interface LoadedImage {
  img: HTMLImageElement;
  name: string;
  /** PNG에 저장된 빛소리 설정 (없으면 null) */
  meta: Partial<BitsoriMeta> | null;
}

export async function loadImageFile(file: File | Blob, name = (file as File).name ?? 'image'): Promise<LoadedImage> {
  let meta: Partial<BitsoriMeta> | null = null;
  try {
    meta = readPngMeta(await file.arrayBuffer());
  } catch {
    /* 메타 없음 */
  }
  const img = new Image();
  img.src = URL.createObjectURL(file);
  await img.decode();
  return { img, name, meta };
}

export interface SampledImage {
  sample: Sample;
  /** 변환에 쓰는 크기 그대로의 캔버스 (화면 그리기·PNG 저장용) */
  canvas: HTMLCanvasElement;
}

/**
 * 이미지를 가로 targetWidth로 축소(비율 유지)해 변환용 픽셀을 만든다.
 * nearest: 확대 저장된 픽셀 아트를 정확한 배율로 되돌릴 때 색이 섞이지 않게 한다.
 */
export function sampleImage(
  source: CanvasImageSource, srcW: number, srcH: number, targetWidth: number, nearest = false,
): SampledImage {
  const width = Math.max(1, Math.min(srcW, Math.round(targetWidth)));
  const height = Math.max(1, Math.round((srcH * width) / srcW));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.imageSmoothingEnabled = !nearest;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, width, height);
  return { sample: toSample(ctx.getImageData(0, 0, width, height)), canvas };
}

/** 원본 크기 그대로의 픽셀 (확대 배율 감지용). 너무 크면 null. */
export function imagePixels(img: HTMLImageElement, maxPixels = 16e6): PixelData | null {
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (w * h > maxPixels) return null;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0);
  return ctx.getImageData(0, 0, w, h);
}

/** 픽셀 이미지를 cell배로 확대한 캔버스 (뭉개지지 않게) */
export function upscale(canvas: HTMLCanvasElement, cell: number): HTMLCanvasElement {
  const big = document.createElement('canvas');
  big.width = canvas.width * cell;
  big.height = canvas.height * cell;
  const ctx = big.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(canvas, 0, 0, big.width, big.height);
  return big;
}

export function pixelsToCanvas(pixels: PixelData): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = pixels.width;
  canvas.height = pixels.height;
  const data = new Uint8ClampedArray(pixels.data);
  canvas.getContext('2d')!.putImageData(new ImageData(data, pixels.width, pixels.height), 0, 0);
  return canvas;
}
