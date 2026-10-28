import { writePngMeta } from '@bitsori/core';

/** 캔버스 → 설정이 담긴 PNG Blob */
export async function canvasToPngBlob(canvas: HTMLCanvasElement, meta: object): Promise<Blob> {
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG를 만들지 못했어요.'))), 'image/png'));
  const bytes = writePngMeta(await blob.arrayBuffer(), meta);
  return new Blob([bytes as BlobPart], { type: 'image/png' });
}

export function download(blob: Blob, name: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

/** 파일 이름에서 확장자를 뗀 이름 */
export const baseName = (name: string, fallback = 'bitsori') => name.replace(/\.[^.]+$/, '') || fallback;
