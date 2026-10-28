import { GM_DRUMS, arrange } from './arrange';
import { UNIT_BEATS, type Unit } from './constants';
import { getFilter } from './filters';
import { getInstrumentInfo } from './instruments';
import { writeMidi, type MidiVoice } from './midi-file';
import type { Score } from './score';

const BASS_CHANNEL = 14;
const PAD_CHANNEL = 15;
const DRUM_CHANNEL = 9;

/**
 * 악보 → MIDI 파일 바이트.
 * 트랙 1~N: 줄(성부)마다 하나씩 — 다시 이미지로 바꿀 때 줄 배치가 그대로 돌아온다.
 * 그 뒤: 필터 반주(베이스·코드·드럼) — 이미지로 되돌릴 때는 쓰지 않는다.
 */
export function scoreToMidi(
  score: Score,
  { bpm, unit, meta, title, filter, strength = 70, instrument }: {
    bpm: number; unit: Unit; meta: object; title?: string; filter?: string; strength?: number; instrument?: string;
  },
) {
  const program = getInstrumentInfo(instrument).gmProgram;
  const ppq = 480;
  const stepTicks = ppq * UNIT_BEATS[unit];
  const voices: MidiVoice[] = Array.from({ length: score.chord }, (_, v) => ({
    name: `Voice ${v + 1}`,
    channel: Math.min(15, v < 9 ? v : v + 1), // 10번 채널(드럼)은 건너뜀
    program,
    notes: [],
  }));
  score.starts.forEach((events, step) => {
    if (!events) return;
    for (const e of events) {
      voices[e.voice].notes.push({ midi: e.midi, tick: step * stepTicks, dur: e.dur * stepTicks, velocity: Math.round(e.velocity * 127) });
    }
  });

  const backing = arrange(score, unit, getFilter(filter), { strength });
  const vel = (v: number) => Math.round(v * 127);
  const toNotes = (list: typeof backing.bass) =>
    list.map((n) => ({ midi: n.midi, tick: n.step * stepTicks, dur: n.dur * stepTicks, velocity: vel(n.velocity) }));
  if (backing.bass.length) voices.push({ name: 'Bass', channel: BASS_CHANNEL, program: 33, notes: toNotes(backing.bass) });
  if (backing.pad.length) voices.push({ name: 'Pad', channel: PAD_CHANNEL, program: 89, notes: toNotes(backing.pad) });
  if (backing.drums.length) {
    voices.push({
      name: 'Drums',
      channel: DRUM_CHANNEL,
      notes: backing.drums.map((d) => ({ midi: GM_DRUMS[d.kind], tick: d.step * stepTicks, dur: Math.max(1, stepTicks / 2), velocity: vel(d.velocity) })),
    });
  }
  return writeMidi({ ppq, bpm, title, meta: { ...meta, voiceTracks: true }, voices });
}
