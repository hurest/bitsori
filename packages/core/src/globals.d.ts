// core는 DOM·Node 어느 쪽에도 의존하지 않는다. 두 환경 모두에 있는 텍스트 인코딩 API만 선언해 쓴다.
declare class TextEncoder {
  encode(input?: string): Uint8Array;
}
declare class TextDecoder {
  constructor(label?: string);
  decode(input?: ArrayBufferView | ArrayBuffer): string;
}
