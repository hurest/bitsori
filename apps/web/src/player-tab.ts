// "사진 → 노래" 탭
import {
  DEFAULT_FILTER_ID, DEFAULT_SETTINGS, FILTERS, MAX_CHORD, MAX_OCT, META_APP, META_VERSION, MIN_OCT,
  buildScore, clampInt, countSteps, detectCellSize, getFilter, layout, scoreToMidi, settingsFromMeta,
  stepSeconds, isUnit, type BitsoriMeta, type Direction, type RGB, type Score, type Settings,
} from '@bitsori/core';
import { INSTRUMENTS, ScorePlayer } from '@bitsori/audio';
import {
  NoPurchaseProvider, DevPurchaseProvider, Entitlements, baseName, buildRestOverlay, canvasToPngBlob, download,
  drawScoreView, imagePixels, loadImageFile, sampleImage, stepAtPoint, upscale, viewScale, type SampledImage,
} from '@bitsori/browser';
import { $, fillOctaveSelect, formatClock, formatDuration, setupDropzone } from './format';

const els = {
  dropzone: $('dropzone'), fileInput: $<HTMLInputElement>('fileInput'), pickBtn: $('pickBtn'), sampleBtn: $('sampleBtn'),
  viewer: $('viewer'), view: $<HTMLCanvasElement>('view'), playBtn: $<HTMLButtonElement>('playBtn'), stopBtn: $<HTMLButtonElement>('stopBtn'),
  seek: $<HTMLInputElement>('seek'), timeLabel: $('timeLabel'), status: $('status'), changeBtn: $('changeBtn'),
  sizeRange: $<HTMLInputElement>('sizeRange'), sizeLabel: $('sizeLabel'), presets: $('presets'),
  estimate: $('estimate'), estimateOrig: $('estimateOrig'),
  chord: $<HTMLInputElement>('chord'), startOct: $<HTMLSelectElement>('startOct'), endOct: $<HTMLSelectElement>('endOct'),
  rangeInfo: $('rangeInfo'), chordHint: $('chordHint'),
  instrument: $<HTMLSelectElement>('instrument'), bpm: $<HTMLInputElement>('bpm'), bpmLabel: $('bpmLabel'), unit: $<HTMLSelectElement>('unit'),
  rest: $<HTMLInputElement>('rest'), restLabel: $('restLabel'), scoreInfo: $('scoreInfo'), hint: $('hint'),
  restColors: $('restColors'), pickColorBtn: $<HTMLButtonElement>('pickColorBtn'),
  tolerance: $<HTMLInputElement>('tolerance'), toleranceLabel: $('toleranceLabel'), showRests: $<HTMLInputElement>('showRests'),
  metaBanner: $('metaBanner'), metaText: $('metaText'), metaResetBtn: $('metaResetBtn'),
  savePngBtn: $<HTMLButtonElement>('savePngBtn'), saveMidiBtn: $<HTMLButtonElement>('saveMidiBtn'),
  filters: $('filters'), filterInfo: $('filterInfo'),
};
const HINT_DEFAULT = els.hint.textContent ?? '';
const viewCtx = els.view.getContext('2d')!;

// 웹은 결제가 없다. 유료 필터는 앱에서 구매한다. (?dev 를 붙이면 개발용으로 모두 열림)
const DEV_UNLOCK = new URLSearchParams(location.search).has('dev');
const entitlements = new Entitlements(DEV_UNLOCK ? new DevPurchaseProvider() : new NoPurchaseProvider());
const canUseFilter = (id: string) => DEV_UNLOCK || entitlements.canUse(id);

const state = {
  img: null as HTMLImageElement | null,
  fileName: 'image',
  /** 확대 저장된 픽셀 아트면 한 칸의 실제 픽셀 크기 */
  cell: 1,
  targetWidth: 32,
  sampled: null as SampledImage | null,
  score: null as Score | null,
  scale: 1,
  stepIndex: 0,
  filter: DEFAULT_FILTER_ID,
  restColors: [] as RGB[],
  picking: false,
  restOverlay: null as HTMLCanvasElement | null,
};
/** 메타정보를 적용하기 전 설정 ('이전 설정으로' 되돌릴 때 사용) */
let beforeMeta: Settings | null = null;

const player = new ScorePlayer({
  onStep: (step) => {
    state.stepIndex = step;
    draw();
    updateTime();
  },
  onStateChange: (s) => {
    if (s === 'playing') setStatus('연주 중');
    else if (s === 'paused') setStatus('일시정지');
    updateTransportUI();
  },
  onEnd: () => {
    state.stepIndex = 0;
    draw();
    updateTime();
    setStatus('연주 끝');
  },
});

