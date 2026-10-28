// 악보 + 필터 반주 재생기. 웹과 앱이 함께 쓴다.
import * as Tone from 'tone';
import {
  arrange, getFilter, midiToName, stepSeconds,
  type BackingNote, type DrumHit, type FilterDef, type Score, type Unit,
} from '@bitsori/core';
import { BackingBand } from './backing';
import { DEFAULT_INSTRUMENT, INSTRUMENTS, type MelodyInstrument } from './instruments';

export type PlaybackState = 'stopped' | 'playing' | 'paused';

export interface PlayerOptions {
  /** 샘플 폴더 주소. 기본: 페이지 기준 'samples/' */
  samplesBaseUrl?: string;
  /** 재생 위치가 바뀔 때 (화면 갱신 타이밍에 맞춰 호출) */
  onStep?(step: number): void;
  onStateChange?(state: PlaybackState): void;
  /** 끝까지 재생했을 때 */
  onEnd?(): void;
}

type StepBacking = { bass: BackingNote[]; pad: BackingNote[]; drums: DrumHit[] };

export class ScorePlayer {
  state: PlaybackState = 'stopped';
  stepIndex = 0;

  private score: Score | null = null;
  private filter: FilterDef = getFilter('none');
  private unit: Unit = '8n';
  private bpm = 120;
  private backing = new Map<number, StepBacking>();
  private repeatId: number | null = null;
  private finishing = false;

  private output: Tone.Gain | null = null;
  private reverb: Tone.Reverb | null = null;
  private band: BackingBand | null = null;
  private instrument: MelodyInstrument | null = null;
  private instrumentKey = DEFAULT_INSTRUMENT;
  private loading: Promise<void> | null = null;
  private readonly samplesBaseUrl: string;

  constructor(private readonly opts: PlayerOptions = {}) {
    this.samplesBaseUrl = opts.samplesBaseUrl ?? new URL('samples/', document.baseURI).href;
  }

  get totalSteps() {
    return this.score?.totalSteps ?? 0;
  }

  get hasScore() {
    return !!this.score;
  }

  /** 한 칸의 재생 시간(초) */
  get stepSeconds() {
    return stepSeconds(this.bpm, this.unit);
  }

  // ---------- 설정 ----------
  /** 악보 교체. keepPosition이면 재생을 이어간다 (칸 배치가 같을 때만 쓴다) */
  setScore(score: Score, keepPosition = false) {
    if (!keepPosition) this.stop();
    this.score = score;
    this.stepIndex = Math.min(this.stepIndex, Math.max(0, score.totalSteps - 1));
    this.rebuildBacking();
  }

  setFilter(id: string) {
    this.filter = getFilter(id);
    if (this.reverb) this.reverb.wet.value = this.filter.reverb;
    this.rebuildBacking();
  }

  setTempo(bpm: number) {
    this.bpm = bpm;
    Tone.Transport.bpm.value = bpm;
  }

  setUnit(unit: Unit) {
    if (unit === this.unit) return;
    this.unit = unit;
    this.rebuildBacking();
    if (this.repeatId !== null && this.state !== 'stopped') {
      Tone.Transport.clear(this.repeatId);
      this.schedule(Tone.Transport.seconds + 0.02);
    }
  }

  /** 악기 불러오기 (샘플 다운로드). 재생 전에 끝나 있어야 한다. */
  loadInstrument(key: string): Promise<void> {
    const def = INSTRUMENTS[key] ?? INSTRUMENTS[DEFAULT_INSTRUMENT];
    this.instrumentKey = INSTRUMENTS[key] ? key : DEFAULT_INSTRUMENT;
    if (this.instrument) {
      this.instrument.releaseAll?.();
      this.instrument.dispose();
    }
    this.instrument = def.create(this.samplesBaseUrl);
    this.instrument.connect(this.ensureOutput());
    this.loading = Tone.loaded();
    return this.loading;
  }

  ready(): Promise<void> {
    return this.loading ?? this.loadInstrument(this.instrumentKey);
  }

