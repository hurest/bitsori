import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SETTINGS, FILTERS, SCALES, analyzePhoto, arrange, buildScore, diatonicChords, getFilter, keyFromPhoto,
  midiToImage as M, parseMidi, pitchTable, scoreToMidi, settingsFromMeta, tempoFromPhoto, toSample,
  type PixelData,
} from '../src';
import { fakeImage, scoreDigest } from './helpers';

/** 한 가지 색(약간의 무늬 포함)으로 채운 이미지 */
function tinted(w: number, h: number, rgb: [number, number, number], seed = 1): PixelData {
  const base = fakeImage(w, h, seed);
  const data = new Uint8ClampedArray(base.data.length);
  for (let i = 0; i < w * h; i++) {
    const k = base.data[i * 4 + 1] / 255; // 무늬 밝기
    data.set([rgb[0] * (0.4 + 0.6 * k), rgb[1] * (0.4 + 0.6 * k), rgb[2] * (0.4 + 0.6 * k), 255], i * 4);
  }
  return { width: w, height: h, data };
}

const pop = { ...DEFAULT_SETTINGS, ...getFilter('pop').suggested, filter: 'pop' };

describe('사진 분석', () => {
  it('주된 색 → 조 (5도권), 무채색 → C', () => {
    const red = analyzePhoto(toSample(tinted(16, 16, [230, 40, 40])));
    const yellow = analyzePhoto(toSample(tinted(16, 16, [230, 220, 40])));
    const gray = analyzePhoto(toSample(tinted(16, 16, [150, 150, 150])));
    expect(keyFromPhoto(red)).toBe(0); // C
    expect(keyFromPhoto(yellow)).toBe(2); // D
    expect(keyFromPhoto(gray)).toBe(0);
  });
  it('밝고 따뜻하면 장조, 어둡고 차가우면 단조', () => {
    const warm = buildScore(toSample(tinted(16, 16, [255, 200, 120])), pop);
    const cold = buildScore(toSample(tinted(16, 16, [20, 40, 110])), pop);
    expect([warm.mode, cold.mode]).toEqual(['major', 'minor']);
  });
  it('복잡한 사진일수록 빠르게 (±15%)', () => {
    expect(tempoFromPhoto(100, { hue: null, saturation: 0, brightness: 0.5, warmth: 0, busy: 0 })).toBe(85);
    expect(tempoFromPhoto(100, { hue: null, saturation: 0, brightness: 0.5, warmth: 0, busy: 1 })).toBe(115);
  });
});

describe('같은 필터, 다른 사진 → 다른 노래', () => {
  const sunset = toSample(tinted(32, 21, [250, 140, 60], 5));
  const ocean = toSample(tinted(32, 21, [30, 90, 200], 9));
  it('조·장단조·코드 진행이 달라진다', () => {
    const a = buildScore(sunset, pop);
    const b = buildScore(ocean, pop);
    expect(`${a.key}${a.mode}`).not.toBe(`${b.key}${b.mode}`);
    const ca = arrange(a, '8n', getFilter('pop'), { strength: 70 }).chords.map((c) => c.root);
    const cb = arrange(b, '8n', getFilter('pop'), { strength: 70 }).chords.map((c) => c.root);
    expect(ca.join()).not.toBe(cb.join());
  });
  it('필터가 장단조를 고정하면 사진과 상관없이 그 조성', () => {
    const cinema = { ...pop, ...getFilter('cinema').suggested, filter: 'cinema' };
    expect(buildScore(sunset, cinema).mode).toBe('minor');
  });
  it('직접 고른 조·장단조가 사진보다 우선', () => {
    const s = buildScore(sunset, { ...pop, key: 9, mode: 'minor' });
    expect([s.key, s.mode, s.scale]).toEqual([9, 'minor', 'minorPentatonic']);
  });
  it('음 세기는 픽셀의 채도를 따른다', () => {
    const vivid = buildScore(toSample(tinted(8, 8, [255, 0, 0])), pop);
    const dull = buildScore(toSample(tinted(8, 8, [150, 140, 140])), pop);
    const avg = (s: typeof vivid) => {
      const v = s.starts.flat().filter(Boolean).map((e) => e!.velocity);
      return v.reduce((a, b) => a + b, 0) / v.length;
    };
    expect(avg(vivid)).toBeGreaterThan(avg(dull) + 0.2);
  });
});

describe('음계', () => {
  it('반음계 표는 원래 규칙(12음 × 옥타브)과 같다', () => {
    expect(pitchTable(1, 4)).toEqual(Array.from({ length: 48 }, (_, i) => 24 + i));
  });
  it('필터를 쓰면 모든 멜로디 음이 그 사진의 조·음계에 속한다', () => {
    const sample = toSample(fakeImage(24, 12, 3));
    for (const f of FILTERS) {
      const s = buildScore(sample, { ...DEFAULT_SETTINGS, ...f.suggested, filter: f.id });
      const allowed = new Set(SCALES[s.scale].map((x) => (x + (s.scale === 'chromatic' ? 0 : s.key)) % 12));
      for (const ev of s.starts.flat()) if (ev) expect(allowed.has(ev.midi % 12)).toBe(true);
    }
  });
});

