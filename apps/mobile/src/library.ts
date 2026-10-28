// 보관함: 만든 노래를 기기 안에 저장한다.
// 항목마다 "설정이 담긴 1배 PNG"를 저장하므로, 열면 언제나 같은 노래가 나온다. (작아서 수 KB)
export interface LibraryItem {
  id: string;
  createdAt: number;
  /** data:image/png;base64,… (빛소리 메타정보 포함) */
  png: string;
}

const KEY = 'bitsori.library';
const MAX_ITEMS = 200;

export function listItems(): LibraryItem[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export async function addItem(png: Blob): Promise<LibraryItem> {
  const item: LibraryItem = { id: crypto.randomUUID(), createdAt: Date.now(), png: await blobToDataUrl(png) };
  const items = [item, ...listItems()].slice(0, MAX_ITEMS);
  localStorage.setItem(KEY, JSON.stringify(items));
  return item;
}

export async function itemToBlob(item: LibraryItem): Promise<Blob> {
  return (await fetch(item.png)).blob();
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
