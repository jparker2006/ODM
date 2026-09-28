// F3 performance overlay: frame time, render scale, per-pass GPU time and a little player state.

import type { PassTime } from '../render/renderer';

export interface PerfSnapshot {
  frameMs: number[];
  renderScale: number;
  gpuTotal: number;
  passes: PassTime[];
  timestamps: boolean;
  drawCalls: number;
  triangles: number;
  mode: string;
  speed: number;
  gas: number;
  pos: [number, number, number];
  adapter: string;
}

export class PerfOverlay {
  private el = document.getElementById('perf')!;
  private last = 0;

  get open(): boolean {
    return !this.el.hidden;
  }

  toggle(): void {
    this.el.hidden = !this.el.hidden;
  }

  update(s: PerfSnapshot, now: number): void {
    if (this.el.hidden || now - this.last < 250) return;
    this.last = now;
    const f = s.frameMs;
    const avg = f.reduce((a, b) => a + b, 0) / Math.max(1, f.length);
    const sorted = [...f].sort((a, b) => a - b);
    const p99 = sorted[Math.floor(sorted.length * 0.99)] ?? 0;
    const passes = s.timestamps
      ? s.passes.map((p) => `  ${p.label.padEnd(9)} ${p.ms.toFixed(2)} ms`).join('\n') || '  (resolving)'
      : '  (GPU timestamps not supported on this adapter)';
    this.el.textContent = [
      `fps        ${(1000 / avg).toFixed(0)}   (${avg.toFixed(2)} ms avg, ${p99.toFixed(1)} ms p99)`,
      `scale      ${s.renderScale.toFixed(2)} x DPR ${window.devicePixelRatio}`,
      `gpu        ${s.timestamps ? s.gpuTotal.toFixed(2) + ' ms' : 'n/a'}`,
      passes,
      `draws      ${s.drawCalls}   tris ${(s.triangles / 1000).toFixed(0)}k`,
      `mode       ${s.mode}   ${s.speed.toFixed(1)} m/s   gas ${s.gas.toFixed(1)}`,
      `pos        ${s.pos.map((v) => v.toFixed(1)).join(', ')}`,
      `adapter    ${s.adapter}`,
    ].join('\n');
  }
}
