// Synthesized sound for Milestone 1: hook fire, hook catch, cable tension, reel motor, gas and wind.
// The AudioContext is created only after a click (browsers refuse to start it otherwise).

import type { Sim, SimEvent } from '../sim/sim';

export class Audio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private windGain!: GainNode;
  private windFilter!: BiquadFilterNode;
  private gasGain!: GainNode;
  private reelGain!: GainNode;
  private reelOsc!: OscillatorNode;
  private cableGain!: GainNode;
  private cableOsc!: OscillatorNode;
  private noise!: AudioBuffer;

  start(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(ctx.destination);

    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    let seed = 1234567;
    for (let i = 0; i < len; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff;
      d[i] = (seed / 0x7fffffff) * 2 - 1;
    }

    // Wind: looping noise through a lowpass, louder and brighter with speed.
    const wind = this.loopNoise();
    this.windFilter = ctx.createBiquadFilter();
    this.windFilter.type = 'lowpass';
    this.windFilter.frequency.value = 300;
    this.windGain = ctx.createGain();
    this.windGain.gain.value = 0;
    wind.connect(this.windFilter).connect(this.windGain).connect(this.master);

    // Gas: band-passed hiss while thrusting.
    const gas = this.loopNoise();
    const gasBand = ctx.createBiquadFilter();
    gasBand.type = 'bandpass';
    gasBand.frequency.value = 2400;
    gasBand.Q.value = 0.8;
    this.gasGain = ctx.createGain();
    this.gasGain.gain.value = 0;
    gas.connect(gasBand).connect(this.gasGain).connect(this.master);

    // Reel motor: a buzzy saw through a lowpass.
    this.reelOsc = ctx.createOscillator();
    this.reelOsc.type = 'sawtooth';
    this.reelOsc.frequency.value = 90;
    const reelLp = ctx.createBiquadFilter();
    reelLp.type = 'lowpass';
    reelLp.frequency.value = 900;
    this.reelGain = ctx.createGain();
    this.reelGain.gain.value = 0;
    this.reelOsc.connect(reelLp).connect(this.reelGain).connect(this.master);
    this.reelOsc.start();

    // Cable tension: a thin whine that rises with speed.
    this.cableOsc = ctx.createOscillator();
    this.cableOsc.type = 'triangle';
    this.cableOsc.frequency.value = 400;
    this.cableGain = ctx.createGain();
    this.cableGain.gain.value = 0;
    this.cableOsc.connect(this.cableGain).connect(this.master);
    this.cableOsc.start();
  }

  suspend(): void {
    void this.ctx?.suspend();
  }

  private loopNoise(): AudioBufferSourceNode {
    const src = this.ctx!.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.start();
    return src;
  }

  private blip(freq: number, dur: number, type: OscillatorType, gain: number, sweepTo?: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (sweepTo) o.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private burst(dur: number, freq: number, gain: number): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.02);
  }

  onEvents(events: SimEvent[]): void {
    if (!this.ctx) return;
    for (const e of events) {
      if (e.type === 'hookFired') {
        this.blip(1800, 0.05, 'square', 0.12, 700);
        this.burst(0.18, 3500, 0.12);
      } else if (e.type === 'hookAttached') {
        this.blip(160, 0.12, 'triangle', 0.35, 70);
      } else if (e.type === 'hookMissed') {
        this.blip(500, 0.1, 'sine', 0.08, 300);
      } else if (e.type === 'hookStowed') {
        this.blip(900, 0.04, 'square', 0.05);
      } else if (e.type === 'boostBurst') {
        this.burst(0.35, 1800, 0.35);
      } else if (e.type === 'impact' || e.type === 'landed') {
        const s = 'speed' in e ? e.speed : e.impact;
        this.blip(90, 0.2, 'sine', Math.min(0.6, s / 40), 40);
      } else if (e.type === 'taut') {
        this.blip(260, 0.08, 'triangle', 0.18, 180);
      }
    }
  }

  update(sim: Sim, speed: number): void {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const s = Math.min(1, speed / 45);
    this.windGain.gain.setTargetAtTime(0.02 + s * s * 0.5, t, 0.1);
    this.windFilter.frequency.setTargetAtTime(250 + s * 2200, t, 0.1);
    this.gasGain.gain.setTargetAtTime(sim.thrusting ? 0.25 : 0, t, 0.03);
    const reeling = sim.mode === 'reel' && sim.gas > 0;
    this.reelGain.gain.setTargetAtTime(reeling ? 0.09 : 0, t, 0.04);
    this.reelOsc.frequency.setTargetAtTime(reeling ? 110 + speed * 3 : 90, t, 0.05);
    const taut = sim.hooks.some((h) => h.state === 'attached' && h.taut);
    this.cableGain.gain.setTargetAtTime(taut ? 0.015 + s * 0.04 : 0, t, 0.05);
    this.cableOsc.frequency.setTargetAtTime(300 + speed * 18, t, 0.05);
  }
}
