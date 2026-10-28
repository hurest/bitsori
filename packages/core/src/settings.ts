import {
  DEFAULT_REST_THRESHOLD, MAX_BPM, MAX_CHORD, MAX_OCT, MIN_BPM, MIN_OCT,
  clampInt, isDirection, isUnit, type Direction, type Unit,
} from './constants';
import { FILTERS } from './filters';

export interface RGB {
  r: number;
  g: number;
  b: number;
}

/** 변환·재생 설정. 웹과 앱이 같은 값을 쓰면 같은 노래가 나온다. */
export interface Settings {
  direction: Direction;
  chord: number;
  startOct: number;
  endOct: number;
  restThreshold: number;
  restColors: RGB[];
  /** 0~100(%) — RGB 거리 기준 쉼표 색 허용 범위 */
  colorTolerance: number;
  bpm: number;
  unit: Unit;
  instrument: string;
  /** 음악 필터 id (filters.ts) */
  filter: string;
}

export const DEFAULT_SETTINGS: Settings = {
  direction: 'horizontal',
  chord: 1,
  startOct: 1,
  endOct: 4,
  restThreshold: DEFAULT_REST_THRESHOLD,
  restColors: [],
  colorTolerance: 12,
  bpm: 120,
  unit: '8n',
  instrument: 'piano',
  filter: 'none',
};

/** 외부에서 온 값(메타정보 등)에서 올바른 설정만 골라낸다. 잘못된 값은 버린다. */
export function sanitizeSettings(input: Record<string, unknown>): Partial<Settings> {
  const out: Partial<Settings> = {};
  const num = (v: unknown) => typeof v === 'number' && Number.isFinite(v);
  if (isDirection(input.direction)) out.direction = input.direction;
  if (num(input.chord)) out.chord = clampInt(input.chord, 1, MAX_CHORD);
  if (num(input.startOct) && num(input.endOct)) {
    const so = clampInt(input.startOct, MIN_OCT, MAX_OCT);
    const eo = clampInt(input.endOct, MIN_OCT, MAX_OCT);
    if (so <= eo) Object.assign(out, { startOct: so, endOct: eo });
  }
  if (num(input.restThreshold)) out.restThreshold = clampInt(input.restThreshold, 0, 160);
  if (num(input.colorTolerance)) out.colorTolerance = clampInt(input.colorTolerance, 0, 50);
  if (num(input.bpm)) out.bpm = clampInt(input.bpm, MIN_BPM, MAX_BPM);
  if (isUnit(input.unit)) out.unit = input.unit;
  if (typeof input.instrument === 'string') out.instrument = input.instrument;
  if (typeof input.filter === 'string' && FILTERS.some((f) => f.id === input.filter)) out.filter = input.filter;
  if (Array.isArray(input.restColors)) {
    out.restColors = input.restColors
      .filter((c): c is RGB => !!c && [c.r, c.g, c.b].every((v) => num(v) && v >= 0 && v <= 255))
      .map((c) => ({ r: Math.round(c.r), g: Math.round(c.g), b: Math.round(c.b) }));
  }
  return out;
}
