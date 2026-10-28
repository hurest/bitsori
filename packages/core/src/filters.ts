// 음악 필터: 카메라 필터처럼 한 번 고르면 노래의 스타일이 바뀐다.
// 노래의 뼈대(조·장단조·코드 진행·빠르기·세기)는 사진이 정하고 (analyze.ts, arrange.ts),
// 필터는 스타일만 입힌다 — 음계의 종류, 반주 구성(베이스·코드·드럼), 코드 색깔(3화음/7화음), 잔향, 추천 음역.
import type { Settings } from './settings';

export type ScaleId = 'chromatic' | 'major' | 'minor' | 'majorPentatonic' | 'minorPentatonic';
export type ScaleFamily = 'chromatic' | 'diatonic' | 'pentatonic';
export type Mode = 'major' | 'minor';

export const SCALES: Record<ScaleId, number[]> = {
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  majorPentatonic: [0, 2, 4, 7, 9],
  minorPentatonic: [0, 3, 5, 7, 10],
};

export function scaleOf(family: ScaleFamily, mode: Mode): ScaleId {
  if (family === 'chromatic') return 'chromatic';
  if (family === 'diatonic') return mode;
  return mode === 'major' ? 'majorPentatonic' : 'minorPentatonic';
}

export type BassPattern = 'whole' | 'half' | 'rootFifth' | 'pulse';
export type PadPattern = 'sustain' | 'arp';
export type DrumPattern = 'pop' | 'lofi';

/** free: 누구나 / premium: 앱에서 구매해야 내 사진에 적용 가능 (공유받은 작품 감상은 무료) */
export type FilterTier = 'free' | 'premium';

/** 인앱 결제 상품 ID (App Store·Google Play에 같은 ID로 등록) */
export const filterProductId = (id: string) => `app.bitsori.filter.${id}`;

export interface FilterDef {
  id: string;
  tier: FilterTier;
  label: string;
  emoji: string;
  description: string;
  scale: ScaleFamily;
  /** 장조/단조를 필터가 고정할지, 사진에 맡길지 */
  mode: Mode | 'auto';
  /** 코드 색깔: 3화음 / 7화음 */
  chords: 'triad' | 'seventh';
  /**
   * 필터 고유의 코드 진행 (음계 도수 1~7). 강도가 높을수록 이 진행을 따르고,
   * 낮을수록 사진(멜로디)에 맞춘 코드를 고른다. 비어 있으면 반주 없음.
   */
  template: number[];
  barsPerChord: number;
  bass: BassPattern | null;
  pad: PadPattern | null;
  drums: DrumPattern | null;
  /** 잔향 비율 0~1 */
  reverb: number;
  /** 필터를 고를 때 함께 적용하는 설정 — 어울리는 악기 포함 (빠르기는 사진에 맞춰 조금 달라진다) */
  suggested: Partial<Settings>;
}