// ---------- 설정 ----------
const direction = (): Direction => (document.querySelector<HTMLInputElement>('input[name="direction"]:checked')!.value as Direction);
const lineCountOf = (w: number, h: number) => layout(w, h, direction()).lineCount;

function settings(): Settings {
  const sample = state.sampled?.sample;
  return {
    direction: direction(),
    chord: Math.min(clampInt(els.chord.value, 1, MAX_CHORD), sample ? lineCountOf(sample.width, sample.height) : MAX_CHORD),
    startOct: Number(els.startOct.value),
    endOct: Number(els.endOct.value),
    restThreshold: Number(els.rest.value),
    restColors: state.restColors,
    colorTolerance: Number(els.tolerance.value),
    bpm: Number(els.bpm.value),
    unit: isUnit(els.unit.value) ? els.unit.value : '8n',
    instrument: els.instrument.value,
    filter: state.filter,
  };
}

/** 설정(일부)을 화면에 반영한다 */
function applySettings(s: Partial<Settings>) {
  if (s.direction) document.querySelector<HTMLInputElement>(`input[name="direction"][value="${s.direction}"]`)!.checked = true;
  els.chordHint.textContent = direction() === 'vertical' ? '(한 번에 소리 낼 열 수)' : '(한 번에 소리 낼 행 수)';
  if (s.chord) els.chord.value = String(s.chord);
  if (s.startOct && s.endOct) {
    els.startOct.value = String(s.startOct);
    els.endOct.value = String(s.endOct);
  }
  if (s.bpm) {
    els.bpm.value = String(s.bpm);
    els.bpmLabel.textContent = String(s.bpm);
    player.setTempo(s.bpm);
  }
  if (s.unit) {
    els.unit.value = s.unit;
    player.setUnit(s.unit);
  }
  if (s.restThreshold !== undefined) {
    els.rest.value = String(s.restThreshold);
    els.restLabel.textContent = String(s.restThreshold);
  }
  if (s.colorTolerance !== undefined) {
    els.tolerance.value = String(s.colorTolerance);
    els.toleranceLabel.textContent = `${s.colorTolerance}%`;
  }
  if (s.restColors) {
    state.restColors = s.restColors.map((c) => ({ ...c }));
    renderRestColors();
  }
  if (s.instrument && INSTRUMENTS[s.instrument] && s.instrument !== els.instrument.value) {
    els.instrument.value = s.instrument;
    player.loadInstrument(s.instrument);
  }
  if (s.filter) setFilter(s.filter);
  updateInfo();
}

function currentMeta(): BitsoriMeta {
  return {
    app: META_APP,
    version: META_VERSION,
    ...settings(),
    restColors: state.restColors.map(({ r, g, b }) => ({ r, g, b })),
    length: state.score!.length,
    lines: state.score!.lineCount,
    source: 'web',
  };
}

// ---------- 필터 ----------
function setFilter(id: string) {
  state.filter = getFilter(id).id;
  player.setFilter(state.filter);
  renderFilters();
}

/** 필터 칩을 눌렀을 때: 필터 + 어울리는 설정을 함께 적용 */
function chooseFilter(id: string) {
  const f = getFilter(id);
  if (!canUseFilter(f.id)) {
    els.filterInfo.textContent = `${f.emoji} ${f.label} — 빛소리 앱에서 구매할 수 있는 필터예요. (${f.description})`;
    els.filterInfo.classList.add('locked');
    return;
  }
  applySettings({ ...f.suggested, filter: f.id });
  if (state.img) rebuildAll();
}

function renderFilters() {
  els.filters.innerHTML = '';
  for (const f of FILTERS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'filter-chip';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-checked', String(f.id === state.filter));
    b.classList.toggle('active', f.id === state.filter);
    const locked = !canUseFilter(f.id);
    b.classList.toggle('locked', locked);
    b.innerHTML = `<span class="emoji"></span><span class="name"></span>${locked ? '<span class="lock" aria-label="유료">🔒</span>' : ''}`;
    b.querySelector('.emoji')!.textContent = f.emoji;
    b.querySelector('.name')!.textContent = f.label;
    b.title = f.description;
    b.addEventListener('click', () => chooseFilter(f.id));
    els.filters.appendChild(b);
  }
  const f = getFilter(state.filter);
  els.filterInfo.classList.remove('locked');
  els.filterInfo.textContent = `${f.emoji} ${f.label} — ${f.description}`;
}

