// 표준 MIDI 파일(.mid) 읽기/쓰기. 외부 라이브러리 없이 바이너리를 직접 다룬다.
import { LEGACY_META_APPS, META_APP, isBitsoriMeta, type BitsoriMeta } from './meta';

export interface MidiNote {
  midi: number;
  startTick: number;
  endTick: number;
  velocity: number;
  channel: number;
  track: number;
}

export interface ParsedMidi {
  format: number;
  trackCount: number;
  ppq: number;
  notes: MidiNote[];
  tempos: { tick: number; bpm: number }[];
  texts: string[];
  trackNames: string[];
  meta: Partial<BitsoriMeta> | null;
  /** 첫 템포 (없으면 120) */
  bpm: number;
}

export interface MidiVoice {
  name: string;
  channel: number;
  notes: { midi: number; tick: number; dur: number; velocity: number }[];
}

const META_PREFIXES = [META_APP, ...LEGACY_META_APPS].map((a) => `${a}:`);
const utf8 = new TextDecoder('utf-8');
const encoder = new TextEncoder();

export function parseMidi(buffer: ArrayBuffer | Uint8Array): ParsedMidi {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const str4 = (p: number) => String.fromCharCode(...bytes.subarray(p, p + 4));
  if (bytes.length < 14 || str4(0) !== 'MThd') throw new Error('MIDI 파일이 아니에요.');

  const headerLen = view.getUint32(4);
  const format = view.getUint16(8);
  const trackCount = view.getUint16(10);
  const division = view.getUint16(12);
  if (division & 0x8000) throw new Error('SMPTE 시간 형식의 MIDI는 지원하지 않아요.');

  const notes: MidiNote[] = [];
  const tempos: { tick: number; bpm: number }[] = [];
  const texts: string[] = [];
  const trackNames: string[] = [];
  let p = 8 + headerLen;
  let track = 0;

  while (p + 8 <= bytes.length && track < trackCount) {
    const type = str4(p);
    const len = view.getUint32(p + 4);
    p += 8;
    const end = Math.min(bytes.length, p + len);
    if (type !== 'MTrk') {
      p = end;
      continue;
    }

    let tick = 0;
    let running = 0;
    // `${channel}:${pitch}` → 눌린 음 목록 (먼저 눌린 음부터 끈다)
    const open = new Map<string, { tick: number; velocity: number }[]>();
    const vlq = () => {
      let v = 0;
      let b: number;
      do {
        b = bytes[p++];
        v = (v << 7) | (b & 0x7f);
      } while (b & 0x80 && p < end);
      return v;
    };

    while (p < end) {
      tick += vlq();
      let status = bytes[p];
      if (status & 0x80) p++;
      else status = running; // running status: 이전 상태 바이트 재사용

      if (status === 0xff) {
        const metaType = bytes[p++];
        const l = vlq();
        const data = bytes.subarray(p, p + l);
        p += l;
        if (metaType === 0x51 && l === 3) {
          tempos.push({ tick, bpm: 60e6 / ((data[0] << 16) | (data[1] << 8) | data[2]) });
        } else if (metaType === 0x01) {
          texts.push(utf8.decode(data));
        } else if (metaType === 0x03) {
          trackNames[track] = utf8.decode(data);
        } else if (metaType === 0x2f) {
          break;
        }
        running = 0;
      } else if (status === 0xf0 || status === 0xf7) {
        p += vlq();
        running = 0;
      } else if (status >= 0x80) {
        running = status;
        const kind = status & 0xf0;
        const channel = status & 0x0f;
        const a = bytes[p++];
        const b = kind === 0xc0 || kind === 0xd0 ? 0 : bytes[p++];
        const key = `${channel}:${a}`;
        if (kind === 0x90 && b > 0) {
          if (!open.has(key)) open.set(key, []);
          open.get(key)!.push({ tick, velocity: b });
        } else if (kind === 0x80 || kind === 0x90) {
          const on = open.get(key)?.shift();
          if (on) notes.push({ midi: a, startTick: on.tick, endTick: tick, velocity: on.velocity, channel, track });
        }
      } else {
        p++; // 알 수 없는 바이트는 건너뜀
      }
    }
    // 끝나지 않은 음은 트랙 끝에서 끈다
    for (const [key, list] of open) {
      const [channel, midi] = key.split(':').map(Number);
      for (const on of list) notes.push({ midi, startTick: on.tick, endTick: tick, velocity: on.velocity, channel, track });
    }
    p = end;
    track++;
  }

  notes.sort((x, y) => x.startTick - y.startTick || y.midi - x.midi);
  tempos.sort((x, y) => x.tick - y.tick);

  let meta: Partial<BitsoriMeta> | null = null;
  for (const t of texts) {
    const prefix = META_PREFIXES.find((pre) => t.startsWith(pre));
    if (!prefix) continue;
    try {
      const m: unknown = JSON.parse(t.slice(prefix.length));
      if (isBitsoriMeta(m)) meta = m;
    } catch {
      /* 깨진 메타는 무시 */
    }
  }

  return {
    format, trackCount: track, ppq: division, notes, tempos, texts, trackNames, meta,
    bpm: tempos.length ? tempos[0].bpm : 120,
  };
}

