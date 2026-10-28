// 유료 필터 이용 권한.
// 실제 결제(App Store·Google Play 인앱 결제)는 PurchaseProvider를 구현해 연결한다 (예: RevenueCat, Capacitor 결제 플러그인).
// 구매 기록의 원본은 스토어다. 여기 저장하는 목록은 빠른 표시를 위한 사본이고, 앱을 열 때 restore()로 맞춘다.
import { filterProductId, getFilter, type FilterDef } from '@bitsori/core';

export interface PurchaseProvider {
  /** 구매 창을 띄우고 성공하면 true */
  purchase(productId: string): Promise<boolean>;
  /** 이 계정이 가진 상품 ID 목록 */
  restore(): Promise<string[]>;
  /** 표시용 가격 (예: '₩1,200'). 모르면 null */
  price?(productId: string): Promise<string | null>;
}

/** 결제 연동 전 개발용: 누르면 바로 구매된 것으로 처리 */
export class DevPurchaseProvider implements PurchaseProvider {
  async purchase() {
    return true;
  }
  async restore() {
    return [];
  }
  async price() {
    return '₩1,200 (개발용)';
  }
}

/** 웹: 결제 없음. 유료 필터는 앱에서만 구매할 수 있다. */
export class NoPurchaseProvider implements PurchaseProvider {
  async purchase() {
    return false;
  }
  async restore() {
    return [];
  }
}

const STORAGE_KEY = 'bitsori.entitlements';

export class Entitlements {
  private owned: Set<string>;
  private listeners = new Set<() => void>();

  constructor(readonly provider: PurchaseProvider, private readonly storage: Pick<Storage, 'getItem' | 'setItem'> | null = safeStorage()) {
    this.owned = new Set(this.read());
  }

  /** 이 필터를 내 사진에 적용할 수 있는지 */
  canUse(filter: FilterDef | string): boolean {
    const f = typeof filter === 'string' ? getFilter(filter) : filter;
    return f.tier === 'free' || this.owned.has(filterProductId(f.id));
  }

  async purchase(filterId: string): Promise<boolean> {
    const productId = filterProductId(filterId);
    const ok = await this.provider.purchase(productId);
    if (ok) this.add([productId]);
    return ok;
  }

  async restore(): Promise<void> {
    this.add(await this.provider.restore());
  }

  onChange(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private add(ids: string[]) {
    ids.forEach((id) => this.owned.add(id));
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify([...this.owned]));
    } catch {
      /* 저장 실패해도 이번 실행 동안은 유지 */
    }
    this.listeners.forEach((fn) => fn());
  }

  private read(): string[] {
    try {
      const v = JSON.parse(this.storage?.getItem(STORAGE_KEY) ?? '[]');
      return Array.isArray(v) ? v.filter((x) => typeof x === 'string') : [];
    } catch {
      return [];
    }
  }
}

function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
