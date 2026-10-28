import { brightnessToIndex, midiToName, type Direction } from './constants';
import { getFilter, pitchTable } from './filters';
import type { Sample } from './pixels';
import type { RGB, Settings } from './settings';

export interface ScoreEvent {
  /** 음 번호(음역·음계 안에서 0부터) */
  idx: number;
  midi: number;
  note: string;
  /** 길이(칸 수). 같은 줄에서 같은 음이 이어지면 늘어난다. */
  dur: number;
  /** 화음 안의 줄 번호(0 ~ chord-1) */
  voice: number;
}

export interface Score {
  width: number;
  height: number;
  chord: number;
  direction: Direction;
  /** 줄 수 (가로 방향이면 행 수, 세로 방향이면 열 수) */
  lineCount: number;
  /** 한 줄의 칸 수 */
  length: number;
  groups: number;
  totalSteps: number;
  /** 칸마다 그 칸에서 시작하는 음들 */
  starts: (ScoreEvent[] | undefined)[];
  /** 픽셀별 쉼표 여부 (1 = 쉼표) */
  restMask: Uint8Array;
  noteEvents: number;
  restRatio: number;
  lowNote: string;
  highNote: string;
  noteCount: number;
}

export type ScoreOptions = Pick<
  Settings,
  'chord' | 'startOct' | 'endOct' | 'restThreshold' | 'restColors' | 'colorTolerance' | 'direction'
> & { filter?: string };

/**
 * 재생 방향별 줄 구성
 * - horizontal: 행이 한 줄, 왼쪽 → 오른쪽으로 진행
 * - vertical:   열이 한 줄, 위 → 아래로 진행
 */
export function layout(width: number, height: number, direction: Direction) {
  return direction === 'vertical'
    ? { lineCount: width, length: height }
    : { lineCount: height, length: width };
}

/** 재생 칸 수: 한 줄의 길이 × 화음 묶음 수 */
export function countSteps(width: number, height: number, chord: number, direction: Direction = 'horizontal') {
  const { lineCount, length } = layout(width, height, direction);
  return length * Math.ceil(lineCount / chord);
}

const MAX_RGB_DISTANCE = Math.sqrt(3 * 255 * 255);

/** 픽셀별 쉼표 여부: 기준보다 어둡거나, 투명하거나, 쉼표 색과 비슷하면 1 */
export function buildRestMask(sample: Sample, restThreshold: number, restColors: RGB[], colorTolerance: number) {
  const { brightness, data } = sample;
  const mask = new Uint8Array(brightness.length);
  const maxDist = (colorTolerance / 100) * MAX_RGB_DISTANCE;
  const maxDistSq = maxDist * maxDist;
  for (let i = 0, p = 0; i < mask.length; i++, p += 4) {
    const b = brightness[i];
    if (b < 0 || b < restThreshold) {
      mask[i] = 1;
      continue;
    }
    for (const c of restColors) {
      const dr = data[p] - c.r;
      const dg = data[p + 1] - c.g;
      const db = data[p + 2] - c.b;
      if (dr * dr + dg * dg + db * db <= maxDistSq) {
        mask[i] = 1;
        break;
      }
    }
  }
  return mask;
}

/**
 * 이미지 → 악보
 * - 줄(가로 방향이면 행, 세로 방향이면 열)을 chord개씩 묶고, 묶음 안에서 한 칸씩 진행 (각 줄 = 화음의 한 성부)
 * - 쉼표 픽셀은 소리 없음
 * - 같은 줄에서 같은 음이 연속되면 한 음으로 길게 이어서 연주
 * - 밝기 [restThreshold, 255] 구간을 startOct 도 ~ endOct 시 범위의 음(필터의 음계에 속한 음)에 고르게 배분
 */
export function buildScore(sample: Sample, opts: ScoreOptions): Score {
  const { chord, startOct, endOct, restThreshold, restColors, colorTolerance, direction } = opts;
  const { width, height, brightness } = sample;
  const { lineCount, length } = layout(width, height, direction);
  const vertical = direction === 'vertical';
  const restMask = buildRestMask(sample, restThreshold, restColors, colorTolerance);
  const filter = getFilter(opts.filter);
  const table = pitchTable(startOct, endOct, filter.scale, filter.key);
  const noteCount = table.length;
  const groups = Math.ceil(lineCount / chord);
  const totalSteps = groups * length;
  const starts: (ScoreEvent[] | undefined)[] = new Array(totalSteps);

  let noteEvents = 0;
  let restCells = 0;

  for (let g = 0; g < groups; g++) {
    for (let v = 0; v < chord; v++) {
      const line = g * chord + v;
      if (line >= lineCount) break;
      let current: ScoreEvent | null = null;
      for (let pos = 0; pos < length; pos++) {
        const i = vertical ? pos * width + line : line * width + pos;
        if (restMask[i]) {
          current = null;
          restCells++;
          continue;
        }
        const idx = brightnessToIndex(brightness[i], restThreshold, noteCount);
        if (current && current.idx === idx) {
          current.dur++;
          continue;
        }
        current = { idx, midi: table[idx], note: midiToName(table[idx]), dur: 1, voice: v };
        const step = g * length + pos;
        (starts[step] ??= []).push(current);
        noteEvents++;
      }
    }
  }

  return {
    width, height, chord, direction, lineCount, length, groups, totalSteps, starts, restMask,
    noteEvents,
    restRatio: restCells / (width * height),
    lowNote: midiToName(table[0]),
    highNote: midiToName(table[noteCount - 1]),
    noteCount,
  };
}
