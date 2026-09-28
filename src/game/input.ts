// Keyboard and mouse to per-tick intents. Pointer lock for the camera; Escape releases and pauses.

import { idleIntent, type Intent } from '../sim/sim';
import type { Tuning } from '../sim/tuning';

export class Input {
  yaw: number;
  pitch: number;
  private keys = new Set<string>();
  /** Keys and buttons pressed since the last tick read them, so a tap inside one frame is never lost. */
  private tapped = new Set<string>();
  private mouse = { L: false, R: false };
  private resetQueued = false;
  locked = false;
  onToggleOverlay: (() => void) | null = null;
  onTogglePanel: (() => void) | null = null;
  onLockChange: ((locked: boolean) => void) | null = null;

  constructor(
    private readonly canvas: HTMLElement,
    private readonly tuning: Tuning,
    yaw: number,
    pitch: number,
    /**
     * Test seam (?nolock=1): behave as if the pointer were locked without the Pointer Lock API.
     * Chrome refuses pointer lock when its window is not the active one on the desktop, which is
     * the case for the automated browser while someone else is using the laptop. Key and mouse
     * events are still the real ones.
     */
    private readonly fakeLock = false,
  ) {
    this.yaw = yaw;
    this.pitch = pitch;
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => this.clear());
    canvas.addEventListener('mousedown', (e) => {
      if (!this.locked) return;
      if (e.button === 0) {
        this.mouse.L = true;
        this.tapped.add('MouseL');
      }
      if (e.button === 2) {
        this.mouse.R = true;
        this.tapped.add('MouseR');
      }
      e.preventDefault();
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.L = false;
      if (e.button === 2) this.mouse.R = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    document.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      const s = this.tuning.mouseSensitivity;
      const inv = this.tuning.invertY >= 0.5 ? -1 : 1;
      this.yaw -= e.movementX * s;
      this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch - e.movementY * s * inv));
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.canvas;
      if (!this.locked) this.clear();
      this.onLockChange?.(this.locked);
    });
  }

  requestLock(): void {
    if (this.fakeLock) {
      this.locked = true;
      this.onLockChange?.(true);
      return;
    }
    void this.canvas.requestPointerLock?.();
  }

  private clear(): void {
    this.keys.clear();
    this.tapped.clear();
    this.mouse.L = false;
    this.mouse.R = false;
  }

  private onKey(e: KeyboardEvent, down: boolean): void {
    if (e.code === 'F3' && down) {
      this.onToggleOverlay?.();
      e.preventDefault();
      return;
    }
    if (e.code === 'F4' && down) {
      this.onTogglePanel?.();
      e.preventDefault();
      return;
    }
    if (!this.locked) return;
    if (down && e.code === 'Escape') {
      // Browsers usually release the pointer on Escape themselves; do it explicitly too.
      if (this.fakeLock) {
        this.locked = false;
        this.clear();
        this.onLockChange?.(false);
      } else document.exitPointerLock();
      return;
    }
    if (down && e.code === 'KeyR' && !e.repeat) this.resetQueued = true;
    if (down) {
      this.keys.add(e.code);
      if (!e.repeat) this.tapped.add(e.code);
    } else this.keys.delete(e.code);
    if (['Space', 'ShiftLeft', 'ShiftRight', 'Tab'].includes(e.code)) e.preventDefault();
  }

  intent(): Intent {
    const k = (c: string) => this.keys.has(c) || this.tapped.has(c);
    const it = idleIntent(this.yaw, this.pitch);
    it.hookL = this.mouse.L || this.tapped.has('MouseL');
    it.hookR = this.mouse.R || this.tapped.has('MouseR');
    it.reel = k('ShiftLeft') || k('ShiftRight');
    it.boost = k('Space');
    it.fwd = k('KeyW');
    it.back = k('KeyS');
    it.left = k('KeyA');
    it.right = k('KeyD');
    it.slash = k('KeyE');
    it.reset = this.resetQueued;
    this.resetQueued = false;
    this.tapped.clear();
    return it;
  }
}