  // ---------- 재생 ----------
  async play() {
    if (!this.score) return;
    await Tone.start();
    await this.ready();

    if (this.state === 'paused') {
      Tone.Transport.start();
    } else {
      if (this.stepIndex >= this.score.totalSteps) this.stepIndex = 0;
      Tone.Transport.cancel();
      Tone.Transport.position = 0;
      Tone.Transport.bpm.value = this.bpm;
      this.finishing = false;
      this.schedule(0);
      Tone.Transport.start('+0.05');
    }
    this.setState('playing');
  }

  pause() {
    if (this.state !== 'playing') return;
    Tone.Transport.pause();
    this.releaseAll();
    this.setState('paused');
  }

  stop() {
    Tone.Transport.stop();
    Tone.Transport.cancel();
    this.repeatId = null;
    this.releaseAll();
    this.stepIndex = 0;
    if (this.state !== 'stopped') this.setState('stopped');
  }

  seek(step: number) {
    if (!this.score) return;
    this.stepIndex = Math.max(0, Math.min(this.score.totalSteps - 1, Math.round(step)));
    this.releaseAll();
  }

  dispose() {
    this.stop();
    this.instrument?.dispose();
    this.band?.dispose();
    this.reverb?.dispose();
    this.output?.dispose();
  }

  // ---------- 내부 ----------
  private ensureOutput(): Tone.Gain {
    if (this.output) return this.output;
    const limiter = new Tone.Limiter(-2).toDestination();
    this.reverb = new Tone.Reverb({ decay: 2.6, wet: this.filter.reverb }).connect(limiter);
    this.output = new Tone.Gain(1).connect(this.reverb);
    return this.output;
  }

  private ensureBand(): BackingBand {
    return (this.band ??= new BackingBand(this.ensureOutput()));
  }

  private rebuildBacking() {
    this.backing.clear();
    if (!this.score) return;
    const a = arrange(this.score.totalSteps, this.unit, this.filter);
    const slot = (step: number) => {
      let s = this.backing.get(step);
      if (!s) this.backing.set(step, (s = { bass: [], pad: [], drums: [] }));
      return s;
    };
    a.bass.forEach((n) => slot(n.step).bass.push(n));
    a.pad.forEach((n) => slot(n.step).pad.push(n));
    a.drums.forEach((d) => slot(d.step).drums.push(d));
  }

  private schedule(startAt: number) {
    this.repeatId = Tone.Transport.scheduleRepeat((time) => this.tick(time), this.unit, startAt);
  }

  private tick(time: number) {
    const score = this.score!;
    if (this.stepIndex >= score.totalSteps) {
      if (!this.finishing) {
        this.finishing = true;
        // 마지막 음이 자연스럽게 울리도록 Transport만 멈추고 음은 끊지 않는다
        Tone.Draw.schedule(() => {
          Tone.Transport.stop();
          Tone.Transport.cancel();
          this.repeatId = null;
          this.stepIndex = 0;
          this.setState('stopped');
          this.opts.onEnd?.();
        }, time);
      }
      return;
    }

    const sec = Tone.Time(this.unit).toSeconds();
    const events = score.starts[this.stepIndex];
    if (events && this.instrument) {
      const velocity = Math.max(0.25, Math.min(0.8, 0.85 / Math.sqrt(events.length)));
      for (const e of events) this.instrument.triggerAttackRelease(e.note, e.dur * sec, time, velocity);
    }

    const b = this.backing.get(this.stepIndex);
    if (b) {
      const band = this.ensureBand();
      for (const n of b.bass) band.bass.triggerAttackRelease(midiToName(n.midi), n.dur * sec * 0.95, time, n.velocity);
      for (const n of b.pad) {
        // 분산화음(오르골)은 멜로디 악기로, 지속 화음은 패드로
        if (this.filter.pad === 'arp' && this.instrument) this.instrument.triggerAttackRelease(midiToName(n.midi), n.dur * sec, time, n.velocity);
        else band.pad.triggerAttackRelease(midiToName(n.midi), n.dur * sec, time, n.velocity);
      }
      for (const d of b.drums) band.drum(d.kind, time, d.velocity);
    }

    const step = this.stepIndex;
    Tone.Draw.schedule(() => this.opts.onStep?.(step), time);
    this.stepIndex++;
  }

  private releaseAll() {
    this.instrument?.releaseAll?.();
    this.band?.releaseAll();
  }

  private setState(state: PlaybackState) {
    this.state = state;
    this.opts.onStateChange?.(state);
  }
}
