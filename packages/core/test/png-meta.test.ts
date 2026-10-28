import { describe, expect, it } from 'vitest';
import { readPngMeta, writePngMeta } from '../src';

// 1×1 PNG (빨간 점)
const PNG_1PX = Uint8Array.from([137,80,78,71,13,10,26,10,0,0,0,13,73,72,68,82,0,0,0,1,0,0,0,1,8,6,0,0,0,31,21,196,137,0,0,0,13,73,68,65,84,120,218,99,252,207,192,240,31,0,5,5,2,0,95,200,241,210,0,0,0,0,73,69,78,68,174,66,96,130]);

describe('PNG 메타정보', () => {
  it('쓰고 읽기 (한글 포함)', () => {
    const meta = { app: 'bitsori', version: 1, chord: 3, preset: '잔잔하게' };
    const out = writePngMeta(PNG_1PX, meta);
    expect(readPngMeta(out)).toEqual(meta);
  });

  it('다시 쓰면 기존 메타를 교체한다', () => {
    const once = writePngMeta(PNG_1PX, { app: 'bitsori', version: 1, chord: 2 });
    const twice = writePngMeta(once, { app: 'bitsori', version: 1, chord: 5 });
    expect(readPngMeta(twice)?.chord).toBe(5);
    expect(twice.length).toBe(once.length);
  });

  it('프로토타입(rainbow-string) 파일도 읽는다', () => {
    // 프로토타입은 키워드 'rainbow-string'으로 저장했다 — 키워드만 바꿔 흉내 낸다
    const bytes = writePngMeta(PNG_1PX, { app: 'rainbow-string', version: 1, chord: 4 });
    expect(readPngMeta(bytes)?.chord).toBe(4);
  });

  it('메타 없는 PNG·PNG 아닌 파일은 null', () => {
    expect(readPngMeta(PNG_1PX)).toBeNull();
    expect(readPngMeta(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});
