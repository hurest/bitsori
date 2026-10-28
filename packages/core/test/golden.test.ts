// 웹·앱 결과 일치 기준 (PRD E-10).
// 같은 입력 + 같은 설정 → 같은 악보여야 한다. 변환 규칙을 일부러 바꿀 때만 스냅샷을 갱신한다 (vitest -u).
import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, FILTERS, arrange, buildScore, toSample } from '../src';
import { fakeImage, scoreDigest } from './helpers';

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(16);
}

describe('golden', () => {
  const sample = toSample(fakeImage(32, 21, 7));
  it('기본 설정', () => {
    const s = buildScore(sample, DEFAULT_SETTINGS);
    expect({ notes: s.noteEvents, steps: s.totalSteps, digest: hash(scoreDigest(s)) }).toMatchSnapshot();
  });
  for (const f of FILTERS) {
    it(`필터: ${f.label}`, () => {
      const opts = { ...DEFAULT_SETTINGS, ...f.suggested, filter: f.id };
      const s = buildScore(sample, opts);
      const chords = arrange(s, opts.unit, f, { strength: opts.strength }).chords.map((c) => c.degree).join('');
      expect({ notes: s.noteEvents, steps: s.totalSteps, key: s.key, mode: s.mode, chords, digest: hash(scoreDigest(s)) }).toMatchSnapshot();
    });
  }
});
