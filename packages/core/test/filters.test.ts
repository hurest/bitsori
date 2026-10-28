import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS, FILTERS, SCALES, arrange, buildScore, getFilter, midiToImage as M, parseChord, parseMidi,
  pitchTable, scoreToMidi, settingsFromMeta, toSample,
} from '../src';
import { fakeImage, scoreDigest } from './helpers';

describe('음계', () => {
  it('반음계 표는 이전 규칙(12음 × 옥타브)과 같다', () => {
    expect(pitchTable(1, 4)).toEqual(Array.from({ length: 48 }, (_, i) => 24 + i));
  });
  it('C 장조 5음계는 도·레·미·솔·라만', () => {
    expect(pitchTable(4, 4, 'majorPentatonic', 0)).toEqual([60, 62, 64, 67, 69]);
  });
  it('필터를 쓰면 모든 멜로디 음이 그 음계에 속한다', () => {
    const sample = toSample(fakeImage(24, 12, 3));
    for (const f of FILTERS) {
      const s = buildScore(sample, { ...DEFAULT_SETTINGS, ...f.suggested, filter: f.id });
      const allowed = new Set(SCALES[f.scale].map((x) => (x + f.key) % 12));
      for (const ev of s.starts.flat()) if (ev) expect(allowed.has(ev.midi % 12)).toBe(true);
    }
  });
});

describe('반주', () => {
  it('코드 이름 해석', () => {
    expect(parseChord('Am7')).toEqual({ root: 9, tones: [0, 3, 7, 10] });
    expect(parseChord('F#')).toEqual({ root: 6, tones: [0, 4, 7] });
  });
  it('팝 필터: 마디마다 베이스 2음·코드 3음, 드럼은 곡 길이 안', () => {
    const a = arrange(16, '8n', getFilter('pop')); // 8칸 = 1마디 → 2마디
    expect(a.stepsPerBar).toBe(8);
    expect(a.bass.map((n) => [n.step, n.midi])).toEqual([[0, 36], [4, 43], [8, 43], [12, 50]]); // C, G | G, D
    expect(a.pad.filter((n) => n.step === 0).map((n) => n.midi)).toEqual([48, 52, 55]);
    expect(a.drums.every((d) => d.step < 16)).toBe(true);
    expect(a.drums.filter((d) => d.kind === 'kick').map((d) => d.step)).toEqual([0, 4, 8, 12]);
  });
  it('원본 필터는 반주가 없다', () => {
    const a = arrange(64, '8n', getFilter('none'));
    expect([a.bass.length, a.pad.length, a.drums.length]).toEqual([0, 0, 0]);
  });
  it('4분음표 단위에서는 반 박 하이햇을 건너뛴다', () => {
    const a = arrange(4, '4n', getFilter('pop'));
    expect(a.drums.filter((d) => d.kind === 'hat').map((d) => d.step)).toEqual([0, 1, 2, 3]);
  });
});

describe('필터 + MIDI 왕복', () => {
  for (const f of FILTERS) {
    it(`${f.label}: 반주 트랙이 있어도 이미지가 그대로 돌아온다`, () => {
      const opts = { ...DEFAULT_SETTINGS, ...f.suggested, filter: f.id };
      const score = buildScore(toSample(fakeImage(16, 10, 11)), opts);
      const meta = { app: 'bitsori', version: 1, ...opts, length: score.length, lines: score.lineCount };
      const parsed = parseMidi(scoreToMidi(score, { bpm: opts.bpm, unit: opts.unit, meta, filter: f.id }));
      const m = parsed.meta!;
      const q = M.quantize(parsed, m.unit!, { maxTrack: m.chord });
      const { grid, dropped } = M.allocate(q, m.chord!, true);
      expect(dropped).toBe(0);
      const img = M.render({
        grid, steps: q.steps, chord: opts.chord, startOct: opts.startOct, endOct: opts.endOct, direction: opts.direction,
        length: m.length!, lines: m.lines, colorMode: 'rainbow', restThreshold: opts.restThreshold, scale: f.scale, key: f.key,
      });
      expect(img.clamped).toBe(0);
      expect(scoreDigest(buildScore(toSample(img), opts))).toBe(scoreDigest(score));
    });
  }
});

describe('메타정보', () => {
  it('필터 필드가 없는 옛 파일은 원본 필터로 읽는다', () => {
    expect(settingsFromMeta({ app: 'rainbow-string', version: 1, chord: 3 }).filter).toBe('none');
    expect(settingsFromMeta({ app: 'bitsori', version: 1, filter: 'lofi' }).filter).toBe('lofi');
    expect(settingsFromMeta({ app: 'bitsori', version: 1, filter: '없는필터' }).filter).toBe('none');
  });
});
