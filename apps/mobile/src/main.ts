// 빛소리 카메라 앱: 찍으면 바로 노래가 된다.
import './style.css';
import {
  DEFAULT_FILTER_ID, DEFAULT_SETTINGS, FILTERS, META_APP, META_VERSION,
  buildScore, clampInt, detectCellSize, getFilter, keyLabel, settingsFromMeta, tempoFromPhoto,
  type BitsoriMeta, type Score, type Settings,
} from '@bitsori/core';
import { ScorePlayer } from '@bitsori/audio';
import {
  DevPurchaseProvider, Entitlements, canvasToPngBlob, download, drawScoreView, imagePixels, loadImageFile,
  sampleImage, stepAtPoint, upscale, viewScale, type SampledImage,
} from '@bitsori/browser';
import { addItem, itemToBlob, listItems } from './library';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const els = {
  cameraScreen: $('cameraScreen'), resultScreen: $('resultScreen'), libraryScreen: $('libraryScreen'),
  video: $<HTMLVideoElement>('video'), cameraFallback: $('cameraFallback'), cameraMessage: $('cameraMessage'),
  shutterBtn: $('shutterBtn'), galleryBtn: $('galleryBtn'), fallbackGalleryBtn: $('fallbackGalleryBtn'), flipBtn: $('flipBtn'),
  galleryInput: $<HTMLInputElement>('galleryInput'), libraryBtn: $('libraryBtn'),
  view: $<HTMLCanvasElement>('view'), playBtn: $('playBtn'), timeLabel: $('timeLabel'), totalLabel: $('totalLabel'),
  backBtn: $('backBtn'), saveBtn: $('saveBtn'), resultNote: $('resultNote'),
  libraryBackBtn: $('libraryBackBtn'), libraryGrid: $('libraryGrid'), libraryEmpty: $('libraryEmpty'),
  paywall: $('paywall'), paywallEmoji: $('paywallEmoji'), paywallTitle: $('paywallTitle'), paywallDesc: $('paywallDesc'),
  buyBtn: $<HTMLButtonElement>('buyBtn'), restoreBtn: $('restoreBtn'), paywallClose: $('paywallClose'),
  toast: $('toast'), strength: $<HTMLInputElement>('strength'), strengthLabel: $('strengthLabel'),
};
const viewCtx = els.view.getContext('2d')!;

/** 사진을 이 가로 칸 수로 줄여 노래로 만든다 */
const GRID_WIDTH = 32;

// TODO: 스토어 결제 연동 시 실제 PurchaseProvider로 교체 (RevenueCat 또는 Capacitor 결제 플러그인)
const entitlements = new Entitlements(new DevPurchaseProvider());

/** 필터 강도 (필터를 바꿔도 유지) */
let strength = DEFAULT_SETTINGS.strength;

const state = {
  filter: DEFAULT_FILTER_ID,
  settings: settingsFor(DEFAULT_FILTER_ID),
  facing: 'environment' as 'environment' | 'user',
  stream: null as MediaStream | null,
  /** 지금 노래의 원본 (찍은 프레임 또는 불러온 이미지) */
  source: null as { image: CanvasImageSource; width: number; height: number; cell: number; source: string } | null,
  sampled: null as SampledImage | null,
  score: null as Score | null,
  scale: 1,
  step: 0,
  /** 공유받은 작품이면 그 필터가 잠겨 있어도 감상할 수 있다 */
  shared: false,
  /** 새 사진이면 사진 복잡함에 맞춰 빠르기를 정한다 (저장된 작품은 그대로) */
  photoTempo: true,
};

const player = new ScorePlayer({
  onStep: (step) => {
    state.step = step;
    draw();
    els.timeLabel.textContent = clock(step * player.stepSeconds);
  },
  onStateChange: (s) => { els.playBtn.textContent = s === 'playing' ? '❚❚' : '▶'; },
  onEnd: () => {
    state.step = 0;
    draw();
    els.timeLabel.textContent = clock(0);
  },
});

