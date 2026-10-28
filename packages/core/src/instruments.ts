// 멜로디 악기 목록 (이름·MIDI 악기 번호). 실제 소리는 @bitsori/audio가 만든다.
export interface InstrumentInfo {
  id: string;
  label: string;
  emoji: string;
  /** General MIDI 악기 번호 (MIDI 저장 시 사용) */
  gmProgram: number;
  /** 녹음 샘플(용량 있음) / 합성음(용량 없음) */
  kind: 'sampled' | 'synth';
}

export const INSTRUMENT_INFO: InstrumentInfo[] = [
  { id: 'piano', label: '피아노', emoji: '🎹', gmProgram: 0, kind: 'sampled' },
  { id: 'guitar', label: '나일론 기타', emoji: '🎸', gmProgram: 24, kind: 'sampled' },
  { id: 'violin', label: '바이올린', emoji: '🎻', gmProgram: 40, kind: 'sampled' },
  { id: 'harp', label: '하프', emoji: '🎼', gmProgram: 46, kind: 'sampled' },
  { id: 'xylophone', label: '실로폰', emoji: '🎵', gmProgram: 13, kind: 'sampled' },
  { id: 'epiano', label: '일렉트릭 피아노', emoji: '⚡', gmProgram: 4, kind: 'synth' },
  { id: 'synth', label: '신스', emoji: '🎛️', gmProgram: 81, kind: 'synth' },
];

export const DEFAULT_INSTRUMENT_ID = 'piano';

export function getInstrumentInfo(id: string | undefined): InstrumentInfo {
  return INSTRUMENT_INFO.find((i) => i.id === id) ?? INSTRUMENT_INFO[0];
}
