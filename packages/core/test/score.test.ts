import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, buildScore, countSteps, toSample } from '../src';
import { graySample } from './helpers';

const base = { ...DEFAULT_SETTINGS };

describe('buildScore', () => {
  it('묶음·쉼표·같은 음 이어 끌기', () => {
    // 4×10, 5화음, 1~3옥타브: 열 2는 어두워서 쉼표, 위 8픽셀은 흰색, 나머지는 회색
    const w = 4, h = 10;
    const v = Array.from({ length: w * h }, (_, i) => (i % 4 === 2 ? 10 : i < 8 ? 255 : 128));
    const s = buildScore(graySample(w, h, v), { ...base, chord: 5, startOct: 1, endOct: 3 });
    expect(s.totalSteps).toBe(8);
    expect(s.groups).toBe(2);
    expect([s.lowNote, s.highNote]).toEqual(['C1', 'B3']);
    expect(s.restRatio).toBe(0.25);
    expect(s.starts[0]!.map((e) => `${e.note}x${e.dur}`)).toEqual(['B3x2', 'B3x2', 'E2x2', 'E2x2', 'E2x2']);
    expect(s.starts[1]).toBeUndefined(); // 이어 끌기
    expect(s.starts[2]).toBeUndefined(); // 쉼표
  });

  it('세로 방향은 열을 묶어 위에서 아래로 진행', () => {
    const s = buildScore(graySample(3, 2, [255, 128, 60, 255, 128, 60]), {
      ...base, chord: 2, startOct: 1, endOct: 1, restThreshold: 0, direction: 'vertical',
    });
    expect(s.totalSteps).toBe(4);
    expect(s.starts.map((e) => e?.map((x) => `${x.note}x${x.dur}`))).toEqual([['B1x2', 'F#1x2'], undefined, ['D1x2'], undefined]);
  });

  it('쉼표 색과 비슷한 픽셀은 쉼표', () => {
    const s = buildScore(graySample(3, 2, [255, 128, 60, 255, 128, 60]), {
      ...base, chord: 2, startOct: 1, endOct: 1, restThreshold: 0, restColors: [{ r: 128, g: 128, b: 128 }], colorTolerance: 5,
    });
    expect(Array.from(s.restMask)).toEqual([0, 1, 0, 0, 1, 0]);
  });

  it('countSteps는 방향과 상관없이 칸 수를 센다', () => {
    expect(countSteps(200, 500, 5)).toBe(20000);
    expect(countSteps(200, 500, 5, 'vertical')).toBe(20000);
  });
});

describe('toSample', () => {
  it('ImageData처럼 getter로 된 픽셀 객체도 받는다', () => {
    class FakeImageData {
      #d = new Uint8ClampedArray([255, 255, 255, 255, 0, 0, 0, 0]);
      get width() { return 2; }
      get height() { return 1; }
      get data() { return this.#d; }
    }
    const s = toSample(new FakeImageData());
    expect([s.width, s.height, Array.from(s.brightness)]).toEqual([2, 1, [255, -1]]);
  });
});