/** 필터의 추천 설정. 조·장단조는 사진이 정한다 (key·mode = auto) */
function settingsFor(filterId: string): Settings {
  const f = getFilter(filterId);
  return { ...DEFAULT_SETTINGS, ...f.suggested, filter: f.id, strength };
}

const clock = (sec: number) => {
  sec = Math.max(0, Math.round(sec));
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
};

let toastTimer = 0;
function toast(text: string) {
  els.toast.textContent = text;
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => { els.toast.hidden = true; }, 2200);
}

function show(screen: 'camera' | 'result' | 'library') {
  els.cameraScreen.hidden = screen !== 'camera';
  els.resultScreen.hidden = screen !== 'result';
  els.libraryScreen.hidden = screen !== 'library';
  if (screen === 'camera') startCamera();
  else stopCamera();
  if (screen !== 'result') player.stop();
}

// ---------- 카메라 ----------
async function startCamera() {
  if (state.stream) return;
  if (!navigator.mediaDevices?.getUserMedia) return cameraUnavailable('이 브라우저에서는 카메라를 쓸 수 없어요. (https 필요)');
  try {
    state.stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: state.facing, width: { ideal: 1280 }, height: { ideal: 1280 } },
      audio: false,
    });
    els.video.srcObject = state.stream;
    els.cameraFallback.hidden = true;
  } catch {
    cameraUnavailable('카메라 권한이 없어요. 설정에서 허용하거나 사진을 골라 주세요.');
  }
}

function stopCamera() {
  state.stream?.getTracks().forEach((t) => t.stop());
  state.stream = null;
  els.video.srcObject = null;
}

function cameraUnavailable(message: string) {
  els.cameraMessage.textContent = message;
  els.cameraFallback.hidden = false;
}

