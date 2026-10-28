// "MIDI → 사진" 탭
import {
  DEFAULT_REST_THRESHOLD, MAX_CHORD, MAX_OCT, MIN_BPM, MAX_BPM, META_APP, META_VERSION, MIN_OCT, SOLFEGE, UNIT_BEATS,
  clampInt, getFilter, isUnit, midiToImage as M, midiToName, parseMidi, scaleOf, settingsFromMeta,
  type ColorMode, type Direction, type ParsedMidi, type Quantized, type Unit,
} from '@bitsori/core';
import { baseName, canvasToPngBlob, download, pixelsToCanvas, upscale, viewScale } from '@bitsori/browser';
import { $, fillOctaveSelect, formatDuration, setupDropzone } from './format';
import { playerApi } from './player-tab';

const els = {
  dropzone: $('midiDropzone'), input: $<HTMLInputElement>('midiInput'), pickBtn: $('midiPickBtn'),
  viewer: $('midiViewer'), banner: $('midiBanner'), view: $<HTMLCanvasElement>('midiView'), sizeInfo: $('midiSizeInfo'),
  playBtn: $<HTMLButtonElement>('midiPlayBtn'), saveBtn: $<HTMLButtonElement>('midiSaveBtn'), changeBtn: $('midiChangeBtn'),
  warnings: $('midiWarnings'), info: $('midiInfo'), unit: $<HTMLSelectElement>('midiUnit'),
  chord: $<HTMLInputElement>('midiChord'), chordAuto: $<HTMLInputElement>('midiChordAuto'),
  startOct: $<HTMLSelectElement>('midiStartOct'), endOct: $<HTMLSelectElement>('midiEndOct'), octAuto: $<HTMLInputElement>('midiOctAuto'),
  length: $<HTMLInputElement>('midiLength'), lengthAuto: $<HTMLInputElement>('midiLengthAuto'), lengthLabel: $('midiLengthLabel'),
  cell: $<HTMLInputElement>('midiCell'), cellLabel: $('midiCellLabel'),
};

const state = {
  parsed: null as ParsedMidi | null,
  fileName: '',
  quantized: null as { unit: Unit; q: Quantized } | null,
  result: null as { canvas: HTMLCanvasElement; meta: Record<string, unknown> } | null,
  cellAuto: true,
};

const radio = (name: string) => document.querySelector<HTMLInputElement>(`input[name="${name}"]:checked`)!.value;
const setRadio = (name: string, value: string) => {
  const el = document.querySelector<HTMLInputElement>(`input[name="${name}"][value="${value}"]`);
  if (el) el.checked = true;
};
const noteName = (midi: number) => `${SOLFEGE[midi % 12]}${Math.floor(midi / 12) - 1}(${midiToName(midi)})`;

// ---------- 불러오기 ----------
async function openMidi(file: File) {
  let parsed: ParsedMidi;
  try {
    parsed = parseMidi(await file.arrayBuffer());
  } catch (e) {
    alert((e as Error).message || 'MIDI 파일을 읽지 못했어요.');
    return;
  }
  state.parsed = parsed;
  state.fileName = file.name || 'midi';
  state.quantized = null;
  state.cellAuto = true;

  // 빛소리가 저장한 MIDI면 원래 이미지 배치로, 아니면 곡을 분석해 자동으로
  const m = parsed.meta;
  setRadio('midiDirection', m?.direction ?? 'horizontal');
  els.unit.value = isUnit(m?.unit) ? m.unit : '16n';
  els.chordAuto.checked = !m?.chord;
  if (m?.chord) els.chord.value = String(clampInt(m.chord, 1, MAX_CHORD));
  const hasOct = !!m && m.startOct! >= MIN_OCT && m.endOct! <= MAX_OCT && m.startOct! <= m.endOct!;
  els.octAuto.checked = !hasOct;
  if (hasOct) {
    els.startOct.value = String(m!.startOct);
    els.endOct.value = String(m!.endOct);
  }
  els.lengthAuto.checked = !m?.length;
  if (m?.length) els.length.value = String(m.length);
  syncDisabled();

  els.banner.hidden = !m;
  els.banner.textContent = m
    ? `빛소리에서 저장한 MIDI예요. 저장할 때의 설정(방향·화음·옥타브·칸 수·${getFilter(m.filter ?? 'none').label} 필터 음계)으로 원래 이미지 배치를 되살렸어요. 반주 트랙은 그림에서 빼요.`
    : '';

  els.dropzone.hidden = true;
  els.viewer.hidden = false;
  convert();
}

function syncDisabled() {
  els.chord.disabled = els.chordAuto.checked;
  els.startOct.disabled = els.octAuto.checked;
  els.endOct.disabled = els.octAuto.checked;
  els.length.disabled = els.lengthAuto.checked;
}

