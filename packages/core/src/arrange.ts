// 필터 반주 만들기: 사진(멜로디)에 맞춘 코드 진행 위에 필터의 반주 스타일을 입힌다.
//  - 코드: 마디(또는 필터가 정한 마디 묶음)마다 그 구간 멜로디 음을 가장 잘 감싸는 조 안의 화음을 고른다 (자동 화성)
//  - 강도: 높을수록 필터 고유 진행을 따르고 반주가 크다. 낮을수록 사진이 고른 화음이 그대로, 반주는 작게.
import { UNIT_BEATS, type Unit } from './constants';
import { diatonicChords, type Chord, type FilterDef } from './filters';
import type { Score } from './score';

export interface BackingNote {
  step: number;
  /** 길이(칸) */
  dur: number;
  midi: number;
  /** 0~1 */
  velocity: number;
}

export type DrumKind = 'kick' | 'snare' | 'hat';

export interface DrumHit {
  step: number;
  kind: DrumKind;
  velocity: number;
}

export interface Arrangement {
  bass: BackingNote[];
  pad: BackingNote[];
  drums: DrumHit[];
  stepsPerBar: number;
  /** 구간(코드 하나가 이어지는 마디 묶음)별로 고른 화음 */
  chords: Chord[];
}

/** General MIDI 드럼 번호 (MIDI 저장용) */
export const GM_DRUMS: Record<DrumKind, number> = { kick: 36, snare: 38, hat: 42 };

const BASS_LOW = 36; // C2
const PAD_LOW = 50; // D3 — 코드음을 이 위 한 옥타브 안에 모은다

// 박 위치(4/4 한 마디 안, 0 = 첫 박)
type DrumLine = { kind: DrumKind; beats: number[]; velocity: number };
function drumPattern(style: 'pop' | 'lofi', busy: number): DrumLine[] {
  // 복잡한 사진일수록 촘촘하게
  const hats = busy > 0.45 ? [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5] : [0, 1, 2, 3];
  if (style === 'pop') {
    return [
      { kind: 'kick', beats: busy > 0.7 ? [0, 1.5, 2] : [0, 2], velocity: 0.8 },
      { kind: 'snare', beats: [1, 3], velocity: 0.55 },
      { kind: 'hat', beats: hats, velocity: 0.25 },
    ];
  }
  return [
    { kind: 'kick', beats: [0, 2.5], velocity: 0.7 },
    { kind: 'snare', beats: [1, 3], velocity: 0.45 },
    { kind: 'hat', beats: busy > 0.6 ? hats : [0, 1, 2, 3], velocity: 0.18 },
  ];
}

export interface ArrangeOptions {
  /** 필터 강도 0~100 */
  strength: number;
}

