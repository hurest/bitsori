// 멜로디 악기 목록. 새 악기를 추가하려면 이 객체에 항목을 하나 더 넣으면 된다.
// create()는 triggerAttackRelease(note, duration, time, velocity)를 지원하는 Tone.js 악기를 반환해야 한다.
import * as Tone from 'tone';

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

export const INSTRUMENTS: Record<string, InstrumentDef> = {
  piano: {
    label: '피아노',
    create(samplesBaseUrl) {
      const urls: Record<string, string> = { A0: 'A0.mp3', C8: 'C8.mp3' };
      for (let oct = 1; oct <= 7; oct++) {
        urls[`C${oct}`] = `C${oct}.mp3`;
        urls[`D#${oct}`] = `Ds${oct}.mp3`;
        urls[`F#${oct}`] = `Fs${oct}.mp3`;
        urls[`A${oct}`] = `A${oct}.mp3`;
      }
      return new Tone.Sampler({ urls, baseUrl: `${samplesBaseUrl}piano/`, release: 0.8 });
    },
  },
};

export const DEFAULT_INSTRUMENT = 'piano';
