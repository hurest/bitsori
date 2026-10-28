// MIDI → 이미지 역변환. 이미지 → 악보 변환(score.ts)의 정확한 반대 과정이다.
//  1) 음을 박자 단위(칸)로 맞춘다
//  2) 칸마다 울리는 음을 N개 줄(화음 수)에 배정한다
//  3) 줄 = 이미지의 행(또는 열), 칸 = 줄 안의 위치로 픽셀을 찍고, 긴 띠를 length 칸씩 잘라 쌓는다
//  4) 음 높이 → 밝기 (밝기 → 음 계산을 거꾸로), 쉼표 → 검정
import { UNIT_BEATS, indexToBrightness, type Direction, type Unit } from './constants';
import { pitchTable, type ScaleId } from './filters';
import type { ParsedMidi } from './midi-file';
import { luminance } from './pixels';

const DRUM_CHANNEL = 9;

export interface QuantizedNote { midi: number; start: number; end: number; velocity: number; track: number }

export interface Quantized {
  notes: QuantizedNote[];
  steps: number;
  minMidi: number;
  maxMidi: number;
  /** 동시에 울리는 음의 최대 개수 */
  maxPoly: number;
  /** 제외한 드럼 음 수 */
  drums: number;
}

export type ColorMode = 'rainbow' | 'gray';

/**
 * 1) 박자 단위로 맞추기
 * maxTrack: 빛소리가 저장한 MIDI면 줄 트랙(1~N)만 쓰고, 그 뒤의 반주 트랙은 뺀다.
 */
export function quantize(parsed: ParsedMidi, unit: Unit, { maxTrack = Infinity }: { maxTrack?: number } = {}): Quantized {
  const stepTicks = parsed.ppq * UNIT_BEATS[unit];
  const notes: QuantizedNote[] = [];
  let drums = 0;
  for (const n of parsed.notes) {
    if (n.track > maxTrack) continue;
    if (n.channel === DRUM_CHANNEL) {
      drums++;
      continue;
    }
    const start = Math.round(n.startTick / stepTicks);
    const end = Math.max(start + 1, Math.round(n.endTick / stepTicks));
    notes.push({ midi: n.midi, start, end, velocity: n.velocity, track: n.track });
  }
  notes.sort((a, b) => a.start - b.start || b.midi - a.midi);

  let steps = 0;
  let minMidi = 127;
  let maxMidi = 0;
  for (const n of notes) {
    steps = Math.max(steps, n.end);
    minMidi = Math.min(minMidi, n.midi);
    maxMidi = Math.max(maxMidi, n.midi);
  }

  const delta = new Int32Array(steps + 1);
  for (const n of notes) {
    delta[n.start]++;
    delta[n.end]--;
  }
  let cur = 0;
  let maxPoly = 0;
  for (let s = 0; s < steps; s++) {
    cur += delta[s];
    maxPoly = Math.max(maxPoly, cur);
  }
  return { notes, steps, minMidi, maxMidi, maxPoly, drums };
}

/**
 * 2) 줄 배정 → grid[v * steps + s] = MIDI 음 번호 (쉼표는 -1)
 * voiceFromTrack: 빛소리가 저장한 MIDI는 트랙 1, 2, …가 곧 줄 1, 2, …라 그대로 쓴다.
 */
