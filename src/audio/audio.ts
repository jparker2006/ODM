// Synthesized sound: hook fire, hook catch, cable tension, reel motor, gas and wind (Milestone 1),
// and the fight (Milestone 2): slash swish, blade clang, nape-kill thud and steam hiss, Titan
// footsteps by distance, grab crunch, release whoosh. The AudioContext is created only after a
// click (browsers refuse to start it otherwise). Every sound triggered is written to an event log,
// so a headless run can check which sounds fired without hearing them.

import type { Sim, SimEvent } from '../sim/sim';
import type { Vec3 } from '../sim/vec';

export interface SoundLogEntry {
  sound: string;
  event: string;
  played: boolean;
}

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
  /** Every sound triggered, newest last (capped). */
  readonly log: SoundLogEntry[] = [];

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

  private burst(dur: number, freq: number, gain: number, sweepTo?: number, type: BiquadFilterType = 'bandpass'): void {
    const ctx = this.ctx!;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(freq, t);
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 1.5);
    src.stop(t + dur + 0.02);
  }

  /** Records a sound and reports whether it can play now. */
  private cue(sound: string, event: string): boolean {
    const played = this.ctx !== null && this.ctx.state === 'running';
    this.log.push({ sound, event, played });
    if (this.log.length > 400) this.log.splice(0, this.log.length - 400);
    return this.ctx !== null;
  }

  onEvents(events: SimEvent[], listener?: Vec3): void {
    for (const e of events) {
      switch (e.type) {
        case 'slash':
          if (this.cue('slash-swish', e.type)) {
            this.burst(0.2, 1800, 0.35, 6000);
            this.burst(0.16, 2600, 0.2, 7000);
          }
          break;
        case 'slashHit':
          if (!e.kill && this.cue('blade-clang', e.type)) {
            this.blip(1250, 0.35, 'square', 0.1, 1180);
            this.blip(1710, 0.3, 'triangle', 0.12, 1650);
            this.burst(0.08, 4200, 0.3);
          }
          break;
        case 'napeKill':
          if (this.cue('kill-thud', e.type)) {
            this.blip(70, 0.7, 'sine', 0.9, 28);
            this.blip(140, 0.25, 'triangle', 0.35, 60);
            this.burst(0.25, 600, 0.6, 200, 'lowpass');
          }
          if (this.cue('steam-hiss', e.type)) this.burst(2.6, 5200, 0.22, 3000, 'highpass');
          break;
        case 'titanStep': {
          const d = listener ? Math.hypot(e.pos.x - listener.x, e.pos.y - listener.y, e.pos.z - listener.z) : 40;
          const g = Math.min(0.9, (e.strength * 14) / Math.max(8, d));
          if (g > 0.02 && this.cue('titan-step', e.type)) {
            this.blip(58, 0.45, 'sine', g, 26);
            this.burst(0.2, 180, g * 0.7, 80, 'lowpass');
          }
          break;
        }
        case 'titanNotice':
          if (this.cue('titan-groan', e.type)) this.blip(62, 1.1, 'sawtooth', 0.12, 48);
          break;
        case 'titanWindup':
          if (this.cue('windup-rush', e.type)) this.burst(0.6, 300, 0.3, 1400);
          break;
        case 'grabbed':
          if (this.cue('grab-crunch', e.type)) {
            this.burst(0.25, 900, 0.7, 250, 'lowpass');
            this.blip(95, 0.3, 'square', 0.25, 50);
          }
          break;
        case 'thrown':
          if (this.cue('release-whoosh', e.type)) this.burst(0.5, 350, 0.45, 2400);
          break;
        case 'flinch':
          if (this.cue('titan-grunt', e.type)) this.blip(80, 0.4, 'sawtooth', 0.15, 55);
          break;
        case 'titanCollapse':
          if (this.cue('collapse-rumble', e.type)) this.burst(2.2, 120, 0.5, 50, 'lowpass');
          break;
        case 'supplyStart':
          if (this.cue('supply-clank', e.type)) {
            this.blip(900, 0.12, 'square', 0.08, 850);
            this.blip(640, 0.2, 'triangle', 0.1, 600);
          }
          break;
        case 'supplyDone':
          if (this.cue('supply-done', e.type)) this.blip(1320, 0.18, 'sine', 0.1);
          break;
        default:
          break;
      }
    }
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
    // Held in a fist: the wind drops away.
    if (sim.mode === 'grabbed') speed = 0;
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
