// MIDI → 이미지의 "장면 색칠": 노래는 그대로 두고 그림처럼 보이게 칠한다.
// 이미지 → 노래 변환은 밝기만 읽는다. 그래서 각 픽셀의 밝기를 음이 정한 칸 안에 두기만 하면
// 색상·채도는 마음대로 칠해도 같은 노래가 난다. 색상·채도·명암 결은 무작위로 만든 풍경 장면에서 가져온다.
import { luminance } from './pixels';

export interface SceneDef {
  id: string;
  label: string;
  emoji: string;
}

export const SCENES: SceneDef[] = [
  { id: 'sunset', label: '노을', emoji: '🌅' },
  { id: 'ocean', label: '바다', emoji: '🌊' },
  { id: 'forest', label: '숲', emoji: '🌲' },
  { id: 'aurora', label: '오로라', emoji: '🌌' },
  { id: 'pastel', label: '파스텔', emoji: '🫧' },
  { id: 'desert', label: '사막', emoji: '🏜️' },
  { id: 'neon', label: '네온', emoji: '🌃' },
  { id: 'blossom', label: '벚꽃', emoji: '🌸' },
];

/** 장면의 한 점: 색상(0~360), 채도(0~1), 명암 결(0~1) */
type Paint = [hue: number, sat: number, shade: number];
type Painter = (u: number, v: number) => Paint;

// ---------- 난수·잡음 ----------
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 부드러운 2D 값 잡음 (0~1), 여러 겹 */
function makeNoise(rand: () => number) {
  const size = 64;
  const grid = Float64Array.from({ length: size * size }, () => rand());
  const at = (x: number, y: number) => grid[(((y % size) + size) % size) * size + (((x % size) + size) % size)];
  const smooth = (t: number) => t * t * (3 - 2 * t);
  const one = (x: number, y: number) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const sx = smooth(x - x0);
    const sy = smooth(y - y0);
    const top = at(x0, y0) * (1 - sx) + at(x0 + 1, y0) * sx;
    const bottom = at(x0, y0 + 1) * (1 - sx) + at(x0 + 1, y0 + 1) * sx;
    return top * (1 - sy) + bottom * sy;
  };
  return (u: number, v: number, scale = 4) =>
    (one(u * scale, v * scale) * 0.6 + one(u * scale * 2, v * scale * 2) * 0.28 + one(u * scale * 4, v * scale * 4) * 0.12);
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const lerpHue = (a: number, b: number, t: number) => {
  const d = ((b - a + 540) % 360) - 180;
  return (a + d * t + 360) % 360;
};
const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