export const FILTERS: FilterDef[] = [
  {
    id: 'none', tier: 'free', label: '원본', emoji: '📷', description: '픽셀 그대로. 반음 12개 전체, 반주 없음',
    scale: 'chromatic', mode: 'major', chords: 'triad', template: [], barsPerChord: 1,
    bass: null, pad: null, drums: null, reverb: 0.18,
    suggested: {},
  },
  {
    id: 'pop', tier: 'free', label: '팝', emoji: '🎈', description: '5음계 · 베이스·코드·드럼',
    scale: 'pentatonic', mode: 'auto', chords: 'triad', template: [1, 5, 6, 4], barsPerChord: 1,
    bass: 'rootFifth', pad: 'sustain', drums: 'pop', reverb: 0.15,
    suggested: { bpm: 108, unit: '8n', chord: 2, startOct: 4, endOct: 5, instrument: 'piano' },
  },
  {
    id: 'lofi', tier: 'premium', label: '로파이', emoji: '☕', description: '7화음 · 느긋한 비트',
    scale: 'pentatonic', mode: 'auto', chords: 'seventh', template: [2, 5, 1, 6], barsPerChord: 1,
    bass: 'half', pad: 'sustain', drums: 'lofi', reverb: 0.22,
    suggested: { bpm: 80, unit: '8n', chord: 2, startOct: 3, endOct: 5, instrument: 'epiano' },
  },
  {
    id: 'dream', tier: 'premium', label: '몽환', emoji: '🌙', description: '긴 7화음 · 드럼 없이 넓은 잔향',
    scale: 'pentatonic', mode: 'auto', chords: 'seventh', template: [4, 1], barsPerChord: 2,
    bass: 'whole', pad: 'sustain', drums: null, reverb: 0.4,
    suggested: { bpm: 72, unit: '8n', chord: 3, startOct: 4, endOct: 6, instrument: 'harp' },
  },
  {
    id: 'musicbox', tier: 'premium', label: '오르골', emoji: '🎠', description: '높은 음역 · 장조 분산화음',
    scale: 'diatonic', mode: 'major', chords: 'triad', template: [1, 4, 5, 1], barsPerChord: 1,
    bass: null, pad: 'arp', drums: null, reverb: 0.25,
    suggested: { bpm: 96, unit: '16n', chord: 1, startOct: 5, endOct: 6, instrument: 'xylophone' },
  },
  {
    id: 'cinema', tier: 'premium', label: '시네마', emoji: '🎬', description: '단조 · 웅장한 패드',
    scale: 'pentatonic', mode: 'minor', chords: 'triad', template: [1, 6, 3, 7], barsPerChord: 2,
    bass: 'whole', pad: 'sustain', drums: null, reverb: 0.32,
    suggested: { bpm: 76, unit: '8n', chord: 3, startOct: 3, endOct: 5, instrument: 'violin' },
  },
];

export const DEFAULT_FILTER_ID = 'pop';

export function getFilter(id: string | undefined): FilterDef {
  return FILTERS.find((f) => f.id === id) ?? FILTERS[0];
}

/**
 * 음역 안에서 음계에 속하는 MIDI 음 목록 (낮은 음부터).
 * 밝기는 이 목록의 칸에 고르게 배정된다. 반음계면 원래 규칙과 똑같다.
 */
export function pitchTable(startOct: number, endOct: number, scale: ScaleId = 'chromatic', key = 0): number[] {
  const steps = new Set(SCALES[scale].map((s) => (s + key) % 12));
  const out: number[] = [];
  for (let m = (startOct + 1) * 12; m < (endOct + 2) * 12; m++) if (steps.has(m % 12)) out.push(m);
  return out;
}

export const KEY_NAMES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const;
export const keyLabel = (key: number, mode: Mode) => `${KEY_NAMES[key]} ${mode === 'major' ? '장조' : '단조'}`;

// ---------- 화음 ----------
export interface Chord {
  /** 음계 도수 1~7 */
  degree: number;
  root: number;
  tones: number[];
}

const TRIADS: Record<'maj' | 'min' | 'dim', number[]> = { maj: [0, 4, 7], min: [0, 3, 7], dim: [0, 3, 6] };
// [반음 거리, 3화음 종류, 7화음 구성]
const DIATONIC: Record<Mode, [number, keyof typeof TRIADS, number[]][]> = {
  major: [
    [0, 'maj', [0, 4, 7, 11]], [2, 'min', [0, 3, 7, 10]], [4, 'min', [0, 3, 7, 10]], [5, 'maj', [0, 4, 7, 11]],
    [7, 'maj', [0, 4, 7, 10]], [9, 'min', [0, 3, 7, 10]], [11, 'dim', [0, 3, 6, 10]],
  ],
  minor: [
    [0, 'min', [0, 3, 7, 10]], [2, 'dim', [0, 3, 6, 10]], [3, 'maj', [0, 4, 7, 11]], [5, 'min', [0, 3, 7, 10]],
    [7, 'min', [0, 3, 7, 10]], [8, 'maj', [0, 4, 7, 11]], [10, 'maj', [0, 4, 7, 10]],
  ],
};

/** 조 안의 화음 (감화음은 반주가 어색해서 제외) */
export function diatonicChords(key: number, mode: Mode, color: 'triad' | 'seventh'): Chord[] {
  return DIATONIC[mode]
    .map(([offset, quality, seventh], i) => ({ degree: i + 1, root: (key + offset) % 12, tones: color === 'seventh' ? seventh : TRIADS[quality], quality }))
    .filter((c) => c.quality !== 'dim')
    .map(({ degree, root, tones }) => ({ degree, root, tones }));
}