// ---------- 변환 ----------
function convert() {
  const parsed = state.parsed;
  if (!parsed) return;
  const meta = parsed.meta;
  const unit = (isUnit(els.unit.value) ? els.unit.value : '16n') as Unit;
  // 빛소리 MIDI: 줄 트랙(1~N)만 그림으로, 그 뒤의 반주 트랙은 뺀다
  const maxTrack = meta?.voiceTracks && meta.chord ? meta.chord : Infinity;
  if (state.quantized?.unit !== unit) state.quantized = { unit, q: M.quantize(parsed, unit, { maxTrack }) };
  const q = state.quantized.q;
  const warnings: string[] = [];

  if (!q.notes.length) {
    els.warnings.innerHTML = '<li>변환할 음표가 없어요.</li>';
    state.result = null;
    els.playBtn.disabled = els.saveBtn.disabled = true;
    return;
  }

  if (els.chordAuto.checked) els.chord.value = String(clampInt(q.maxPoly, 1, MAX_CHORD));
  const chord = clampInt(els.chord.value, 1, MAX_CHORD);
  els.chord.value = String(chord);

  if (els.octAuto.checked) {
    const o = M.autoOctaves(q);
    els.startOct.value = String(o.startOct);
    els.endOct.value = String(o.endOct);
  }
  const startOct = Number(els.startOct.value);
  const endOct = Number(els.endOct.value);

  const fromTracks = !!(meta?.voiceTracks && meta.chord && chord >= meta.chord);
  const { grid, dropped, merged } = M.allocate(q, chord, fromTracks);

  const direction = radio('midiDirection') as Direction;
  els.length.max = String(Math.max(4, Math.min(1024, q.steps)));
  if (els.lengthAuto.checked) els.length.value = String(M.autoLength(q.steps, chord));
  const length = clampInt(els.length.value, 1, 4096);
  els.lengthLabel.textContent = `${length}칸`;

  // 빛소리 MIDI는 저장할 때의 필터 음계·조로 되돌린다. 일반 MIDI는 반음계.
  const saved = meta ? settingsFromMeta(meta as Record<string, unknown>) : {};
  const filter = getFilter(saved.filter ?? 'none');
  const mode = filter.mode !== 'auto' ? filter.mode : saved.mode === 'minor' ? 'minor' : 'major';
  const key = typeof saved.key === 'number' ? saved.key : 0;
  const scale = scaleOf(filter.scale, mode);
  const sameLayout = !!meta && meta.direction === direction && meta.chord === chord && meta.length === length;
  const img = M.render({
    grid, steps: q.steps, chord, startOct, endOct, direction, length,
    lines: sameLayout ? meta!.lines : undefined,
    colorMode: radio('midiColor') as ColorMode,
    restThreshold: DEFAULT_REST_THRESHOLD,
    scale,
    key: scale === 'chromatic' ? 0 : key,
  });
  const canvas = pixelsToCanvas(img);

  const bpm = clampInt(parsed.bpm, MIN_BPM, MAX_BPM);
  state.result = {
    canvas,
    meta: {
      app: META_APP, version: META_VERSION,
      direction, chord, length, lines: img.lineCount, startOct, endOct, bpm, unit,
      restThreshold: DEFAULT_REST_THRESHOLD, restColors: [], colorTolerance: 12,
      instrument: 'piano', filter: filter.id, key, mode, strength: saved.strength ?? 70, source: 'midi',
    },
  };

  drawPreview(canvas);
  updateCell();

  const stepSec = (60 / bpm) * UNIT_BEATS[unit];
  const playSteps = Math.ceil(img.lineCount / chord) * length;
  els.sizeInfo.textContent =
    `${img.width}×${img.height} 픽셀 · ${chord}화음 · 한 줄 ${length}칸 · 예상 재생 시간 ${formatDuration(playSteps * stepSec)}`;
  renderInfo(q, bpm);

  if (q.maxPoly > MAX_CHORD) warnings.push(`동시에 최대 ${q.maxPoly}개 음이 울리지만, 화음은 ${MAX_CHORD}개까지만 담을 수 있어요.`);
  if (dropped) warnings.push(`화음 수(${chord})를 넘는 음 ${dropped}개는 빠졌어요. 화음 수를 늘리면 담을 수 있어요.`);
  if (merged) warnings.push(`같은 음을 연달아 친 ${merged}곳은 줄이 모자라 한 음으로 이어졌어요.`);
  if (img.clamped) warnings.push(`옥타브 범위·음계를 벗어난 ${img.clamped}칸은 가까운 음으로 맞췄어요.`);
  if (q.drums) warnings.push(`드럼 채널의 음 ${q.drums}개는 제외했어요.`);
  const tempoCount = new Set(parsed.tempos.map((t) => Math.round(t.bpm))).size;
  if (tempoCount > 1) warnings.push(`곡 중간에 템포가 바뀌지만, 첫 템포(${Math.round(parsed.bpm)} BPM)로 통일했어요.`);
  if (Math.round(parsed.bpm) !== bpm) warnings.push(`템포 ${Math.round(parsed.bpm)} BPM은 재생 범위(${MIN_BPM}~${MAX_BPM})에 맞춰 ${bpm} BPM으로 저장해요.`);
  els.warnings.innerHTML = '';
  for (const w of warnings) {
    const li = document.createElement('li');
    li.textContent = w;
    els.warnings.appendChild(li);
  }
  els.playBtn.disabled = els.saveBtn.disabled = false;
}

