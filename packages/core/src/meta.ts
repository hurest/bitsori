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

/**
 * 메타정보 → 적용할 설정.
 * 필터가 생기기 전(필드 없음)에 저장된 파일은 '원본' 필터로 만든 것이므로 그렇게 읽는다.
 */
export function settingsFromMeta(meta: Record<string, unknown>): Partial<Settings> {
  const s = sanitizeSettings(meta);
  return { ...s, filter: s.filter ?? 'none' };
}

export function isBitsoriMeta(v: unknown): v is Partial<BitsoriMeta> & { app: string } {
  if (!v || typeof v !== 'object') return false;
  const app = (v as { app?: unknown }).app;
  return app === META_APP || LEGACY_META_APPS.includes(app as string);
}