// ---------- 장면 ----------
function painter(id: string, rand: () => number): Painter {
  const noise = makeNoise(rand);
  const r = (a: number, b: number) => lerp(a, b, rand());
  switch (id) {
    case 'sunset': {
      const shift = r(-15, 15);
      const sx = r(0.2, 0.8);
      const sy = r(0.45, 0.7);
      const sr = r(0.08, 0.16);
      return (u, v) => {
        const n = noise(u, v, 3);
        const d = Math.hypot((u - sx) * 1.2, v - sy);
        if (d < sr) return [48 + shift / 3, 0.9, 0.85];
        const sky = v < 0.5 ? lerpHue(275 + shift, 335 + shift, v * 2) : lerpHue(335 + shift, 28 + shift, (v - 0.5) * 2);
        const glow = clamp01(1 - (d - sr) * 2.5);
        return [lerpHue(sky, 40, glow * 0.5) + (n - 0.5) * 18, 0.55 + 0.35 * glow + (n - 0.5) * 0.2, clamp01(0.3 + n * 0.5 + glow * 0.3)];
      };
    }
    case 'ocean': {
      const horizon = r(0.2, 0.45);
      const freq = r(8, 16);
      const base = r(190, 215);
      return (u, v) => {
        const n = noise(u, v, 5);
        if (v < horizon) return [base - 10 + n * 20, 0.35 + n * 0.25, 0.6 + n * 0.3];
        const wave = Math.sin(u * freq + v * freq * 2.5 + n * 4) * 0.5 + 0.5;
        return [base + 10 + wave * 20 - (v - horizon) * 30, 0.6 + wave * 0.3, clamp01(0.25 + wave * 0.5 + n * 0.2)];
      };
    }
    case 'forest': {
      const trunks = Array.from({ length: Math.floor(r(4, 9)) }, () => [rand(), r(0.015, 0.04)]);
      const base = r(95, 140);
      return (u, v) => {
        const n = noise(u, v, 6);
        if (trunks.some(([x, w]) => Math.abs(u - x) < w) && v > 0.35) return [25 + n * 15, 0.55, 0.2 + n * 0.3];
        const light = clamp01(1 - v * 1.1 + (n - 0.5) * 0.6);
        return [base + (n - 0.5) * 50, 0.45 + n * 0.4, light];
      };
    }
    case 'aurora': {
      const bands = Array.from({ length: 3 }, () => ({ y: r(0.15, 0.6), a: r(0.05, 0.15), f: r(2, 6), p: r(0, 6.28), h: r(120, 170) }));
      return (u, v) => {
        const n = noise(u, v, 3);
        let glow = 0;
        let hue = 235 + (n - 0.5) * 30;
        for (const b of bands) {
          const g = Math.exp(-(((v - (b.y + b.a * Math.sin(u * b.f + b.p))) / 0.07) ** 2));
          if (g > glow) {
            glow = g;
            hue = lerpHue(b.h, b.h + 130, clamp01(u + (n - 0.5) * 0.4));
          }
        }
        return [lerpHue(235, hue, glow), 0.5 + glow * 0.45, clamp01(0.15 + glow * 0.7 + n * 0.15)];
      };
    }
    case 'pastel': {
      const blobs = Array.from({ length: Math.floor(r(5, 10)) }, () => ({ x: rand(), y: rand(), h: rand() * 360 }));
      return (u, v) => {
        const n = noise(u, v, 4);
        let hx = 0;
        let hy = 0;
        for (const b of blobs) {
          const w = 1 / ((u - b.x) ** 2 + (v - b.y) ** 2 + 0.01) ** 1.5;
          hx += Math.cos((b.h * Math.PI) / 180) * w;
          hy += Math.sin((b.h * Math.PI) / 180) * w;
        }
        const hue = ((Math.atan2(hy, hx) * 180) / Math.PI + 360) % 360;
        return [hue, 0.3 + n * 0.2, 0.55 + n * 0.4];
      };
    }
    case 'desert': {
      const horizon = r(0.25, 0.45);
      const dunes = r(3, 7);
      const phase = r(0, 6.28);
      return (u, v) => {
        const n = noise(u, v, 4);
        if (v < horizon) return [205 + n * 15, 0.3 + (horizon - v) * 0.8, 0.7 + n * 0.25];
        const ridge = Math.sin(u * dunes + phase + v * 6) * 0.5 + 0.5;
        return [lerp(18, 42, ridge) + (n - 0.5) * 10, 0.55 + ridge * 0.3, clamp01(0.3 + ridge * 0.5 + n * 0.2)];
      };
    }
    case 'neon': {
      const angle = r(0.4, 1.2);
      const freq = r(10, 22);
      const [h1, h2] = rand() < 0.5 ? [305, 185] : [275, 160];
      return (u, v) => {
        const n = noise(u, v, 5);
        const s = Math.sin((u * Math.cos(angle) + v * Math.sin(angle)) * freq + n * 3) * 0.5 + 0.5;
        return [lerpHue(h1, h2, s), 0.85 + n * 0.15, clamp01(s * 0.8 + n * 0.2)];
      };
    }
    default: { // blossom
      const branch = r(0.3, 0.7);
      return (u, v) => {
        const n = noise(u, v, 7);
        if (Math.abs(v - (branch + Math.sin(u * 5) * 0.08)) < 0.025 + n * 0.02) return [20, 0.45, 0.2];
        return [lerpHue(335, 355, n) + (u - 0.5) * 20, 0.3 + n * 0.35, 0.5 + n * 0.5];
      };
    }
  }
}

// ---------- 밝기를 지키며 칠하기 ----------
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

/** 색상·채도는 그대로 두고, 밝기(luminance)가 target이 되는 RGB (HSL 명도를 이분 탐색) */
export function colorWithLuminance(hue: number, sat: number, target: number): [number, number, number] {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 22; i++) {
    const mid = (lo + hi) / 2;
    const [r, g, b] = hslToRgb(hue, sat, mid);
    if (luminance(r, g, b) < target) lo = mid;
    else hi = mid;
  }
  const [r, g, b] = hslToRgb(hue, sat, (lo + hi) / 2);
  return [Math.round(r), Math.round(g), Math.round(b)];
}

export interface SceneColorizer {
  /** 음 칸: 반올림 후 밝기가 [lo, hi) 안이고, 쉼표 색들과는 확실히 다른 색 */
  note(x: number, y: number, lo: number, hi: number): [number, number, number];
  /** 쉼표 칸: 쉼표 색이 있으면 그 근처 색, 없으면 restThreshold보다 어두운 장면 색 */
  rest(x: number, y: number): [number, number, number];
  /** 쉼표 색 (restStyle이 'color'일 때). 메타정보에 저장해야 다시 열어도 쉼표로 읽힌다 */
  restColors: { r: number; g: number; b: number }[];
}

export interface SceneOptions {
  /** dark: 쉼표는 아주 어두운 장면 색 (메타정보 없이도 쉼표) / color: 쉼표도 장면 색 (메타정보의 쉼표 색 필요) */
  restStyle: 'dark' | 'color';
  restThreshold: number;
  /** restStyle이 'color'일 때 쉼표 색 허용 범위 (%) — 이미지 → 노래 변환과 같은 값을 써야 한다 */
  colorTolerance?: number;
}

