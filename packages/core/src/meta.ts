import { sanitizeSettings, type Settings } from './settings';

/** 현재 메타정보 형식 버전. 해석 방식이 바뀌면 올리고, 옛 버전도 계속 읽을 수 있어야 한다. */
export const META_VERSION = 1;
export const META_APP = 'bitsori';
/** 프로토타입(레인보우스트링) 시절에 저장한 파일도 읽는다 */
export const LEGACY_META_APPS = ['rainbow-string'];

/** PNG·MIDI에 함께 저장하는 설정 */
export interface BitsoriMeta extends Settings {
  app: string;
  version: number;
  /** 한 줄의 칸 수 */
  length?: number;
  /** 줄 수 */
  lines?: number;
  /** 확대 저장 배율 (원래 1칸 = cell×cell 픽셀) */
  cell?: number;
  /** 만들어진 곳: web / camera / gallery / midi */
  source?: string;
  preset?: string;
  /** MIDI에서 트랙 1, 2, …가 곧 줄 1, 2, … */
  voiceTracks?: boolean;
}

// 조·장단조가 사진에서 정해지기 전(v0.1)의 필터는 조가 고정이었다
const LEGACY_FILTER_KEYS: Record<string, [number, 'major' | 'minor']> = {
  pop: [0, 'major'], lofi: [0, 'major'], dream: [0, 'major'], musicbox: [0, 'major'], cinema: [9, 'minor'],
};

/**
 * 메타정보 → 적용할 설정.
 * - 필터가 생기기 전(필드 없음)에 저장된 파일은 '원본' 필터로 만든 것이므로 그렇게 읽는다.
 * - 조가 저장되지 않은 필터 파일은 그때의 고정 조로 읽는다. 그래야 같은 멜로디가 난다.
 */
export function settingsFromMeta(meta: Record<string, unknown>): Partial<Settings> {
  const s = sanitizeSettings(meta);
  const filter = s.filter ?? 'none';
  const legacy = LEGACY_FILTER_KEYS[filter];
  if (legacy && s.key === undefined) {
    s.key = legacy[0];
    s.mode ??= legacy[1];
  }
  return { ...s, filter };
}

export function isBitsoriMeta(v: unknown): v is Partial<BitsoriMeta> & { app: string } {
  if (!v || typeof v !== 'object') return false;
  const app = (v as { app?: unknown }).app;
  return app === META_APP || LEGACY_META_APPS.includes(app as string);
}
