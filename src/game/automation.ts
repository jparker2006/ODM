// window.__odm: the handle the Playwright browser runner uses to start scenarios, pause for
// screenshots, and read frame timings, adapter info and game state.

import type { TelemetryFrame } from '../sim/sim';
import type { TuningKey } from '../sim/tuning';
import type { PassTime } from '../render/renderer';

export interface AdapterReport {
  vendor: string;
  architecture: string;
  device: string;
  description: string;
  isFallback: boolean;
  timestamps: boolean;
}

interface Bindings {
  start: () => void;
  telemetry: () => TelemetryFrame;
  renderScale: () => number;
  passTimes: () => { total: number; passes: PassTime[] };
  cameraPulledIn: () => number;
  pose: () => string;
  crosshair: () => string;
  gas: () => number;
  toggleOverlay: () => void;
  togglePanel: () => void;
  setTuning: (k: TuningKey, v: number) => void;
  getTuning: (k: TuningKey) => number;
  camera: () => { fov: number; roll: number; trauma: number; pulledIn: number; kick: number; lastStep: { distance: number; shake: number } };
  hud: () => {
    blades: number;
    kills: number;
    grabShown: boolean;
    escape: number;
    supplying: boolean;
    marker: { kind: string; at: number };
    crosshair: string;
  };
  audioLog: () => { sound: string; event: string; played: boolean }[];
  titan: () => { brain: string; x: number; z: number; yaw: number; h: number; visible: boolean } | null;
  steam: () => number;
}

export class Automation {
  state: 'loading' | 'ready' | 'running' | 'done' | 'error' | 'no-webgpu' = 'loading';
  scenario: string | null = null;
  adapter: AdapterReport | null = null;
  paused = false;
  pauseLabel = '';
  replay = false;
  frame = 0;
  simTime = 0;
  frameTimes: number[] = [];
  /** JavaScript time spent inside each recorded frame (ms). */
  jsTimes: number[] = [];
  minRenderScale = Infinity;
  /** Frames in which the camera was inside world geometry (must stay 0). */
  cameraInsideFrames = 0;
  /** Of those, frames inside a Titan's body. */
  cameraInsideTitanFrames = 0;
  /** Frames rendered while running, and of those, frames with the Titan on screen. */
  viewFrames = 0;
  titanInViewFrames = 0;
  /** Simulation times (s) at which to pause, for probes by the runner. */
  pauseTimes: number[] = [];
  errors: string[] = [];
  /** How many times each simulation event has fired since boot (for live-play checks). */
  eventCounts: Record<string, number> = {};
  tuningTable: (all: boolean) => string = () => '';
  private b: Bindings | null = null;

  bind(b: Bindings): void {
    this.b = b;
  }

  start(opts: { replay?: boolean } = {}): void {
    this.replay = Boolean(opts.replay);
    this.b?.start();
  }

  pause(label: string): void {
    this.paused = true;
    this.pauseLabel = label;
  }

  resume(): void {
    this.paused = false;
    this.pauseLabel = '';
  }

  recordFrame(ms: number): void {
    this.frameTimes.push(ms);
  }

  recentFrames(): number[] {
    return this.frameTimes.slice(-240);
  }

  noteRenderScale(s: number): void {
    if (this.state === 'running') this.minRenderScale = Math.min(this.minRenderScale, s);
  }

  telemetry(): TelemetryFrame | null {
    return this.b?.telemetry() ?? null;
  }

  get game(): Bindings | null {
    return this.b;
  }
}

declare global {
  interface Window {
    __odm: Automation;
  }
}