/** 쉼표 색 허용 범위(%)의 기준 거리 — score.ts의 값과 같아야 한다 */
const RGB_DIAGONAL = Math.sqrt(3 * 255 * 255);

/**
 * 장면 색칠 함수. 이미지 → 노래 변환이 같은 음·같은 쉼표로 읽도록 색을 고른다.
 */
export function sceneColorizer(sceneId: string, seed: number, width: number, height: number, o: SceneOptions): SceneColorizer {
  const rand = mulberry32(seed);
  const paint = painter(sceneId, rand);
  const at = (x: number, y: number) => {
    const [h, s, shade] = paint((x + 0.5) / width, (y + 0.5) / height);
    return { hue: ((h % 360) + 360) % 360, sat: clamp01(s), shade: clamp01(shade) };
  };
  const brightnessOf = (c: number[]) => Math.round(luminance(c[0], c[1], c[2]));
  const dist = (a: number[], b: { r: number; g: number; b: number }) => Math.hypot(a[0] - b.r, a[1] - b.g, a[2] - b.b);

  // 쉼표 색: 장면 여러 곳에서 뽑은 색 3개 (서로 충분히 다르게)
  const restColors: { r: number; g: number; b: number }[] = [];
  const radius = ((o.colorTolerance ?? 0) / 100) * RGB_DIAGONAL;
  if (o.restStyle === 'color') {
    // 색상은 장면에서, 밝기는 어두운·중간·밝은 칸으로 나눠서 — 색상이 비슷한 장면(벚꽃 등)에서도 서로 구분되게
    const bands: [number, number][] = [[45, 95], [105, 155], [165, 215]];
    for (const [lo, hi] of bands) {
      for (let tries = 0; tries < 60; tries++) {
        const p = paint(rand(), rand());
        const [r, g, b] = colorWithLuminance(((p[0] % 360) + 360) % 360, Math.max(0.35, clamp01(p[1])), lerp(lo, hi, rand()));
        if (restColors.every((c) => dist([r, g, b], c) > radius * 3)) {
          restColors.push({ r, g, b });
          break;
        }
      }
    }
  }
  // 음 칸이 쉼표 색으로 읽히지 않도록 띄울 거리 (반올림 여유 포함)
  const keepAway = radius + 3;

  const note = (x: number, y: number, lo: number, hi: number): [number, number, number] => {
    const { hue, sat, shade } = at(x, y);
    // 칸 안에서 장면의 명암 결을 따르되, 반올림 오차를 견디도록 가장자리는 피한다
    const minB = Math.ceil(lo);
    const maxB = Math.ceil(hi) - 1;
    const margin = maxB - minB >= 2 ? 1 : 0;
    const want = lerp(minB + margin, maxB - margin, shade);
    const ok = (c: number[]) => {
      const b = brightnessOf(c);
      return b >= lo && b < hi && restColors.every((r) => dist(c, r) > keepAway);
    };
    // 장면 색 그대로 → 안 되면 색상·채도를 조금씩 바꿔 가며 (밝기는 칸 안에서)
    for (const target of [want, (minB + maxB) / 2]) {
      for (const dh of [0, 30, -30, 60, -60, 120, 180]) {
        for (const s of [sat, sat * 0.5, Math.min(1, sat + 0.35), 0]) {
          const c = colorWithLuminance((hue + dh + 360) % 360, s, target);
          if (ok(c)) return c;
        }
      }
    }
    for (let b = minB; b <= maxB; b++) if (ok([b, b, b])) return [b, b, b];
    const g = Math.round((minB + maxB) / 2); // 마지막 수단: 회색은 밝기가 정확하다
    return [g, g, g];
  };

  const rest = (x: number, y: number): [number, number, number] => {
    if (!restColors.length) {
      // 쉼표 기준보다 어두운 장면 색
      return note(x, y, 0, Math.max(1, o.restThreshold));
    }
    // 장면 색에 가장 가까운 쉼표 색 + 작은 결 (허용 범위 안에서)
    const { hue, sat, shade } = at(x, y);
    const want = colorWithLuminance(hue, sat, 45 + shade * 170);
    let best = restColors[0];
    for (const c of restColors) if (dist(want, c) < dist(want, best)) best = c;
    const j = Math.min(8, radius * 0.35) * (shade - 0.5) * 2;
    return [best.r, best.g, best.b].map((v) => Math.max(0, Math.min(255, Math.round(v + j)))) as [number, number, number];
  };

  return { note, rest, restColors };
}

export function randomSceneId(rand: () => number = Math.random, except?: string) {
  const pool = SCENES.filter((s) => s.id !== except);
  return pool[Math.floor(rand() * pool.length)].id;
}