// ---------- 재생 ----------
async function play() {
  if (!state.score) return;
  if (player.state !== 'paused') player.seek(state.stepIndex);
  setStatus('소리 불러오는 중…');
  await player.play();
}

function stop() {
  player.stop();
  state.stepIndex = 0;
  if (state.score) {
    draw();
    updateTime();
    setStatus(readyText());
  }
  updateTransportUI();
}

function seekTo(step: number) {
  if (!state.score) return;
  state.stepIndex = clampInt(step, 0, state.score.totalSteps - 1);
  player.seek(state.stepIndex);
  draw();
  updateTime();
}

function updateTransportUI() {
  const ready = !!state.score;
  els.playBtn.disabled = !ready;
  els.savePngBtn.disabled = !ready;
  els.saveMidiBtn.disabled = !ready;
  els.stopBtn.disabled = !ready || player.state === 'stopped';
  els.playBtn.textContent = player.state === 'playing' ? '❚❚ 일시정지' : '▶ 재생';
}

function updateTime() {
  if (!state.score) return;
  const sec = stepSeconds(settings().bpm, settings().unit);
  els.seek.value = String(state.stepIndex);
  els.timeLabel.textContent = `${formatClock(state.stepIndex * sec)} / ${formatClock(state.score.totalSteps * sec)}`;
}

const setStatus = (text: string) => { els.status.textContent = text; };

// ---------- 그리기 ----------
function setupView() {
  const { width: w, height: h } = state.sampled!.sample;
  state.scale = viewScale(w, h);
  els.view.width = w * state.scale;
  els.view.height = h * state.scale;
}

function draw() {
  if (!state.sampled) return;
  drawScoreView(viewCtx, {
    image: state.sampled.canvas,
    score: state.score,
    scale: state.scale,
    step: state.picking ? null : state.stepIndex,
    restOverlay: els.showRests.checked ? state.restOverlay : null,
  });
}

// ---------- 변환 ----------
function readyText() {
  const { width, height, groups, chord, direction: dir } = state.score!;
  return `${width}×${height} 픽셀 · ${dir === 'vertical' ? '세로' : '가로'} 방향 · ${chord}화음 · ${groups}구간`;
}

/** 이미지 크기·화음 수·방향이 바뀌면 칸 배치가 달라지므로 처음부터 다시 만든다 */
function rebuildAll() {
  stop();
  const img = state.img!;
  const exactGrid = state.cell > 1 && state.targetWidth * state.cell === img.naturalWidth;
  state.sampled = sampleImage(img, img.naturalWidth, img.naturalHeight, state.targetWidth, exactGrid);
  const { sample } = state.sampled;
  els.chord.max = String(Math.min(MAX_CHORD, lineCountOf(sample.width, sample.height)));
  els.chord.value = String(settings().chord);
  setupView();
  rebuildScore(false);
}

/** 음역·쉼표·필터만 바뀌면 칸 배치는 그대로라 재생을 이어간다 */
function rebuildScore(keepPlaying = true) {
  if (!state.sampled) return;
  state.score = buildScore(state.sampled.sample, settings());
  player.setScore(state.score, keepPlaying);
  els.seek.max = String(state.score.totalSteps - 1);
  state.stepIndex = Math.min(state.stepIndex, state.score.totalSteps - 1);
  state.restOverlay = buildRestOverlay(state.score, state.scale, state.restOverlay);
  draw();
  updateTime();
  updateInfo();
  updateEstimate();
  if (player.state === 'stopped') setStatus(readyText());
  updateTransportUI();
}

function updateInfo() {
  const { startOct, endOct } = settings();
  const f = getFilter(state.filter);
  const scaleText = f.scale === 'chromatic' ? '반음 12개' : `${f.label} 필터 음계`;
  els.rangeInfo.textContent =
    `${startOct}옥타브 도(C${startOct}) ~ ${endOct}옥타브 시(B${endOct}) · ${scaleText}${state.score ? ` ${state.score.noteCount}음` : ''} — 밝을수록 높은 음`;
  if (state.score) {
    const { noteEvents, restRatio } = state.score;
    els.scoreInfo.textContent = `음표 ${noteEvents.toLocaleString()}개 · 쉼표 비율 ${Math.round(restRatio * 100)}%`;
  }
}

