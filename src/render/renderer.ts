// WebGPU renderer, scene, lighting, adaptive render scale and per-pass GPU timing.

import {
  WebGPURenderer,
  Scene,
  Color,
  Fog,
  HemisphereLight,
  DirectionalLight,
  PCFShadowMap,
  ACESFilmicToneMapping,
  SRGBColorSpace,
  InspectorBase,
  TimestampQuery,
  Vector3,
  type Camera,
  type RenderTarget,
} from 'three/webgpu';
import { mix, color, positionWorldDirection, max, pow, float } from 'three/tsl';
import type { Tuning } from '../sim/tuning';

export interface PassTime {
  label: string;
  ms: number;
}

/** Records which render context (pass) each GPU timestamp belongs to. */
class PassInspector extends InspectorBase {
  mainCamera: Camera | null = null;
  labels = new Map<string, string>();
  override beginRender(uid: string, _scene: unknown, camera: Camera, target: RenderTarget | null): void {
    const ctx = uid.replace(/:f\d+$/, '');
    let label = 'scene';
    if (camera !== this.mainCamera) label = 'shadow';
    else if (target) label = 'offscreen';
    this.labels.set(ctx, label);
  }
}

export const SUN_DIR = new Vector3(-0.62, 0.42, 0.66).normalize(); // low western sun, late afternoon

export class Renderer {
  readonly renderer: WebGPURenderer;
  readonly scene = new Scene();
  readonly sun: DirectionalLight;
  readonly timestamps: boolean;
  renderScale = 1;
  passTimes: PassTime[] = [];
  gpuTotal = 0;
  private inspector = new PassInspector();
  private frameEma = 16.7;
  private sinceScale = 0;
  private frameCount = 0;
  private resolving = false;

  constructor(
    canvasParent: HTMLElement,
    private readonly tuning: Tuning,
    timestamps: boolean,
  ) {
    this.timestamps = timestamps;
    this.renderer = new WebGPURenderer({ antialias: true, powerPreference: 'high-performance', trackTimestamp: timestamps });
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = PCFShadowMap;
    this.renderer.inspector = this.inspector;
    canvasParent.appendChild(this.renderer.domElement);

    // Sky: warm horizon to a deeper zenith.
    const horizon = color(new Color('#f1c9a0'));
    const zenith = color(new Color('#6f93c4'));
    const h = max(positionWorldDirection.y, float(0));
    this.scene.backgroundNode = mix(horizon, zenith, pow(h, float(0.55)));
    this.scene.fog = new Fog(new Color('#e3c4a4'), 250, 2600);

    this.scene.add(new HemisphereLight(new Color('#bcd2ee'), new Color('#7a6a58'), 1.1));
    this.sun = new DirectionalLight(new Color('#ffd9ae'), 3.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const s = this.sun.shadow.camera;
    s.left = -90;
    s.right = 90;
    s.top = 90;
    s.bottom = -90;
    s.near = 1;
    s.far = 600;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.04;
    this.scene.add(this.sun, this.sun.target);
  }

  async init(camera: Camera): Promise<void> {
    this.inspector.mainCamera = camera;
    await this.renderer.init();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  resize(): void {
    this.renderer.setPixelRatio(window.devicePixelRatio * this.renderScale);
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  /** Keeps the sun's shadow box centered on the player, snapped to texels to avoid shimmer. */
  followSun(p: { x: number; y: number; z: number }): void {
    const texel = 180 / 2048;
    const cx = Math.round(p.x / texel) * texel;
    const cz = Math.round(p.z / texel) * texel;
    this.sun.target.position.set(cx, p.y, cz);
    this.sun.position.set(cx + SUN_DIR.x * 300, p.y + SUN_DIR.y * 300, cz + SUN_DIR.z * 300);
    this.sun.target.updateMatrixWorld();
  }

  async prewarm(camera: Camera): Promise<void> {
    await this.renderer.compileAsync(this.scene, camera);
    for (let i = 0; i < 3; i++) this.renderer.render(this.scene, camera);
  }

  render(camera: Camera, frameMs: number, adaptive: boolean): void {
    this.renderer.render(this.scene, camera);
    this.frameCount++;
    if (adaptive) this.adapt(frameMs);
    if (this.timestamps && !this.resolving && this.frameCount % 15 === 0) void this.resolveTimes();
  }

  private adapt(frameMs: number): void {
    const t = this.tuning;
    this.frameEma += (frameMs - this.frameEma) * 0.05;
    this.sinceScale++;
    if (this.sinceScale < 45) return;
    let next = this.renderScale;
    if (this.frameEma > 17.8) next = Math.max(t.renderScaleMin, this.renderScale - 0.05);
    else if (this.frameEma < 13.5) next = Math.min(t.renderScaleMax, this.renderScale + 0.05);
    if (next !== this.renderScale) {
      this.renderScale = +next.toFixed(2);
      this.resize();
      this.sinceScale = 0;
    }
  }

  private async resolveTimes(): Promise<void> {
    this.resolving = true;
    try {
      this.gpuTotal = (await this.renderer.resolveTimestampsAsync(TimestampQuery.RENDER)) ?? 0;
      const pool = (this.renderer.backend as unknown as { timestampQueryPool: Record<string, { timestamps: Map<string, number> } | null> })
        .timestampQueryPool.render;
      if (!pool) return;
      // Keep only the latest frame's contexts and sum by pass label.
      let latest = -1;
      for (const uid of pool.timestamps.keys()) latest = Math.max(latest, Number(uid.match(/:f(\d+)$/)?.[1] ?? -1));
      const sums = new Map<string, number>();
      for (const [uid, ms] of pool.timestamps) {
        if (Number(uid.match(/:f(\d+)$/)?.[1] ?? -1) !== latest) continue;
        const label = this.inspector.labels.get(uid.replace(/:f\d+$/, '')) ?? 'other';
        sums.set(label, (sums.get(label) ?? 0) + ms);
      }
      this.passTimes = [...sums].map(([label, ms]) => ({ label, ms })).sort((a, b) => a.label.localeCompare(b.label));
    } finally {
      this.resolving = false;
    }
  }
}