export function allocate(q: Quantized, chord: number, voiceFromTrack = false) {
  const { notes, steps } = q;
  const grid = new Int16Array(chord * steps).fill(-1);
  let dropped = 0;
  let merged = 0;
  const put = (v: number, n: QuantizedNote) => {
    for (let s = n.start; s < n.end; s++) grid[v * steps + s] = n.midi;
  };

  if (voiceFromTrack) {
    for (const n of notes) {
      const v = n.track - 1;
      if (v >= 0 && v < chord) put(v, n);
      else dropped++;
    }
    return { grid, dropped, merged };
  }

  // 줄이 비는 시점과 마지막 음. 길게 누른 음은 같은 줄에 계속 두어야 한 음으로 이어진다.
  const freeAt = new Int32Array(chord);
  const lastMidi = new Int16Array(chord).fill(-1);
  for (const n of notes) {
    // 시작이 같으면 높은 음부터 위쪽 줄에 배정된다 (정렬 순서)
    let pick = -1;
    let fallback = -1;
    for (let v = 0; v < chord; v++) {
      if (freeAt[v] > n.start) continue;
      // 바로 직전에 같은 음이 끝난 줄에 넣으면 두 음이 하나로 합쳐지므로 가능하면 피한다
      if (freeAt[v] === n.start && lastMidi[v] === n.midi) {
        if (fallback < 0) fallback = v;
        continue;
      }
      pick = v;
      break;
    }
    if (pick < 0 && fallback >= 0) {
      pick = fallback;
      merged++;
    }
    if (pick < 0) {
      dropped++;
      continue;
    }
    put(pick, n);
    freeAt[pick] = n.end;
    lastMidi[pick] = n.midi;
  }
  return { grid, dropped, merged };
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const k = (n: number) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

const HUES = Array.from({ length: 12 }, (_, pc) => hslToRgb(pc * 25, 1, 0.5));

/**
 * 무지개 색: 색상은 음 이름(도=빨강 … 시=보라), 밝기는 목표 밝기에 정확히 맞춘다.
 * 변환 엔진은 밝기만 읽으므로 이 색을 다시 넣으면 같은 음이 난다.
 */
export function noteColor(pitchClass: number, target: number, mode: ColorMode): [number, number, number] {
  if (mode === 'gray') {
    const v = Math.round(target);
    return [v, v, v];
  }
  const [r, g, b] = HUES[pitchClass];
  const base = luminance(r, g, b);
  let rgb: number[];
  if (target <= base) {
    const k = target / base; // 검정 쪽으로
    rgb = [r * k, g * k, b * k];
  } else {
    const t = (target - base) / (255 - base); // 흰색 쪽으로
    rgb = [r + (255 - r) * t, g + (255 - g) * t, b + (255 - b) * t];
  }
  const [cr, cg, cb] = rgb.map((c) => Math.max(0, Math.min(255, Math.round(c))));
  return [cr, cg, cb];
}

export interface RenderOptions {
  grid: Int16Array;
  steps: number;
  chord: number;
  startOct: number;
  endOct: number;
  direction: Direction;
  length: number;
  /** 필터의 음계 (기본: 반음계) */
  scale?: ScaleId;
  key?: number;
  /** 원래 이미지의 줄 수(메타정보). 알면 마지막 묶음의 빈 줄을 잘라낸다. */
  lines?: number;
  colorMode: ColorMode;
  restThreshold: number;
}

/** 3·4) 픽셀 찍기 */
export function render(o: RenderOptions) {
  const { grid, steps, chord, startOct, endOct, direction, length, lines, colorMode, restThreshold } = o;
  const table = pitchTable(startOct, endOct, o.scale, o.key);
  const noteCount = table.length;
  const indexOf = new Map(table.map((m, i) => [m, i]));
  // 음계 밖의 음: 바로 아래 음계 음으로 (범위 밖이면 끝 음으로)
  const nearest = (midi: number) => {
    let i = 0;
    while (i + 1 < table.length && table[i + 1] <= midi) i++;
    return i;
  };
  const groups = Math.max(1, Math.ceil(steps / length), lines ? Math.ceil(lines / chord) : 0);
  const lineCount = lines && lines >= (groups - 1) * chord + 1 ? Math.min(lines, groups * chord) : groups * chord;
  const vertical = direction === 'vertical';
  const width = vertical ? lineCount : length;
  const height = vertical ? length : lineCount;
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 3; i < data.length; i += 4) data[i] = 255; // 기본 검정 = 쉼표

  let clamped = 0;
  const colorCache = new Map<number, [number, number, number]>();
  for (let v = 0; v < chord; v++) {
    for (let s = 0; s < steps; s++) {
      const midi = grid[v * steps + s];
      if (midi < 0) continue;
      const g = Math.floor(s / length);
      const line = g * chord + v;
      if (line >= lineCount) continue;
      let idx = indexOf.get(midi);
      if (idx === undefined) {
        clamped++;
        idx = nearest(midi);
      }
      const key = idx * 12 + (midi % 12);
      let color = colorCache.get(key);
      if (!color) {
        color = noteColor(midi % 12, indexToBrightness(idx, restThreshold, noteCount), colorMode);
        colorCache.set(key, color);
      }
      const pos = s % length;
      const x = vertical ? line : pos;
      const y = vertical ? pos : line;
      const p = (y * width + x) * 4;
      data[p] = color[0];
      data[p + 1] = color[1];
      data[p + 2] = color[2];
    }
  }
  return { width, height, data, clamped, lineCount };
}

/** 곡 음역에 맞는 옥타브 (1 ~ 7 범위 안) */
export function autoOctaves(q: Quantized) {
  if (!q.notes.length) return { startOct: 1, endOct: 4 };
  const oct = (m: number) => Math.floor(m / 12) - 1;
  const startOct = Math.max(1, Math.min(7, oct(q.minMidi)));
  const endOct = Math.max(startOct, Math.min(7, oct(q.maxMidi)));
  return { startOct, endOct };
}

/** 대략 정사각형이 되는 한 줄 길이 */
export function autoLength(steps: number, chord: number) {
  return Math.max(4, Math.min(1024, Math.round(Math.sqrt(steps * chord))));
}
