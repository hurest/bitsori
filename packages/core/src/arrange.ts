// 필터의 반주 만들기: 악보 길이에 맞춰 베이스·코드·드럼 음표를 칸 단위로 만든다.
import { UNIT_BEATS, type Unit } from './constants';
import { parseChord, type FilterDef } from './filters';

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
}

/** General MIDI 드럼 번호 (MIDI 저장용) */
export const GM_DRUMS: Record<DrumKind, number> = { kick: 36, snare: 38, hat: 42 };

const BASS_OCTAVE_C = 36; // C2
const PAD_OCTAVE_C = 48; // C3

// 박 위치(4/4 한 마디 안, 0 = 첫 박)
const DRUMS: Record<'pop' | 'lofi', { kind: DrumKind; beats: number[]; velocity: number }[]> = {
  pop: [
    { kind: 'kick', beats: [0, 2], velocity: 0.8 },
    { kind: 'snare', beats: [1, 3], velocity: 0.55 },
    { kind: 'hat', beats: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5], velocity: 0.25 },
  ],
  lofi: [
    { kind: 'kick', beats: [0, 2.5], velocity: 0.7 },
    { kind: 'snare', beats: [1, 3], velocity: 0.45 },
    { kind: 'hat', beats: [0, 1, 2, 3], velocity: 0.18 },
  ],
};

export function arrange(totalSteps: number, unit: Unit, filter: FilterDef): Arrangement {
  const stepsPerBeat = 1 / UNIT_BEATS[unit];
  const stepsPerBar = 4 * stepsPerBeat;
  const out: Arrangement = { bass: [], pad: [], drums: [], stepsPerBar };
  if (!filter.progression.length || totalSteps <= 0) return out;

  const chords = filter.progression.map(parseChord);
  const bars = Math.ceil(totalSteps / stepsPerBar);
  // 칸 위치 (정수가 아닌 박은 그 단위로 표현할 수 없으므로 건너뜀)
  const at = (bar: number, beat: number) => {
    const s = bar * stepsPerBar + beat * stepsPerBeat;
    return Number.isInteger(s) && s < totalSteps ? s : -1;
  };
  const add = (list: BackingNote[], bar: number, beat: number, beats: number, midi: number, velocity: number) => {
    const step = at(bar, beat);
    if (step < 0) return;
    const dur = Math.max(1, Math.min(Math.round(beats * stepsPerBeat), totalSteps - step));
    list.push({ step, dur, midi, velocity });
  };

  for (let bar = 0; bar < bars; bar++) {
    const { root, tones } = chords[Math.floor(bar / filter.barsPerChord) % chords.length];
    const bassRoot = BASS_OCTAVE_C + root;
    const fifth = bassRoot + 7;

    switch (filter.bass) {
      case 'whole': add(out.bass, bar, 0, 4, bassRoot, 0.6); break;
      case 'half': add(out.bass, bar, 0, 2, bassRoot, 0.6); add(out.bass, bar, 2, 2, bassRoot, 0.5); break;
      case 'rootFifth': add(out.bass, bar, 0, 2, bassRoot, 0.6); add(out.bass, bar, 2, 2, fifth, 0.5); break;
      case 'pulse': for (let b = 0; b < 4; b++) add(out.bass, bar, b, 1, bassRoot, b === 0 ? 0.6 : 0.45); break;
      default: break;
    }

    const padNotes = tones.map((t) => PAD_OCTAVE_C + root + t);
    if (filter.pad === 'sustain') {
      for (const m of padNotes) add(out.pad, bar, 0, 4, m, 0.28);
    } else if (filter.pad === 'arp') {
      // 코드음을 위로 펼쳐 반 박마다 하나씩 (오르골처럼 한 옥타브 위)
      const arp = [...padNotes, padNotes[0] + 12, ...padNotes.slice(1).map((m) => m + 12)].map((m) => m + 12);
      for (let i = 0; i < 8; i++) add(out.pad, bar, i / 2, 0.5, arp[i % arp.length], 0.3);
    }

    if (filter.drums) {
      for (const d of DRUMS[filter.drums]) {
        for (const beat of d.beats) {
          const step = at(bar, beat);
          if (step >= 0) out.drums.push({ step, kind: d.kind, velocity: d.velocity });
        }
      }
    }
  }
  return out;
}