function heightFor(width: number) {
  const img = state.img!;
  return Math.max(1, Math.round((img.naturalHeight * width) / img.naturalWidth));
}

function updateEstimate() {
  if (!state.img) return;
  const chord = clampInt(els.chord.value, 1, MAX_CHORD);
  const sec = stepSeconds(settings().bpm, settings().unit);
  const w = state.targetWidth;
  const h = heightFor(w);
  const dir = direction();
  els.sizeLabel.textContent = `${w}px (세로 ${h}px)`;
  els.estimate.textContent = formatDuration(countSteps(w, h, Math.min(chord, lineCountOf(w, h)), dir) * sec);

  // 확대 저장된 픽셀 아트는 확대 전 칸 수를 원본으로 본다
  const ow = state.img.naturalWidth / state.cell;
  const oh = state.img.naturalHeight / state.cell;
  const label = state.cell > 1 ? '원래 칸' : '원본';
  els.estimateOrig.textContent = w !== ow
    ? `${label}(${ow}×${oh})이면\n${formatDuration(countSteps(ow, oh, Math.min(chord, lineCountOf(ow, oh)), dir) * sec)}`
    : `${label} 크기`;
  for (const b of els.presets.children) (b as HTMLElement).classList.toggle('active', Number((b as HTMLElement).dataset.w) === w);
}

// ---------- 쉼표 색 ----------
const toHex = ({ r, g, b }: RGB) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();

function renderRestColors() {
  els.restColors.innerHTML = '';
  state.restColors.forEach((c, i) => {
    const chip = document.createElement('span');
    chip.className = 'chip';
    chip.innerHTML = `<span class="chip-swatch"></span>${toHex(c)}<button type="button" aria-label="색 삭제">×</button>`;
    chip.querySelector<HTMLElement>('.chip-swatch')!.style.background = toHex(c);
    chip.querySelector('button')!.addEventListener('click', () => {
      state.restColors.splice(i, 1);
      renderRestColors();
      rebuildScore();
    });
    els.restColors.appendChild(chip);
  });
}

function setPicking(on: boolean) {
  state.picking = on;
  els.pickColorBtn.classList.toggle('picking', on);
  els.pickColorBtn.textContent = on ? '이미지를 클릭하세요 (취소: Esc)' : '🎯 이미지에서 색 고르기';
  els.view.classList.toggle('picking', on);
  els.hint.classList.toggle('picking', on);
  els.hint.textContent = on ? '쉼표로 만들 색을 이미지에서 클릭하세요.' : HINT_DEFAULT;
  draw();
}

function pickColorAt(x: number, y: number) {
  const { sample } = state.sampled!;
  const p = (y * sample.width + x) * 4;
  const color = { r: sample.data[p], g: sample.data[p + 1], b: sample.data[p + 2] };
  if (!state.restColors.some((c) => toHex(c) === toHex(color))) state.restColors.push(color);
  setPicking(false);
  els.showRests.checked = true;
  renderRestColors();
  rebuildScore();
}

// ---------- 메타정보 배너 ----------
function showBanner(text: string, canReset: boolean) {
  els.metaText.textContent = text;
  els.metaResetBtn.hidden = !canReset;
  els.metaBanner.hidden = !text;
}

function describeMeta(s: Partial<Settings>) {
  const f = getFilter(s.filter);
  const parts = [`${f.emoji} ${f.label}`, s.direction === 'vertical' ? '세로' : '가로', `${s.chord}화음`, `${s.startOct}~${s.endOct}옥타브`, `${s.bpm}BPM`];
  if (s.restColors?.length) parts.push(`쉼표 색 ${s.restColors.length}개`);
  return parts.join(' · ');
}

// ---------- 저장 ----------
async function savePng() {
  const { canvas, sample } = state.sampled!;
  const cell = Math.max(1, Math.min(32, Math.floor(1024 / Math.max(sample.width, sample.height))));
  const blob = await canvasToPngBlob(upscale(canvas, cell), { ...currentMeta(), cell });
  download(blob, `${baseName(state.fileName)}-bitsori.png`);
}

function saveMidi() {
  const meta = currentMeta();
  const bytes = scoreToMidi(state.score!, { bpm: meta.bpm, unit: meta.unit, meta, title: baseName(state.fileName), filter: meta.filter });
  download(new Blob([bytes as BlobPart], { type: 'audio/midi' }), `${baseName(state.fileName)}-bitsori.mid`);
}

