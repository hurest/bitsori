/** RGBA 픽셀 배열. 브라우저의 ImageData와 같은 모양이라 그대로 넘길 수 있다. */
export interface PixelData {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

/** 변환에 쓰는 이미지: 픽셀 + 픽셀별 밝기(0~255, 투명은 -1) */
export interface Sample extends PixelData {
  brightness: Int16Array;
}

export const luminance = (r: number, g: number, b: number) => 0.299 * r + 0.587 * g + 0.114 * b;

export function toSample(pixels: PixelData): Sample {
  const { data } = pixels;
  const brightness = new Int16Array(pixels.width * pixels.height);
  for (let i = 0, p = 0; i < brightness.length; i++, p += 4) {
    brightness[i] = data[p + 3] < 128 ? -1 : Math.round(luminance(data[p], data[p + 1], data[p + 2]));
  }
  // ImageData의 width·height·data는 프로토타입 getter라 펼침(...)으로 복사되지 않는다 — 하나씩 옮긴다
  return { width: pixels.width, height: pixels.height, data, brightness };
}

/**
 * 메타정보가 없을 때: 같은 색이 N×N 블록으로 반복되는 확대 픽셀 아트인지 추정한다.
 * 행·열마다 같은 색이 이어지는 길이들의 최대공약수가 배율이다. 사진이면 곧바로 1이 나온다.
 */
export function detectCellSize({ width: w, height: h, data }: PixelData): number {
  if (w < 4 || h < 4) return 1;
  const px = new Uint32Array(data.buffer, data.byteOffset, w * h);
  const gcd = (a: number, b: number): number => {
    while (b) [a, b] = [b, a % b];
    return a;
  };

  let g = 0;
  const scan = (count: number, len: number, at: (line: number, i: number) => number) => {
    const lines = Math.min(count, 48);
    for (let i = 0; i < lines; i++) {
      const line = Math.floor((i * count) / lines);
      let run = 1;
      for (let j = 1; j < len; j++) {
        if (at(line, j) === at(line, j - 1)) {
          run++;
          continue;
        }
        g = gcd(g, run);
        if (g === 1) return false;
        run = 1;
      }
      g = gcd(g, run);
      if (g === 1) return false;
    }
    return true;
  };
  if (!scan(h, w, (y, x) => px[y * w + x])) return 1;
  if (!scan(w, h, (x, y) => px[y * w + x])) return 1;
  if (g < 2 || g > 64 || w % g || h % g) return 1;
  return g;
}
