// HUD: crosshair (in range, assisted, out of range), gas meter, and the start / pause / error overlay.

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
  crosshair: CrosshairState = 'out';
  gasFraction = 1;

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
