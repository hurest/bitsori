import { toSample, type PixelData, type Sample } from '../src';

/** 회색조 밝기 배열 → Sample */
export function graySample(width: number, height: number, values: ArrayLike<number>): Sample {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) data.set([values[i], values[i], values[i], 255], i * 4);
  return toSample({ width, height, data });
}

/** 재현 가능한 의사 난수 이미지: 긴 음(같은 값 연속)과 쉼표(어두운 칸)가 섞이도록 */
export function fakeImage(width: number, height: number, seed: number): PixelData {
  let x = seed;
  const rnd = () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648;
  const data = new Uint8ClampedArray(width * height * 4);
  let prev = 128;
  for (let i = 0; i < width * height; i++) {
    const r = rnd();
    const v = r < 0.15 ? 5 : i % 3 === 0 ? Math.floor(rnd() * 256) : prev;
    prev = v;
    // 색을 섞어 두되 밝기는 v 근처가 되도록
    data.set([Math.min(255, v + 20), v, Math.max(0, v - 30), 255], i * 4);
  }
  return { width, height, data };
}

/** 악보 비교용 문자열: 칸:줄:음:길이 */
export function scoreDigest(score: { starts: ({ voice: number; midi: number; dur: number }[] | undefined)[] }) {
  const out: string[] = [];
  score.starts.forEach((ev, s) => ev?.forEach((e) => out.push(`${s}:${e.voice}:${e.midi}:${e.dur}`)));
  return out.sort().join(',');
}