export function arrange(score: Score, unit: Unit, filter: FilterDef, { strength }: ArrangeOptions): Arrangement {
  const stepsPerBeat = 1 / UNIT_BEATS[unit];
  const stepsPerBar = 4 * stepsPerBeat;
  const totalSteps = score.totalSteps;
  const out: Arrangement = { bass: [], pad: [], drums: [], stepsPerBar, chords: [] };
  const s = Math.max(0, Math.min(100, strength)) / 100;
  if (!filter.template.length || totalSteps <= 0 || s === 0) return out;

  const palette = diatonicChords(score.key, score.mode, filter.chords);
  const windowSteps = stepsPerBar * filter.barsPerChord;
  const windows = Math.ceil(totalSteps / windowSteps);

  // 구간별 멜로디 음이름 무게 (울리는 길이만큼)
  const weights = Array.from({ length: windows }, () => new Float64Array(12));
  score.starts.forEach((events, step) => {
    events?.forEach((e) => {
      for (let t = step; t < step + e.dur && t < totalSteps; t++) weights[Math.floor(t / windowSteps)][e.midi % 12] += e.velocity;
    });
  });

  // 구간마다 화음 고르기
  let prev: Chord | null = null;
  for (let w = 0; w < windows; w++) {
    const wt = weights[w];
    const total = wt.reduce((a, b) => a + b, 0);
    const templateDegree = filter.template[w % filter.template.length];
    let best = palette.find((c) => c.degree === templateDegree) ?? palette[0];
    if (total > 0) {
      let bestScore = -Infinity;
      for (const c of palette) {
        const tones = c.tones.map((t) => (c.root + t) % 12);
        let score = tones.reduce((a, pc) => a + wt[pc], 0) / total; // 멜로디를 얼마나 감싸는지
        score += (0.15 * wt[c.root]) / total; // 근음이 멜로디에 있으면 더 안정적
        if (c.degree === templateDegree) score += 0.35 * s; // 필터 고유 진행 (강도만큼)
        if (w === 0 && c.degree === 1) score += 0.1; // 으뜸화음으로 시작
        if (prev && c.degree === prev.degree) score -= 0.08; // 같은 화음만 이어지지 않게
        if (score > bestScore) {
          bestScore = score;
          best = c;
        }
      }
    }
    out.chords.push(best);
    prev = best;
  }

  // 반주 음표
  const level = 0.4 + 0.6 * s; // 강도만큼 반주 크기
  const at = (bar: number, beat: number) => {
    const st = bar * stepsPerBar + beat * stepsPerBeat;
    return Number.isInteger(st) && st < totalSteps ? st : -1;
  };
  const add = (list: BackingNote[], bar: number, beat: number, beats: number, midi: number, velocity: number) => {
    const step = at(bar, beat);
    if (step < 0) return;
    const dur = Math.max(1, Math.min(Math.round(beats * stepsPerBeat), totalSteps - step));
    list.push({ step, dur, midi, velocity: velocity * level });
  };
  const bars = Math.ceil(totalSteps / stepsPerBar);
  const usePad = s >= 0.2;
  const useDrums = s >= 0.4;

  for (let bar = 0; bar < bars; bar++) {
    const chord = out.chords[Math.floor(bar / filter.barsPerChord)];
    const bassRoot = BASS_LOW + chord.root;
    const fifth = bassRoot + 7;

    switch (filter.bass) {
      case 'whole': add(out.bass, bar, 0, 4, bassRoot, 0.6); break;
      case 'half': add(out.bass, bar, 0, 2, bassRoot, 0.6); add(out.bass, bar, 2, 2, bassRoot, 0.5); break;
      case 'rootFifth': add(out.bass, bar, 0, 2, bassRoot, 0.6); add(out.bass, bar, 2, 2, fifth, 0.5); break;
      case 'pulse': for (let b = 0; b < 4; b++) add(out.bass, bar, b, 1, bassRoot, b === 0 ? 0.6 : 0.45); break;
      default: break;
    }

    if (usePad) {
      // 코드음을 PAD_LOW 위 한 옥타브 안에 모아서 (자리바꿈) 매끄럽게
      const padNotes = chord.tones.map((t) => PAD_LOW + ((chord.root + t - PAD_LOW % 12 + 24) % 12)).sort((a, b) => a - b);
      if (filter.pad === 'sustain') {
        for (const m of padNotes) add(out.pad, bar, 0, 4, m, 0.28);
      } else if (filter.pad === 'arp') {
        // 코드음을 위로 펼쳐 반 박마다 하나씩 (오르골처럼 한 옥타브 위)
        const arp = [...padNotes, ...padNotes.map((m) => m + 12)].map((m) => m + 12);
        for (let i = 0; i < 8; i++) add(out.pad, bar, i / 2, 0.5, arp[i % arp.length], 0.3);
      }
    }

    if (useDrums && filter.drums) {
      for (const d of drumPattern(filter.drums, score.features.busy)) {
        for (const beat of d.beats) {
          const step = at(bar, beat);
          if (step >= 0) out.drums.push({ step, kind: d.kind, velocity: d.velocity * level });
        }
      }
    }
  }
  return out;
}