// ---------- 이미지 불러오기 ----------
async function openFile(file: File | Blob, name?: string) {
  let loaded;
  try {
    loaded = await loadImageFile(file, name);
  } catch {
    alert('이미지를 불러오지 못했어요.');
    return;
  }
  const { img, meta } = loaded;
  state.img = img;
  state.fileName = loaded.name;
  state.stepIndex = 0;
  stop();
  setPicking(false);
  const ow = img.naturalWidth;

  if (meta) {
    // 앞 이미지에서 적용한 메타는 걷어내고, 사용자의 원래 설정을 기억해 둔다
    if (!els.metaBanner.hidden && beforeMeta && !els.metaResetBtn.hidden) applySettings(beforeMeta);
    beforeMeta = { ...settings(), restColors: state.restColors.slice() };
    const s = settingsFromMeta(meta);
    applySettings({ restColors: [], ...s });
    const cell = clampInt(meta.cell ?? 1, 1, 64);
    state.cell = ow % cell === 0 ? cell : 1;
    const f = getFilter(s.filter);
    const note = canUseFilter(f.id) ? '' : ' (유료 필터로 만든 작품 — 감상은 무료예요)';
    showBanner(`이 이미지에 저장된 설정을 적용했어요: ${describeMeta(s)}${note}`, true);
  } else {
    if (!els.metaBanner.hidden && beforeMeta && !els.metaResetBtn.hidden) applySettings(beforeMeta);
    state.restColors = []; // 쉼표 색은 이미지마다 다르므로 새 사진에서는 비운다
    renderRestColors();
    // 공유받은 작품의 유료 필터가 내 사진에 그대로 남지 않게
    if (!canUseFilter(state.filter)) chooseFilter(DEFAULT_FILTER_ID);
    const pixels = imagePixels(img);
    state.cell = pixels ? detectCellSize(pixels) : 1;
    showBanner(state.cell > 1 ? `픽셀 아트로 보여서 ${state.cell}×${state.cell} 블록을 1칸으로 읽었어요.` : '', false);
  }
  state.targetWidth = state.cell > 1 ? ow / state.cell : Math.min(32, ow);

  els.pickColorBtn.disabled = false;
  els.sizeRange.min = String(Math.min(4, ow));
  els.sizeRange.max = String(ow);
  els.sizeRange.value = String(state.targetWidth);
  els.sizeRange.disabled = false;
  renderPresets(ow);

  els.dropzone.hidden = true;
  els.viewer.hidden = false;
  rebuildAll();
  player.ready();
}

function renderPresets(ow: number) {
  els.presets.innerHTML = '';
  const grid = state.cell > 1 ? ow / state.cell : 0;
  const widths = [...new Set([16, 32, 64, 128, 256].filter((w) => w < ow).concat(grid ? [grid] : [], ow))].sort((a, b) => a - b);
  for (const w of widths) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn';
    b.dataset.w = String(w);
    b.textContent = w === grid ? `원래 칸 ${w}` : w === ow ? `원본 ${ow}` : `${w}`;
    b.addEventListener('click', () => {
      state.targetWidth = w;
      els.sizeRange.value = String(w);
      rebuildAll();
    });
    els.presets.appendChild(b);
  }
}

function makeSampleImage(): Promise<File> {
  const c = document.createElement('canvas');
  c.width = 240;
  c.height = 160;
  const ctx = c.getContext('2d')!;
  const hue = ctx.createLinearGradient(0, 0, c.width, 0);
  ['#ff4d6d', '#ff9f1c', '#ffd60a', '#2ec4b6', '#3a86ff', '#8338ec'].forEach((col, i, a) => hue.addColorStop(i / (a.length - 1), col));
  ctx.fillStyle = hue;
  ctx.fillRect(0, 0, c.width, c.height);
  const shade = ctx.createLinearGradient(0, 0, 0, c.height);
  shade.addColorStop(0, 'rgba(255,255,255,0.5)');
  shade.addColorStop(0.5, 'rgba(255,255,255,0)');
  shade.addColorStop(1, 'rgba(0,0,0,0.9)');
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#000';
  for (let i = 0; i < 7; i++) {
    ctx.beginPath();
    ctx.arc(20 + i * 34, 40 + (i % 3) * 30, 9, 0, Math.PI * 2);
    ctx.fill();
  }
  return new Promise((resolve) => c.toBlob((blob) => resolve(new File([blob!], 'sample.png', { type: 'image/png' }))));
}

