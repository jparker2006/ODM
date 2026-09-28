// HUD: crosshair (in range, assisted, out of range), gas and blade meters, hit and kill markers,
// the grab warning with escape progress, the kill count, and the start / pause / error overlay.

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;

export type CrosshairState = 'in' | 'assist' | 'out';

export class Hud {
  private hud = $('hud');
  private cross = $('crosshair');
  private gas = $('gas');
  private gasFill = $('gas-fill');
  private overlay = $('overlay');
  private overlayText = $('overlay-text');
  private help = $('controls-help');
  private bladesEl = $('blades');
  private bladesFill = $('blades-fill');
  private hitEl = $('hitmark');
  private killsEl = $('kills');
  private killsN = $('kills-n');
  private grabEl = $('grab');
  private escapeFill = $('escape-fill');
  private supplyEl = $('supply');
  crosshair: CrosshairState = 'out';
  gasFraction = 1;
  bladeFraction = 1;
  kills = 0;
  grabShown = false;
  escape = 0;
  supplying = false;
  /** The last marker shown and when (performance.now ms), for the features check. */
  lastMarker: { kind: 'hit' | 'kill' | ''; at: number } = { kind: '', at: 0 };

  setCrosshair(state: CrosshairState): void {
    if (state === this.crosshair) return;
    this.crosshair = state;
    this.cross.className = state === 'assist' ? 'in assist' : state;
  }

  setGas(fraction: number): void {
    this.gasFraction = fraction;
    this.gasFill.style.transform = `scaleX(${Math.max(0, Math.min(1, fraction))})`;
    this.gas.classList.toggle('low', fraction < 0.2);
  }

  setBlades(fraction: number): void {
    this.bladeFraction = fraction;
    this.bladesFill.style.transform = `scaleX(${Math.max(0, Math.min(1, fraction))})`;
    this.bladesEl.classList.toggle('dull', fraction <= 1e-6);
  }

  /** A slash connected: a quick marker, or a distinct lingering one for a kill. */
  marker(kind: 'hit' | 'kill'): void {
    this.hitEl.className = '';
    void this.hitEl.offsetWidth; // restart the animation
    this.hitEl.className = kind;
    this.lastMarker = { kind, at: performance.now() };
  }

  setKills(n: number): void {
    if (n === this.kills) return;
    this.kills = n;
    this.killsN.textContent = String(n);
    this.killsEl.classList.remove('bump');
    void this.killsEl.offsetWidth;
    this.killsEl.classList.add('bump');
  }

  setGrab(shown: boolean, escape: number): void {
    this.grabShown = shown;
    this.escape = escape;
    this.grabEl.hidden = !shown;
    this.escapeFill.style.transform = `scaleX(${Math.max(0, Math.min(1, escape))})`;
  }

  setSupply(on: boolean): void {
    if (on === this.supplying) return;
    this.supplying = on;
    this.supplyEl.hidden = !on;
    this.gas.classList.toggle('refill', on);
    this.bladesEl.classList.toggle('refill', on);
  }

  showHud(show: boolean): void {
    this.hud.hidden = !show;
  }

  showStart(text: string): void {
    this.overlay.hidden = false;
    this.overlay.className = '';
    this.overlayText.textContent = text;
    this.help.hidden = false;
  }

  hideOverlay(): void {
    this.overlay.hidden = true;
  }

  showError(title: string, text: string): void {
    this.overlay.hidden = false;
    this.overlay.className = 'error';
    this.overlay.querySelector('h1')!.textContent = title;
    this.overlayText.textContent = text;
    this.help.hidden = true;
  }

  onOverlayClick(fn: () => void): void {
    this.overlay.addEventListener('click', fn);
  }
}