describe('자동 화성 반주', () => {
  it('멜로디가 도·미·솔이면 그 마디는 C 장조의 I 화음', () => {
    const score = buildScore(toSample(fakeImage(8, 1, 1)), { ...pop, key: 0, mode: 'major', chord: 1 });
    // 멜로디를 직접 C·E·G로 바꿔 넣는다 (8칸 = 1마디)
    score.starts = [60, 64, 67, 64, 60, 67, 64, 60].map((midi) => [{ idx: 0, midi, note: '', dur: 1, voice: 0, velocity: 0.7 }]);
    const a = arrange(score, '8n', getFilter('pop'), { strength: 0.01 });
    expect(a.chords[0].degree).toBe(1);
  });
  it('조 안의 화음만 쓴다 (감화음 제외)', () => {
    expect(diatonicChords(0, 'major', 'triad').map((c) => c.degree)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(diatonicChords(9, 'minor', 'triad').map((c) => c.root)).toEqual([9, 0, 2, 4, 5, 7]);
  });
  it('강도 0이면 반주가 없고, 낮을수록 반주가 작다', () => {
    const score = buildScore(toSample(fakeImage(32, 8, 2)), pop);
    const none = arrange(score, '8n', getFilter('pop'), { strength: 0 });
    expect([none.bass.length, none.pad.length, none.drums.length]).toEqual([0, 0, 0]);
    const low = arrange(score, '8n', getFilter('pop'), { strength: 30 });
    const high = arrange(score, '8n', getFilter('pop'), { strength: 100 });
    expect(low.drums.length).toBe(0); // 40% 미만이면 드럼 없음
    expect(high.bass[0].velocity).toBeGreaterThan(low.bass[0].velocity);
  });
  it('원본 필터는 반주가 없다', () => {
    const score = buildScore(toSample(fakeImage(16, 8, 2)), DEFAULT_SETTINGS);
    const a = arrange(score, '8n', getFilter('none'), { strength: 100 });
    expect([a.bass.length, a.pad.length, a.drums.length]).toEqual([0, 0, 0]);
  });
  it('반주 음표는 곡 길이 안에 있다', () => {
    const score = buildScore(toSample(fakeImage(20, 9, 4)), pop);
    for (const f of FILTERS) {
      const a = arrange(score, '16n', f, { strength: 100 });
      for (const n of [...a.bass, ...a.pad]) expect(n.step + n.dur).toBeLessThanOrEqual(score.totalSteps);
      for (const d of a.drums) expect(d.step).toBeLessThan(score.totalSteps);
    }
  });
});

describe('필터 + MIDI 왕복', () => {
  for (const f of FILTERS) {
    it(`${f.label}: 사진에서 정한 조를 저장하면 이미지가 그대로 돌아온다`, () => {
      const opts = { ...DEFAULT_SETTINGS, ...f.suggested, filter: f.id };
      const score = buildScore(toSample(tinted(16, 10, [80, 200, 120], 11)), opts);
      // 저장할 때는 자동 값 대신 실제로 쓴 조·장단조를 기록한다
      const meta = { app: 'bitsori', version: 1, ...opts, key: score.key, mode: score.mode, length: score.length, lines: score.lineCount };
      const parsed = parseMidi(scoreToMidi(score, { bpm: opts.bpm, unit: opts.unit, meta, filter: f.id }));
      const m = parsed.meta!;
      const back = settingsFromMeta(m as Record<string, unknown>);
      const q = M.quantize(parsed, m.unit!, { maxTrack: m.chord });
      const { grid, dropped } = M.allocate(q, m.chord!, true);
      expect(dropped).toBe(0);
      const img = M.render({
        grid, steps: q.steps, chord: opts.chord, startOct: opts.startOct, endOct: opts.endOct, direction: opts.direction,
        length: m.length!, lines: m.lines, colorMode: 'rainbow', restThreshold: opts.restThreshold,
        scale: score.scale, key: score.scale === 'chromatic' ? 0 : (back.key as number),
      });
      expect(img.clamped).toBe(0);
      // 무지개 이미지는 색이 달라 '자동' 조가 바뀔 수 있으므로, 저장된 조로 다시 읽는다
      const again = buildScore(toSample(img), { ...opts, ...back });
      const pitches = (s: typeof score) => scoreDigest({ starts: s.starts.map((ev) => ev?.map((e) => ({ ...e }))) });
      expect(pitches(again)).toBe(pitches(score));
    });
  }
});

describe('메타정보', () => {
  it('필터 필드가 없는 옛 파일은 원본 필터로 읽는다', () => {
    expect(settingsFromMeta({ app: 'rainbow-string', version: 1, chord: 3 }).filter).toBe('none');
    expect(settingsFromMeta({ app: 'bitsori', version: 1, filter: '없는필터' }).filter).toBe('none');
  });
  it('조가 없는 v0.1 필터 파일은 그때의 고정 조로 읽는다', () => {
    expect(settingsFromMeta({ app: 'bitsori', version: 1, filter: 'pop' })).toMatchObject({ key: 0, mode: 'major' });
    expect(settingsFromMeta({ app: 'bitsori', version: 1, filter: 'cinema' })).toMatchObject({ key: 9, mode: 'minor' });
    expect(settingsFromMeta({ app: 'bitsori', version: 1, filter: 'lofi', key: 4, mode: 'minor' })).toMatchObject({ key: 4, mode: 'minor' });
  });
});
