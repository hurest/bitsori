// PNG 파일 안(iTXt 텍스트 영역)에 설정을 JSON으로 저장하고 읽는다.
// 이미지 픽셀은 건드리지 않으므로 보이는 모습은 그대로다.
// 단, SNS 업로드·스크린샷·JPG 변환을 거치면 이 영역이 지워질 수 있다.
import { LEGACY_META_APPS, META_APP, isBitsoriMeta, type BitsoriMeta } from './meta';
import { concat } from './midi-file';

const KEYWORDS = [META_APP, ...LEGACY_META_APPS];
const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];
const encoder = new TextEncoder();
const latin1 = new TextDecoder('latin1');
const utf8 = new TextDecoder('utf-8');

let crcTable: Uint32Array | null = null;
function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function isPng(bytes: Uint8Array): boolean {
  return bytes.length > 8 && PNG_SIGNATURE.every((v, i) => bytes[i] === v);
}

interface Chunk { type: string; start: number; dataStart: number; length: number; end: number }

function chunks(bytes: Uint8Array): Chunk[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const list: Chunk[] = [];
  let p = 8;
  while (p + 12 <= bytes.length) {
    const length = view.getUint32(p);
    const type = String.fromCharCode(...bytes.subarray(p + 4, p + 8));
    const end = p + 12 + length;
    if (end > bytes.length) break;
    list.push({ type, start: p, dataStart: p + 8, length, end });
    p = end;
    if (type === 'IEND') break;
  }
  return list;
}

function makeChunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  out.set(encoder.encode(type), 4);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** 텍스트 청크(iTXt/tEXt)에서 키워드와 본문을 꺼낸다 */
function readTextChunk(bytes: Uint8Array, c: Chunk): { keyword: string; text: string | null } | null {
  const data = bytes.subarray(c.dataStart, c.dataStart + c.length);
  const k = data.indexOf(0);
  if (k < 0) return null;
  const keyword = latin1.decode(data.subarray(0, k));
  if (c.type === 'tEXt') return { keyword, text: latin1.decode(data.subarray(k + 1)) };
  // iTXt: keyword\0 압축여부 압축방식 언어\0 번역키워드\0 본문
  if (data[k + 1] !== 0) return { keyword, text: null }; // 압축된 iTXt는 쓰지 않음
  let p = k + 3;
  p = data.indexOf(0, p) + 1; // 언어 태그
  p = data.indexOf(0, p) + 1; // 번역된 키워드
  if (p <= 0) return null;
  return { keyword, text: utf8.decode(data.subarray(p)) };
}

/** PNG 바이트에 설정 JSON을 넣어 새 바이트를 돌려준다 (기존 빛소리 메타 청크는 교체) */
export function writePngMeta(pngBytes: ArrayBuffer | Uint8Array, meta: object): Uint8Array {
  const bytes = pngBytes instanceof Uint8Array ? pngBytes : new Uint8Array(pngBytes);
  if (!isPng(bytes)) throw new Error('PNG 파일이 아니에요.');
  const keep = chunks(bytes).filter((c) => {
    if (c.type !== 'iTXt' && c.type !== 'tEXt') return true;
    return !KEYWORDS.includes(readTextChunk(bytes, c)?.keyword ?? '');
  });
  const text = encoder.encode(JSON.stringify(meta));
  const key = encoder.encode(META_APP);
  const data = new Uint8Array(key.length + 5 + text.length);
  data.set(key, 0); // 뒤따르는 5바이트는 0 (구분자·비압축·방식·빈 언어·빈 번역키워드)
  data.set(text, key.length + 5);
  const metaChunk = makeChunk('iTXt', data);

  const parts: Uint8Array[] = [bytes.subarray(0, 8)];
  for (const c of keep) {
    if (c.type === 'IEND') parts.push(metaChunk);
    parts.push(bytes.subarray(c.start, c.end));
  }
  return concat(parts);
}

/** PNG 바이트에서 빛소리 설정을 읽는다. 없거나 PNG가 아니면 null. */
export function readPngMeta(fileBytes: ArrayBuffer | Uint8Array): Partial<BitsoriMeta> | null {
  const bytes = fileBytes instanceof Uint8Array ? fileBytes : new Uint8Array(fileBytes);
  if (!isPng(bytes)) return null;
  for (const c of chunks(bytes)) {
    if (c.type !== 'iTXt' && c.type !== 'tEXt') continue;
    const t = readTextChunk(bytes, c);
    if (!t?.text || !KEYWORDS.includes(t.keyword)) continue;
    try {
      const meta: unknown = JSON.parse(t.text);
      if (isBitsoriMeta(meta)) return meta;
    } catch {
      /* 깨진 메타는 무시 */
    }
  }
  return null;
}
