// 사진 분석: 같은 필터라도 사진마다 다른 노래가 되도록, 노래의 뼈대를 사진에서 읽는다.
import { MAX_BPM, MIN_BPM } from './constants';
import type { FilterDef, Mode } from './filters';
import type { Sample } from './pixels';

export interface PhotoFeatures {
  /** 채도로 가중한 평균 색상(0~360). 거의 무채색이면 null */
  hue: number | null;
  /** 평균 채도 0~1 */
  saturation: number;
  /** 평균 밝기 0~1 */
  brightness: number;
  /** 따뜻함 -1(파랑) ~ 1(빨강) */
  warmth: number;
  /** 복잡함 0~1 (이웃 픽셀 밝기 차이) */
  busy: number;
}

/** RGB → HSV의 색상(0~360)과 채도(0~1) */
export function hueSat(r: number, g: number, b: number): [number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  if (max === 0 || d === 0) return [0, 0];
  let h: number;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [(h * 60 + 360) % 360, d / max];
}

export function analyzePhoto(sample: Sample): PhotoFeatures {
  const { width: w, height: h, data, brightness } = sample;
  let n = 0;
  let sat = 0;
  let lum = 0;
  let warm = 0;
  let hx = 0;
  let hy = 0;
  let diff = 0;
  let diffN = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const b = brightness[i];
      if (b < 0) continue;
      const p = i * 4;
      const [hue, s] = hueSat(data[p], data[p + 1], data[p + 2]);
      n++;
      sat += s;
      lum += b;
      warm += (data[p] - data[p + 2]) / 255;
      const rad = (hue * Math.PI) / 180;
      hx += Math.cos(rad) * s;
      hy += Math.sin(rad) * s;
      if (x + 1 < w && brightness[i + 1] >= 0) {
        diff += Math.abs(brightness[i + 1] - b);
        diffN++;
      }
    }
  }
  if (!n) return { hue: null, saturation: 0, brightness: 0, warmth: 0, busy: 0 };
  const strength = Math.hypot(hx, hy) / n;
  return {
    hue: strength < 0.06 ? null : ((Math.atan2(hy, hx) * 180) / Math.PI + 360) % 360,
    saturation: sat / n,
    brightness: lum / n / 255,
    warmth: warm / n,
    busy: diffN ? Math.min(1, diff / diffN / 40) : 0,
  };
}

/**
 * 조(으뜸음): 주된 색을 5도권에 대응시킨다 — 색상환에서 가까운 색은 가까운 조가 된다.
 * 빨강=C, 주황=G, 노랑=D, 연두=A, 초록=E, … 무채색이면 C.
 */
export function keyFromPhoto(f: PhotoFeatures): number {
  if (f.hue === null) return 0;
  const step = Math.round(f.hue / 30) % 12;
  return (step * 7) % 12;
}

/** 장조/단조: 밝고 따뜻하면 장조, 어둡거나 차가우면 단조. 필터가 정해 두었으면 그대로. */
export function modeFromPhoto(f: PhotoFeatures, filter: FilterDef): Mode {
  if (filter.mode !== 'auto') return filter.mode;
  return (f.brightness - 0.42) + f.warmth * 0.35 >= 0 ? 'major' : 'minor';
}

/** 빠르기: 필터 기준 빠르기를 사진의 복잡함에 따라 ±15% */
export function tempoFromPhoto(baseBpm: number, f: PhotoFeatures): number {
  return Math.max(MIN_BPM, Math.min(MAX_BPM, Math.round(baseBpm * (0.85 + 0.3 * f.busy))));
}

/** 음 세기: 선명한 색은 크게, 탁한 색은 작게 (0.45 ~ 0.85) */
export const velocityFromSaturation = (s: number) => 0.45 + 0.4 * s;