function drawPreview(canvas: HTMLCanvasElement) {
  const scale = viewScale(canvas.width, canvas.height);
  els.view.width = canvas.width * scale;
  els.view.height = canvas.height * scale;
  const ctx = els.view.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(canvas, 0, 0, els.view.width, els.view.height);
}

function updateCell() {
  const { canvas } = state.result!;
  if (state.cellAuto) els.cell.value = String(Math.max(1, Math.min(32, Math.floor(1024 / Math.max(canvas.width, canvas.height)))));
  const cell = Number(els.cell.value);
  els.cellLabel.textContent = `${cell}배 → ${canvas.width * cell}×${canvas.height * cell}px`;
}

function renderInfo(q: Quantized, bpm: number) {
  const parsed = state.parsed!;
  const lastTick = parsed.notes.reduce((n, x) => Math.max(n, x.endTick), 0);
  const rows: [string, string][] = [
    ['파일', state.fileName],
    ['길이', formatDuration((lastTick / parsed.ppq) * (60 / parsed.bpm))],
    ['템포', `${Math.round(parsed.bpm)} BPM${bpm !== Math.round(parsed.bpm) ? ` → ${bpm}` : ''}`],
    ['음표', `${q.notes.length.toLocaleString()}개`],
    ['최대 동시음', `${q.maxPoly}개`],
    ['음역', `${noteName(q.minMidi)} ~ ${noteName(q.maxMidi)}`],
    ['저장된 설정', parsed.meta ? '있음 (빛소리)' : '없음 (자동 분석)'],
  ];
  els.info.innerHTML = '';
  for (const [k, v] of rows) {
    const row = document.createElement('div');
    const dt = document.createElement('dt');
    const dd = document.createElement('dd');
    dt.textContent = k;
    dd.textContent = v;
    row.append(dt, dd);
    els.info.appendChild(row);
  }
}

// ---------- 저장 / 연주 ----------
function buildPng() {
  const { canvas, meta } = state.result!;
  const cell = Number(els.cell.value);
  return canvasToPngBlob(upscale(canvas, cell), { ...meta, cell });
}

const pngName = () => `${baseName(state.fileName, 'midi')}-bitsori.png`;

// ---------- 탭 ----------
export function switchTab(id: 'playerTab' | 'midiTab') {
  document.querySelectorAll<HTMLElement>('.tab').forEach((t) => {
    const on = t.dataset.tab === id;
    t.classList.toggle('active', on);
    t.setAttribute('aria-selected', String(on));
  });
  $('playerTab').hidden = id !== 'playerTab';
  $('midiTab').hidden = id !== 'midiTab';
  if (id !== 'playerTab') playerApi.pause();
}

export function initMidiTab() {
  fillOctaveSelect(els.startOct, MIN_OCT, MAX_OCT);
  fillOctaveSelect(els.endOct, MIN_OCT, MAX_OCT);
  els.startOct.value = '1';
  els.endOct.value = '4';

  document.querySelectorAll<HTMLElement>('.tab').forEach((t) =>
    t.addEventListener('click', () => switchTab(t.dataset.tab as 'playerTab' | 'midiTab')));

  els.pickBtn.addEventListener('click', () => els.input.click());
  els.changeBtn.addEventListener('click', () => {
    els.input.value = '';
    els.input.click();
  });
  els.input.addEventListener('change', () => {
    const f = els.input.files?.[0];
    if (f) openMidi(f);
  });
  setupDropzone(els.dropzone, (f) => /\.midi?$/i.test(f.name) || f.type.includes('midi'), openMidi);

  const autoToggle = () => {
    syncDisabled();
    convert();
  };
  [els.chordAuto, els.octAuto, els.lengthAuto].forEach((c) => c.addEventListener('change', autoToggle));
  els.chord.addEventListener('change', convert);
  els.unit.addEventListener('change', convert);
  els.startOct.addEventListener('change', () => {
    if (Number(els.endOct.value) < Number(els.startOct.value)) els.endOct.value = els.startOct.value;
    convert();
  });
  els.endOct.addEventListener('change', () => {
    if (Number(els.startOct.value) > Number(els.endOct.value)) els.startOct.value = els.endOct.value;
    convert();
  });
  els.length.addEventListener('input', convert);
  document.querySelectorAll('input[name="midiDirection"], input[name="midiColor"]').forEach((r) => r.addEventListener('change', convert));
  els.cell.addEventListener('input', () => {
    state.cellAuto = false;
    if (state.result) updateCell();
  });

  els.saveBtn.addEventListener('click', async () => download(await buildPng(), pngName()));
  els.playBtn.addEventListener('click', async () => {
    const blob = await buildPng();
    switchTab('playerTab');
    playerApi.openFile(blob, pngName());
  });
}
