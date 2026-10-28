export const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;

export function formatClock(sec: number): string {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = String(sec % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

export function formatDuration(sec: number): string {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h) return `${h}시간 ${m}분`;
  if (m) return `${m}분 ${s}초`;
  return `${s}초`;
}

export function fillOctaveSelect(select: HTMLSelectElement, min: number, max: number) {
  for (let o = min; o <= max; o++) select.add(new Option(`${o}옥타브`, String(o)));
}

/** 끌어다 놓기 영역 */
export function setupDropzone(zone: HTMLElement, accept: (f: File) => boolean, onFile: (f: File) => void) {
  (['dragenter', 'dragover'] as const).forEach((t) => zone.addEventListener(t, (e) => {
    e.preventDefault();
    zone.classList.add('over');
  }));
  (['dragleave', 'drop'] as const).forEach((t) => zone.addEventListener(t, () => zone.classList.remove('over')));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    const file = [...(e.dataTransfer?.files ?? [])].find(accept);
    if (file) onFile(file);
  });
}
