// 멜로디 악기의 실제 소리. 목록(이름·이모지·MIDI 번호)은 @bitsori/core의 INSTRUMENT_INFO에 있고,
// 여기서는 id마다 Tone.js 악기를 만든다. 새 악기는 두 곳에 같은 id로 추가한다.
import * as Tone from 'tone';
import { DEFAULT_INSTRUMENT_ID, INSTRUMENT_INFO } from '@bitsori/core';

export interface MelodyInstrument {
  triggerAttackRelease(note: string, duration: number, time?: number, velocity?: number): unknown;
  releaseAll?(time?: number): unknown;
  connect(node: Tone.InputNode): unknown;
  dispose(): unknown;
}

export interface InstrumentDef {
  label: string;
  /** samplesBaseUrl: 샘플 폴더 주소 (예: https://…/samples/) */
  create(samplesBaseUrl: string): MelodyInstrument;
}

/** 녹음 샘플 악기: 파일 이름 'Cs5' → 음 이름 'C#5'. 사이 음은 가까운 샘플의 음높이를 옮겨 채운다. */
function sampled(folder: string, files: string[], { release = 1, volume = 0 } = {}) {
  return (samplesBaseUrl: string) => {
    const urls = Object.fromEntries(files.map((f) => [f.replace('s', '#'), `${f}.mp3`]));
    const s = new Tone.Sampler({ urls, baseUrl: `${samplesBaseUrl}${folder}/`, release });
    s.volume.value = volume;
    return s;
  };
}

const PIANO_FILES = ['A0', 'C8', ...[1, 2, 3, 4, 5, 6, 7].flatMap((o) => [`C${o}`, `Ds${o}`, `Fs${o}`, `A${o}`])];

const CREATORS: Record<string, (samplesBaseUrl: string) => MelodyInstrument> = {
  piano: sampled('piano', PIANO_FILES, { release: 0.8 }),
  guitar: sampled('guitar-nylon', ['E2', 'A2', 'D3', 'G3', 'B3', 'E4', 'A4', 'Cs5', 'E5', 'A5'], { release: 1.2, volume: -2 }),
  violin: sampled('violin', ['G3', 'C4', 'E4', 'A4', 'C5', 'E5', 'A5', 'C6', 'E6', 'A6', 'C7'], { release: 0.6, volume: -6 }),
  harp: sampled('harp', ['B1', 'F2', 'C3', 'G3', 'D4', 'A4', 'E5', 'B5', 'F6'], { release: 1.6, volume: -2 }),
  xylophone: sampled('xylophone', ['G4', 'C5', 'G5', 'C6', 'G6', 'C7', 'G7', 'C8'], { release: 0.8, volume: -4 }),
  // 합성음: 샘플이 필요 없다
  epiano: () => new Tone.PolySynth(Tone.FMSynth, {
    harmonicity: 3,
    modulationIndex: 2.2,
    oscillator: { type: 'sine' },
    envelope: { attack: 0.005, decay: 1.4, sustain: 0.15, release: 1.2 },
    modulation: { type: 'sine' },
    modulationEnvelope: { attack: 0.005, decay: 0.6, sustain: 0, release: 0.5 },
    volume: -8,
  }),
  synth: () => new Tone.PolySynth(Tone.MonoSynth, {
    oscillator: { type: 'sawtooth' },
    filter: { Q: 1, type: 'lowpass', rolloff: -24 },
    envelope: { attack: 0.01, decay: 0.25, sustain: 0.4, release: 0.4 },
    filterEnvelope: { attack: 0.01, decay: 0.3, sustain: 0.3, release: 0.5, baseFrequency: 300, octaves: 3 },
    volume: -16,
  }),
};

export const INSTRUMENTS: Record<string, InstrumentDef> = Object.fromEntries(
  INSTRUMENT_INFO.filter((i) => CREATORS[i.id]).map((i) => [i.id, { label: `${i.emoji} ${i.label}`, create: CREATORS[i.id] }]),
);

export const DEFAULT_INSTRUMENT = DEFAULT_INSTRUMENT_ID;
