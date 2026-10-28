// 필터 반주 소리: 베이스·코드 패드·드럼. 샘플 없이 합성해서 용량이 들지 않는다.
import * as Tone from 'tone';
import type { DrumKind } from '@bitsori/core';

export class BackingBand {
  readonly bass: Tone.MonoSynth;
  readonly pad: Tone.PolySynth;
  private readonly kick: Tone.MembraneSynth;
  private readonly snare: Tone.NoiseSynth;
  private readonly hat: Tone.MetalSynth;

  constructor(output: Tone.InputNode) {
    this.bass = new Tone.MonoSynth({
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.01, decay: 0.25, sustain: 0.6, release: 0.5 },
      filterEnvelope: { attack: 0.01, decay: 0.2, sustain: 0.4, release: 0.5, baseFrequency: 120, octaves: 2.5 },
      volume: -8,
    }).connect(output);
    this.pad = new Tone.PolySynth(Tone.Synth, {
      oscillator: { type: 'sine' },
      envelope: { attack: 0.4, decay: 0.3, sustain: 0.7, release: 1.6 },
      volume: -17,
    }).connect(output);
    this.kick = new Tone.MembraneSynth({ pitchDecay: 0.04, octaves: 6, volume: -6 }).connect(output);
    this.snare = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.14, sustain: 0 },
      volume: -18,
    }).connect(output);
    this.hat = new Tone.MetalSynth({
      envelope: { attack: 0.001, decay: 0.05, release: 0.01 },
      harmonicity: 5.1, modulationIndex: 32, resonance: 4000, octaves: 1.5,
      volume: -30,
    }).connect(output);
    this.hat.frequency.value = 250;
  }

  drum(kind: DrumKind, time: number, velocity: number) {
    if (kind === 'kick') this.kick.triggerAttackRelease('C1', 0.2, time, velocity);
    else if (kind === 'snare') this.snare.triggerAttackRelease(0.12, time, velocity);
    else this.hat.triggerAttackRelease(0.03, time, velocity);
  }

  releaseAll() {
    this.bass.triggerRelease();
    this.pad.releaseAll();
  }

  dispose() {
    [this.bass, this.pad, this.kick, this.snare, this.hat].forEach((n) => n.dispose());
  }
}