/** 셔터: 지금 화면(가운데 정사각형)을 찍어 바로 노래로 */
async function capture() {
  const v = els.video;
  if (!state.stream || !v.videoWidth) return;
  const side = Math.min(v.videoWidth, v.videoHeight);
  const frame = document.createElement('canvas');
  frame.width = side;
  frame.height = side;
  const ctx = frame.getContext('2d')!;
  if (state.facing === 'user') { // 셀카는 거울처럼
    ctx.translate(side, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(v, (v.videoWidth - side) / 2, (v.videoHeight - side) / 2, side, side, 0, 0, side, side);
  state.shared = false;
  if (!entitlements.canUse(state.filter)) state.filter = DEFAULT_FILTER_ID;
  state.settings = settingsFor(state.filter);
  state.photoTempo = true;
  state.source = { image: frame, width: side, height: side, cell: 1, source: 'camera' };
  openResult(true);
}

// ---------- 사진 불러오기 (갤러리·보관함) ----------
async function openImage(file: Blob, source: 'gallery' | 'library') {
  const { img, meta } = await loadImageFile(file, 'image');
  const w = img.naturalWidth;
  if (meta) {
    // 빛소리로 만든 작품: 저장된 설정 그대로
    state.settings = { ...DEFAULT_SETTINGS, ...settingsFromMeta(meta) };
    state.filter = state.settings.filter;
    state.photoTempo = false;
    setStrength(state.settings.strength);
    state.shared = !entitlements.canUse(state.filter);
    const cell = clampInt(meta.cell ?? 1, 1, 64);
    state.source = { image: img, width: w, height: img.naturalHeight, cell: w % cell === 0 ? cell : 1, source };
  } else {
    state.shared = false;
    if (!entitlements.canUse(state.filter)) state.filter = DEFAULT_FILTER_ID;
    state.settings = settingsFor(state.filter);
    state.photoTempo = true;
    const pixels = imagePixels(img);
    state.source = { image: img, width: w, height: img.naturalHeight, cell: pixels ? detectCellSize(pixels) : 1, source };
  }
  openResult(true);
}

// ---------- 결과 ----------
function rebuild() {
  const src = state.source!;
  const exact = src.cell > 1;
  const targetWidth = exact ? src.width / src.cell : Math.min(GRID_WIDTH, src.width);
  state.sampled = sampleImage(src.image, src.width, src.height, targetWidth, exact);
  state.score = buildScore(state.sampled.sample, state.settings);
  const f = getFilter(state.filter);
  if (state.photoTempo && f.suggested.bpm) state.settings.bpm = tempoFromPhoto(f.suggested.bpm, state.score.features);
  // 사진에서 정해진 조·장단조를 기록해 둔다 (저장하면 다시 열어도 같은 멜로디)
  state.settings.key = state.score.key;
  state.settings.mode = state.score.mode;
  player.setStrength(state.settings.strength);
  player.setFilter(state.settings.filter);
  player.setTempo(state.settings.bpm);
  player.setUnit(state.settings.unit);
  player.setScore(state.score);
  const { width: w, height: h } = state.sampled.sample;
  state.scale = viewScale(w, h, 720, 720);
  els.view.width = w * state.scale;
  els.view.height = h * state.scale;
  state.step = 0;
  draw();
  els.timeLabel.textContent = clock(0);
  els.totalLabel.textContent = clock(state.score.totalSteps * player.stepSeconds);
  const tune = f.scale === 'chromatic' ? '반음 12개 그대로' : `${keyLabel(state.score.key, state.score.mode)} · ${state.settings.bpm} BPM`;
  els.resultNote.textContent = state.shared
    ? `${f.emoji} ${f.label} 필터로 만든 작품이에요 — 감상은 무료 · ${tune}`
    : `${f.emoji} ${f.label} · 이 사진은 ${tune}`;
  els.strength.closest('label')!.setAttribute('aria-disabled', String(!f.template.length));
  els.strength.disabled = !f.template.length;
  renderFilters();
}

async function openResult(autoplay: boolean) {
  show('result');
  rebuild();
  if (autoplay) await player.play(); // 셔터·사진 선택이 사용자 동작이라 바로 재생할 수 있다
}

function draw() {
  if (!state.sampled) return;
  drawScoreView(viewCtx, { image: state.sampled.canvas, score: state.score, scale: state.scale, step: state.step });
}

function currentMeta(): BitsoriMeta {
  return {
    app: META_APP, version: META_VERSION, ...state.settings, filter: state.filter,
    length: state.score!.length, lines: state.score!.lineCount, source: state.source!.source,
  };
}

/** 보관함에 넣고, 공유 시트(없으면 다운로드)로 내보낸다 */
async function save() {
  if (!state.sampled || !state.score) return;
  const meta = currentMeta();
  await addItem(await canvasToPngBlob(state.sampled.canvas, { ...meta, cell: 1 }));
  const { sample, canvas } = state.sampled;
  const cell = Math.max(1, Math.min(32, Math.floor(1024 / Math.max(sample.width, sample.height))));
  const blob = await canvasToPngBlob(upscale(canvas, cell), { ...meta, cell });
  const file = new File([blob], `bitsori-${Date.now()}.png`, { type: 'image/png' });
  toast('보관함에 저장했어요');
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: '빛소리' });
    } catch {
      /* 사용자가 공유를 취소함 */
    }
  } else {
    download(blob, file.name);
  }
}

// ---------- 필터 ----------
function renderFilters() {
  document.querySelectorAll<HTMLElement>('[data-role="filters"]').forEach((strip) => {
    strip.innerHTML = '';
    for (const f of FILTERS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'filter';
      const locked = !entitlements.canUse(f.id);
      b.classList.toggle('active', f.id === state.filter);
      b.classList.toggle('locked', locked);
      b.setAttribute('aria-pressed', String(f.id === state.filter));
      b.innerHTML = `<span class="emoji"></span><span></span>${locked ? '<span class="lock" aria-label="유료">🔒</span>' : ''}`;
      b.firstElementChild!.textContent = f.emoji;
      b.children[1].textContent = f.label;
      b.addEventListener('click', () => chooseFilter(f.id));
      strip.appendChild(b);
    }
  });
}