/** 트랙 0에는 제목·메타·템포, 트랙 1부터 줄(성부)별 음을 담는다 (Format 1) */
export function writeMidi({
  ppq = 480, bpm = 120, title = 'Bitsori', meta = null, voices,
}: {
  ppq?: number;
  bpm?: number;
  title?: string;
  meta?: object | null;
  voices: MidiVoice[];
}): Uint8Array {
  type Ev = { tick: number; order: number; data: number[] };
  const metaEvent = (type: number, data: ArrayLike<number>) => [0xff, type, ...vlqBytes(data.length), ...Array.from(data)];
  const tracks: Ev[][] = [];

  const conductor: Ev[] = [{ tick: 0, order: 0, data: metaEvent(0x03, encoder.encode(title)) }];
  if (meta) conductor.push({ tick: 0, order: 0, data: metaEvent(0x01, encoder.encode(`${META_APP}:${JSON.stringify(meta)}`)) });
  const mpq = Math.round(60e6 / bpm);
  conductor.push({ tick: 0, order: 0, data: metaEvent(0x51, [(mpq >> 16) & 0xff, (mpq >> 8) & 0xff, mpq & 0xff]) });
  conductor.push({ tick: 0, order: 0, data: metaEvent(0x58, [4, 2, 24, 8]) });
  tracks.push(conductor);

  for (const v of voices) {
    const ch = v.channel & 0x0f;
    const events: Ev[] = [
      { tick: 0, order: 0, data: metaEvent(0x03, encoder.encode(v.name)) },
      { tick: 0, order: 0, data: [0xc0 | ch, 0] }, // 피아노
    ];
    for (const n of v.notes) {
      events.push({ tick: n.tick, order: 2, data: [0x90 | ch, n.midi, n.velocity] });
      events.push({ tick: n.tick + n.dur, order: 1, data: [0x80 | ch, n.midi, 0] }); // 같은 시점이면 끄기 먼저
    }
    tracks.push(events);
  }

  const chunks: Uint8Array[] = [];
  const header = new Uint8Array(14);
  const hv = new DataView(header.buffer);
  header.set(encoder.encode('MThd'), 0);
  hv.setUint32(4, 6);
  hv.setUint16(8, 1);
  hv.setUint16(10, tracks.length);
  hv.setUint16(12, ppq);
  chunks.push(header);

  for (const events of tracks) {
    events.sort((a, b) => a.tick - b.tick || a.order - b.order);
    const body: number[] = [];
    let last = 0;
    for (const e of events) {
      body.push(...vlqBytes(e.tick - last), ...e.data);
      last = e.tick;
    }
    body.push(0, 0xff, 0x2f, 0);
    const chunk = new Uint8Array(8 + body.length);
    chunk.set(encoder.encode('MTrk'), 0);
    new DataView(chunk.buffer).setUint32(4, body.length);
    chunk.set(body, 8);
    chunks.push(chunk);
  }
  return concat(chunks);
}

function vlqBytes(value: number): number[] {
  const out = [value & 0x7f];
  while ((value >>= 7)) out.unshift((value & 0x7f) | 0x80);
  return out;
}

export function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, a) => n + a.length, 0));
  let p = 0;
  for (const a of parts) {
    out.set(a, p);
    p += a.length;
  }
  return out;
}
