export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
export const SOLFEGE = ['도', '도#', '레', '레#', '미', '파', '파#', '솔', '솔#', '라', '라#', '시'] as const;

export type Unit = '4n' | '8n' | '16n';
export type Direction = 'horizontal' | 'vertical';

/** 한 칸 길이 → 박(4분음표) 수 */
export const UNIT_BEATS: Record<Unit, number> = { '4n': 1, '8n': 0.5, '16n': 0.25 };

export const MIN_OCT = 1;
export const MAX_OCT = 7;
export const MAX_CHORD = 16;
export const MIN_BPM = 40;
export const MAX_BPM = 240;
export const DEFAULT_REST_THRESHOLD = 20;

export const isUnit = (v: unknown): v is Unit => typeof v === 'string' && v in UNIT_BEATS;
export const isDirection = (v: unknown): v is Direction => v === 'horizontal' || v === 'vertical';

export function midiToName(midi: number): string {
  return NOTE_NAMES[midi % 12] + (Math.floor(midi / 12) - 1);
}

/** 한 칸의 재생 시간(초) */
export function stepSeconds(bpm: number, unit: Unit): number {
  return (60 / bpm) * UNIT_BEATS[unit];
}

/** 밝기 → 음 번호(0 ~ noteCount-1). 밝기 [restThreshold, 255]를 noteCount칸으로 고르게 나눈다. */
export function brightnessToIndex(b: number, restThreshold: number, noteCount: number): number {
  return Math.min(noteCount - 1, Math.floor(((b - restThreshold) / (256 - restThreshold)) * noteCount));
}

/** 음 번호 → 그 칸의 한가운데 밝기 (역변환용) */
export function indexToBrightness(idx: number, restThreshold: number, noteCount: number): number {
  return restThreshold + ((idx + 0.5) * (256 - restThreshold)) / noteCount;
}

export function clampInt(v: unknown, min: number, max: number): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
}