// ---------- 초기화 ----------
export function initPlayerTab() {
  fillOctaveSelect(els.startOct, MIN_OCT, MAX_OCT);
  fillOctaveSelect(els.endOct, MIN_OCT, MAX_OCT);
  for (const [key, def] of Object.entries(INSTRUMENTS)) els.instrument.add(new Option(def.label, key));
  // 엔진 기본값 위에 기본 필터(팝)와 그 추천 설정을 얹어서 시작
  const start = getFilter(DEFAULT_FILTER_ID);
  applySettings({ ...DEFAULT_SETTINGS, ...start.suggested, filter: start.id });

  els.pickBtn.addEventListener('click', () => els.fileInput.click());
  els.changeBtn.addEventListener('click', () => {
    stop();
    els.fileInput.value = '';
    els.fileInput.click();
  });
  els.fileInput.addEventListener('change', () => {
    const file = els.fileInput.files?.[0];
    if (file) openFile(file);
  });
  els.sampleBtn.addEventListener('click', async () => openFile(await makeSampleImage()));
  setupDropzone(els.dropzone, (f) => f.type.startsWith('image/'), (f) => openFile(f));
  els.savePngBtn.addEventListener('click', savePng);
  els.saveMidiBtn.addEventListener('click', saveMidi);
  els.metaResetBtn.addEventListener('click', () => {
    if (beforeMeta) applySettings(beforeMeta);
    showBanner('', false);
    rebuildAll();
  });

  els.sizeRange.addEventListener('input', () => {
    state.targetWidth = Number(els.sizeRange.value);
    updateEstimate();
  });
  els.sizeRange.addEventListener('change', rebuildAll);

  els.chord.addEventListener('input', updateEstimate);
  els.chord.addEventListener('change', () => {
    els.chord.value = String(settings().chord);
    if (state.img) rebuildAll();
  });
  document.querySelectorAll('input[name="direction"]').forEach((r) => r.addEventListener('change', () => {
    applySettings({});
    if (state.img) rebuildAll();
  }));
  els.startOct.addEventListener('change', () => {
    if (Number(els.endOct.value) < Number(els.startOct.value)) els.endOct.value = els.startOct.value;
    updateInfo();
    rebuildScore();
  });
  els.endOct.addEventListener('change', () => {
    if (Number(els.startOct.value) > Number(els.endOct.value)) els.startOct.value = els.endOct.value;
    updateInfo();
    rebuildScore();
  });
  els.rest.addEventListener('input', () => { els.restLabel.textContent = els.rest.value; });
  els.rest.addEventListener('change', () => rebuildScore());
  els.tolerance.addEventListener('input', () => { els.toleranceLabel.textContent = `${els.tolerance.value}%`; });
  els.tolerance.addEventListener('change', () => rebuildScore());
  els.pickColorBtn.addEventListener('click', () => setPicking(!state.picking));
  els.showRests.addEventListener('change', draw);

  els.bpm.addEventListener('input', () => {
    els.bpmLabel.textContent = els.bpm.value;
    player.setTempo(Number(els.bpm.value));
    updateEstimate();
    updateTime();
  });
  els.unit.addEventListener('change', () => {
    if (isUnit(els.unit.value)) player.setUnit(els.unit.value);
    updateEstimate();
    updateTime();
  });
  els.instrument.addEventListener('change', () => {
    player.pause();
    player.loadInstrument(els.instrument.value);
  });

  els.playBtn.addEventListener('click', () => (player.state === 'playing' ? player.pause() : play()));
  els.stopBtn.addEventListener('click', stop);
  els.seek.addEventListener('input', () => seekTo(Number(els.seek.value)));
  els.view.addEventListener('click', (e) => {
    if (!state.score) return;
    const { x, y, step } = stepAtPoint(els.view, state.score, e.clientX, e.clientY);
    if (state.picking) pickColorAt(x, y);
    else seekTo(step);
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && state.picking) return setPicking(false);
    if (e.code !== 'Space' || !state.score || $('playerTab').hidden) return;
    if (['INPUT', 'SELECT', 'BUTTON'].includes(document.activeElement?.tagName ?? '')) return;
    e.preventDefault();
    if (player.state === 'playing') player.pause();
    else play();
  });
  entitlements.onChange(renderFilters);
  updateTransportUI();
}

/** 다른 탭(MIDI → 사진)에서 만든 이미지를 바로 연주할 때 */
export const playerApi = {
  openFile,
  pause: () => player.pause(),
};
