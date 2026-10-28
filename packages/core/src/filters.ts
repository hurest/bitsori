// 음악 필터: 카메라 필터처럼 한 번 고르면 노래 분위기가 바뀐다.
//  - 음계: 밝기를 반음 12개 전체가 아니라 음계 음에만 배정해 불협화음을 줄인다
//  - 반주: 코드 진행을 따라가는 베이스·코드·드럼을 깔아 노래처럼 들리게 한다
//  - 추천 설정: 필터를 고를 때 함께 적용되는 빠르기·화음 수·옥타브 (이후 사용자가 바꿀 수 있다)
import type { Settings } from './settings';

export type ScaleId = 'chromatic' | 'major' | 'minor' | 'majorPentatonic' | 'minorPentatonic';

export const SCALES: Record<ScaleId, number[]> = {
  chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  majorPentatonic: [0, 2, 4, 7, 9],
  minorPentatonic: [0, 3, 5, 7, 10],
};

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
  scale: ScaleId;
  /** 음계의 으뜸음 (0 = C) */
  key: number;
  /** 코드 진행 (코드 이름). 비어 있으면 반주 없음 */
  progression: string[];
  barsPerChord: number;
  bass: BassPattern | null;
  pad: PadPattern | null;
  drums: DrumPattern | null;
  /** 잔향 비율 0~1 */
  reverb: number;
  /** 필터를 고를 때 함께 적용하는 설정 */
  suggested: Partial<Settings>;
}

export const FILTERS: FilterDef[] = [
  {
    id: 'none', tier: 'free', label: '원본', emoji: '📷', description: '픽셀 그대로. 반음 12개 전체, 반주 없음',
    scale: 'chromatic', key: 0, progression: [], barsPerChord: 1, bass: null, pad: null, drums: null, reverb: 0.18,
    suggested: {},
  },
  {
    id: 'pop', tier: 'free', label: '팝', emoji: '🎈', description: 'C 장조 5음계 · C–G–Am–F · 베이스·코드·드럼',
    scale: 'majorPentatonic', key: 0, progression: ['C', 'G', 'Am', 'F'], barsPerChord: 1,
    bass: 'rootFifth', pad: 'sustain', drums: 'pop', reverb: 0.15,
    suggested: { bpm: 108, unit: '8n', chord: 2, startOct: 4, endOct: 5 },
  },
  {
    id: 'lofi', tier: 'premium', label: '로파이', emoji: '☕', description: '느긋한 7화음 진행 Dm7–G7–Cmaj7–Am7 · 느린 비트',
    scale: 'majorPentatonic', key: 0, progression: ['Dm7', 'G7', 'Cmaj7', 'Am7'], barsPerChord: 1,
    bass: 'half', pad: 'sustain', drums: 'lofi', reverb: 0.22,
    suggested: { bpm: 80, unit: '8n', chord: 2, startOct: 3, endOct: 5 },
  },
  {
    id: 'dream', tier: 'premium', label: '몽환', emoji: '🌙', description: 'Fmaj7–Cmaj7을 길게 · 드럼 없이 넓은 잔향',
    scale: 'majorPentatonic', key: 0, progression: ['Fmaj7', 'Cmaj7'], barsPerChord: 2,
    bass: 'whole', pad: 'sustain', drums: null, reverb: 0.4,
    suggested: { bpm: 72, unit: '8n', chord: 3, startOct: 4, endOct: 6 },
  },
  {
    id: 'musicbox', tier: 'premium', label: '오르골', emoji: '🎠', description: '높은 음역 · C–F–G–C 분산화음',
    scale: 'major', key: 0, progression: ['C', 'F', 'G', 'C'], barsPerChord: 1,
    bass: null, pad: 'arp', drums: null, reverb: 0.25,
    suggested: { bpm: 96, unit: '16n', chord: 1, startOct: 5, endOct: 6 },
  },
  {
    id: 'cinema', tier: 'premium', label: '시네마', emoji: '🎬', description: 'A 단조 · Am–F–C–G · 웅장한 패드',
    scale: 'minorPentatonic', key: 9, progression: ['Am', 'F', 'C', 'G'], barsPerChord: 2,
    bass: 'whole', pad: 'sustain', drums: null, reverb: 0.32,
    suggested: { bpm: 76, unit: '8n', chord: 3, startOct: 3, endOct: 5 },
  },
];

export const DEFAULT_FILTER_ID = 'pop';

export function getFilter(id: string | undefined): FilterDef {
  return FILTERS.find((f) => f.id === id) ?? FILTERS[0];
}

/**
 * 음역 안에서 음계에 속하는 MIDI 음 목록 (낮은 음부터).
 * 밝기는 이 목록의 칸에 고르게 배정된다. 반음계면 이전 규칙과 똑같다.
 */
export function pitchTable(startOct: number, endOct: number, scale: ScaleId = 'chromatic', key = 0): number[] {
  const steps = new Set(SCALES[scale].map((s) => (s + key) % 12));
  const out: number[] = [];
  for (let m = (startOct + 1) * 12; m < (endOct + 2) * 12; m++) if (steps.has(m % 12)) out.push(m);
  return out;
}

const PITCH_CLASS: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
const QUALITIES: Record<string, number[]> = {
  '': [0, 4, 7], m: [0, 3, 7], '7': [0, 4, 7, 10], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10],
};

/** 'Am7' → { root: 9, tones: [0, 3, 7, 10] } */
export function parseChord(name: string): { root: number; tones: number[] } {
  const m = /^([A-G])([#b]?)(maj7|m7|7|m|)$/.exec(name);
  if (!m) throw new Error(`알 수 없는 코드: ${name}`);
  const root = (PITCH_CLASS[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? 11 : 0)) % 12;
  return { root, tones: QUALITIES[m[3]] };
}