async function chooseFilter(id: string) {
  if (!entitlements.canUse(id)) return openPaywall(id);
  state.filter = id;
  state.shared = false;
  if (els.resultScreen.hidden || !state.source) return renderFilters();
  // 결과 화면: 같은 사진에 새 필터를 입혀 처음부터 다시 재생 (조·빠르기는 다시 사진에 맞춘다)
  state.settings = settingsFor(id);
  state.photoTempo = true;
  rebuild();
  await player.play();
}

let paywallFilter = '';
async function openPaywall(id: string) {
  const f = getFilter(id);
  paywallFilter = id;
  els.paywallEmoji.textContent = f.emoji;
  els.paywallTitle.textContent = `${f.label} 필터`;
  els.paywallDesc.textContent = f.description;
  els.buyBtn.textContent = '구매하기';
  els.paywall.hidden = false;
  const price = await entitlements.provider.price?.(`app.bitsori.filter.${id}`);
  if (price && paywallFilter === id) els.buyBtn.textContent = `${price} 구매하기`;
}

async function buy() {
  els.buyBtn.disabled = true;
  try {
    if (await entitlements.purchase(paywallFilter)) {
      els.paywall.hidden = true;
      toast(`${getFilter(paywallFilter).label} 필터를 쓸 수 있어요`);
      await chooseFilter(paywallFilter);
    }
  } finally {
    els.buyBtn.disabled = false;
  }
}

function setStrength(v: number) {
  strength = v;
  els.strength.value = String(v);
  els.strengthLabel.textContent = `${v}%`;
}

// ---------- 보관함 ----------
function openLibrary() {
  show('library');
  const items = listItems();
  els.libraryEmpty.hidden = items.length > 0;
  els.libraryGrid.innerHTML = '';
  for (const item of items) {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('aria-label', new Date(item.createdAt).toLocaleString());
    const img = document.createElement('img');
    img.src = item.png;
    img.alt = '';
    b.appendChild(img);
    b.addEventListener('click', async () => openImage(await itemToBlob(item), 'library'));
    els.libraryGrid.appendChild(b);
  }
}

// ---------- 시작 ----------
els.shutterBtn.addEventListener('click', capture);
[els.galleryBtn, els.fallbackGalleryBtn].forEach((b) => b.addEventListener('click', () => els.galleryInput.click()));
els.galleryInput.addEventListener('change', () => {
  const f = els.galleryInput.files?.[0];
  els.galleryInput.value = '';
  if (f) openImage(f, 'gallery');
});
els.flipBtn.addEventListener('click', () => {
  state.facing = state.facing === 'environment' ? 'user' : 'environment';
  stopCamera();
  startCamera();
});
els.libraryBtn.addEventListener('click', openLibrary);
els.libraryBackBtn.addEventListener('click', () => show('camera'));
els.backBtn.addEventListener('click', () => show('camera'));
els.saveBtn.addEventListener('click', save);
els.playBtn.addEventListener('click', () => (player.state === 'playing' ? player.pause() : player.play()));
els.view.addEventListener('click', (e) => {
  if (!state.score) return;
  const { step } = stepAtPoint(els.view, state.score, e.clientX, e.clientY);
  state.step = step;
  player.seek(step);
  draw();
});
els.buyBtn.addEventListener('click', buy);
els.restoreBtn.addEventListener('click', async () => {
  await entitlements.restore();
  toast('구매 내역을 불러왔어요');
});
els.paywallClose.addEventListener('click', () => { els.paywall.hidden = true; });
entitlements.onChange(renderFilters);
els.strength.addEventListener('input', () => setStrength(Number(els.strength.value)));
els.strength.addEventListener('change', () => {
  state.settings.strength = strength;
  player.setStrength(strength); // 반주만 바뀌므로 재생을 이어간다
});

renderFilters();
player.ready(); // 피아노 소리를 미리 받아 둔다 (첫 촬영 후 바로 재생되도록)
show('camera');
