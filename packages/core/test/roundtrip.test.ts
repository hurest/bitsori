import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS, buildScore, midiToImage as M, parseMidi, scoreToMidi, toSample,
  type ColorMode, type Direction, type Unit,
} from '../src';
import { fakeImage, scoreDigest } from './helpers';

// 이미지 → 악보 → MIDI → 이미지 → 악보 가 처음 악보와 같아야 한다
const cases: [number, number, number, Direction, number, number, Unit][] = [
  [20, 13, 5, 'horizontal', 1, 4, '8n'],
  [17, 9, 3, 'vertical', 2, 7, '16n'],
  [8, 8, 1, 'horizontal', 1, 7, '4n'],
  [33, 7, 16, 'vertical', 3, 5, '8n'],
];

describe('이미지 ↔ MIDI 왕복', () => {
  for (const [w, h, chord, direction, startOct, endOct, unit] of cases) {
    for (const colorMode of ['rainbow', 'gray'] as ColorMode[]) {
      it(`${w}×${h} ${direction} ${chord}화음 ${startOct}~${endOct}옥타브 ${unit} ${colorMode}`, () => {
        const opts = { ...DEFAULT_SETTINGS, chord, direction, startOct, endOct };
        const score = buildScore(toSample(fakeImage(w, h, w * h + chord)), opts);
        const meta = { app: 'bitsori', version: 1, ...opts, bpm: 100, unit, length: score.length, lines: score.lineCount };
        const parsed = parseMidi(scoreToMidi(score, { bpm: 100, unit, meta }));

        expect(parsed.bpm).toBeCloseTo(100, 5);
        const m = parsed.meta!;
        expect(m.chord).toBe(chord);
        const q = M.quantize(parsed, m.unit!);
        const { grid, dropped, merged } = M.allocate(q, m.chord!, m.voiceTracks);
        expect([dropped, merged]).toEqual([0, 0]);
        const img = M.render({
          grid, steps: q.steps, chord, startOct, endOct, direction, length: m.length!, lines: m.lines,
          colorMode, restThreshold: DEFAULT_SETTINGS.restThreshold,
        });
        expect([img.width, img.height]).toEqual([w, h]);
        expect(scoreDigest(buildScore(toSample(img), opts))).toBe(scoreDigest(score));
      });
    }
  }
});

describe('메타정보 없는 MIDI', () => {
  it('같은 음 연타는 다른 줄에 배정해 합쳐지지 않게 한다', async () => {
    const { writeMidi } = await import('../src');
    const bytes = writeMidi({
      bpm: 90,
      voices: [{ name: 'p', channel: 0, notes: [
        { midi: 60, tick: 0, dur: 480, velocity: 90 }, { midi: 64, tick: 0, dur: 960, velocity: 90 },
        { midi: 60, tick: 480, dur: 480, velocity: 90 }, { midi: 67, tick: 480, dur: 480, velocity: 90 },
      ] }],
    });
    const parsed = parseMidi(bytes);
    expect(parsed.meta).toBeNull();
    const q = M.quantize(parsed, '4n');
    expect(q.maxPoly).toBe(3);
    const a = M.allocate(q, q.maxPoly);
    expect(Array.from(a.grid)).toEqual([64, 64, 60, 67, -1, 60]);
    expect([a.dropped, a.merged]).toEqual([0, 0]);
  });

  it('드럼 채널은 제외', async () => {
    const { writeMidi } = await import('../src');
    const bytes = writeMidi({ voices: [
      { name: 'drum', channel: 9, notes: [{ midi: 36, tick: 0, dur: 120, velocity: 100 }] },
      { name: 'piano', channel: 0, notes: [{ midi: 60, tick: 0, dur: 120, velocity: 100 }] },
    ] });
    const q = M.quantize(parseMidi(bytes), '16n');
    expect([q.notes.length, q.drums]).toEqual([1, 1]);
  });
});
