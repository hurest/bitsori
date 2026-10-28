import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS, FILTERS, SCENES, buildScore, midiToImage as M, parseMidi, scoreToMidi, toSample, type Settings,
} from '../src';
import { fakeImage, scoreDigest } from './helpers';

// 사진 → 노래 → MIDI → (장면으로 칠한) 사진 → 노래 가 처음 노래와 같아야 한다
function roundTrip(opts: Settings, sceneId: string, seed: number, restStyle: 'dark' | 'color' = 'dark') {
  // 쉼표도 장면 색: 어두운 픽셀 규칙을 끄고(0), 쉼표 색으로만 쉼표를 표시한다
  const threshold = restStyle === 'color' ? 0 : opts.restThreshold;
  const tolerance = 5;
  const score = buildScore(toSample(fakeImage(24, 15, seed)), opts);
  const meta = { app: 'bitsori', version: 1, ...opts, key: score.key, mode: score.mode, length: score.length, lines: score.lineCount };
  const parsed = parseMidi(scoreToMidi(score, { bpm: opts.bpm, unit: opts.unit, meta, filter: opts.filter }));
  const q = M.quantize(parsed, opts.unit, { maxTrack: opts.chord });
  const { grid } = M.allocate(q, opts.chord, true);
  const img = M.render({
    grid, steps: q.steps, chord: opts.chord, startOct: opts.startOct, endOct: opts.endOct, direction: opts.direction,
    length: score.length, lines: score.lineCount, colorMode: 'scene', scene: { id: sceneId, seed, restStyle, colorTolerance: tolerance },
    restThreshold: threshold, scale: score.scale, key: score.scale === 'chromatic' ? 0 : score.key,
  });
  // 다시 읽을 때는 메타정보에 저장될 쉼표 설정을 쓴다
  const again = buildScore(toSample(img), {
    ...opts, key: score.key, mode: score.mode,
    ...(restStyle === 'color' ? { restThreshold: 0, restColors: img.restColors, colorTolerance: tolerance } : {}),
  });
  return { score, again, img };
}

describe('장면 색칠', () => {
  const settingsList: Settings[] = [
    DEFAULT_SETTINGS, // 원본: 반음 48개 (밝기 칸이 가장 좁다)
    { ...DEFAULT_SETTINGS, startOct: 1, endOct: 7 }, // 반음 84개: 칸 폭 약 2.8
    ...FILTERS.filter((f) => f.id !== 'none').map((f) => ({ ...DEFAULT_SETTINGS, ...f.suggested, filter: f.id })),
  ];
  for (const scene of SCENES) {
    it(`${scene.emoji} ${scene.label}: 색만 바뀌고 노래는 그대로`, () => {
      for (const opts of settingsList) {
        for (const seed of [1, 42, 9001]) {
          const { score, again } = roundTrip(opts, scene.id, seed);
          expect(scoreDigest(again)).toBe(scoreDigest(score));
        }
      }
    });
  }

  for (const scene of SCENES) {
    it(`${scene.emoji} ${scene.label}: 쉼표도 장면 색으로 칠해도 노래는 그대로`, () => {
      for (const opts of settingsList) {
        for (const seed of [2, 77]) {
          const { score, again, img } = roundTrip(opts, scene.id, seed, 'color');
          expect(img.restColors.length).toBe(3);
          expect(scoreDigest(again)).toBe(scoreDigest(score));
          expect(Array.from(again.restMask)).toEqual(Array.from(score.restMask)); // 쉼표 자리도 그대로
        }
      }
    });
  }

  it('쉼표도 장면 색이면 어두운 쉼표가 없다 (밝은 색으로도 칠해진다)', () => {
    const { img, score } = roundTrip(DEFAULT_SETTINGS, 'pastel', 5, 'color');
    let bright = 0;
    for (let i = 0; i < score.restMask.length; i++) {
      const p = i * 4;
      if (score.restMask[i] && 0.299 * img.data[p] + 0.587 * img.data[p + 1] + 0.114 * img.data[p + 2] > 60) bright++;
    }
    expect(bright).toBeGreaterThan(0);
  });

  it('같은 시드면 같은 그림, 다른 시드면 다른 그림', () => {
    const a = roundTrip(DEFAULT_SETTINGS, 'sunset', 7).img.data;
    const b = roundTrip(DEFAULT_SETTINGS, 'sunset', 7).img.data;
    const c = roundTrip(DEFAULT_SETTINGS, 'sunset', 8).img.data;
    expect(Buffer.from(a).equals(Buffer.from(b))).toBe(true);
    expect(Buffer.from(a).equals(Buffer.from(c))).toBe(false);
  });

  it('쉼표는 순수한 검정이 아니라 어두운 장면 색', () => {
    const { img, score } = roundTrip(DEFAULT_SETTINGS, 'ocean', 3);
    const colored = [];
    for (let i = 0; i < score.restMask.length; i++) {
      const p = i * 4;
      if (score.restMask[i] && img.data[p] + img.data[p + 1] + img.data[p + 2] > 0) colored.push(i);
    }
    expect(colored.length).toBeGreaterThan(0);
  });
});
