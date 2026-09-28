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
  override beginRender(uid: string, _scene: unknown, camera: Camera, _target: RenderTarget | null): void {
    // The main camera's pass (three renders it into an internal target, then outputs) is the scene;
    // the sun's shadow camera renders the shadow map.
    this.labels.set(uid.replace(/:f\d+$/, ''), camera === this.mainCamera ? 'scene' : 'shadow');
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
  private frameEma = 0;
  private intervalEma = 16.7;
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

  /**
   * Compiles every pipeline and uploads every buffer before the player gains control: frustum
   * culling is switched off and the sun's shadow box is stretched over the whole district for a few
   * frames, so no object is drawn (in either pass) for the first time mid-flight.
   */
  async prewarm(camera: Camera): Promise<void> {
    const culled: { o: { frustumCulled: boolean } }[] = [];
    this.scene.traverse((o) => {
      if (o.frustumCulled) {
        culled.push({ o });
        o.frustumCulled = false;
      }
    });
    const s = this.sun.shadow.camera;
    const saved = [s.left, s.right, s.top, s.bottom, s.far];
    s.left = -1100;
    s.right = 1100;
    s.top = 1100;
    s.bottom = -1100;
    s.far = 3000;
    s.updateProjectionMatrix();
    const target = this.sun.target.position.clone();
    this.sun.target.position.set(0, 0, 0);
    this.sun.position.copy(SUN_DIR).multiplyScalar(1500);
    this.sun.target.updateMatrixWorld();
    await this.renderer.compileAsync(this.scene, camera);
    for (let i = 0; i < 3; i++) this.renderer.render(this.scene, camera);
    [s.left, s.right, s.top, s.bottom, s.far] = saved as [number, number, number, number, number];
    s.updateProjectionMatrix();
    this.sun.target.position.copy(target);
    this.sun.target.updateMatrixWorld();
    for (const c of culled) c.o.frustumCulled = true;
    for (let i = 0; i < 2; i++) this.renderer.render(this.scene, camera);
  }

  render(camera: Camera, frameMs: number, adaptive: boolean): void {
    this.renderer.render(this.scene, camera);
    this.frameCount++;
    if (adaptive) this.adapt(frameMs);
    if (this.timestamps && !this.resolving && this.frameCount % 15 === 0) void this.resolveTimes();
  }

  /**
   * Adaptive render scale. With GPU timestamps it reacts to GPU time (frame intervals under vsync
   * only ever show the refresh period, which reads as load when it is not). Without timestamps it
   * reacts only to frames that clearly miss the refresh. Changes are rare because each one resizes
   * the canvas and reallocates render targets, which itself costs a frame.
   */
  private adapt(frameMs: number): void {
    const t = this.tuning;
    const load = this.timestamps ? this.gpuTotal : frameMs;
    const high = this.timestamps ? 13 : 22;
    const low = this.timestamps ? 8 : 12;
    this.frameEma += (load - this.frameEma) * 0.03;
    this.intervalEma += (frameMs - this.intervalEma) * 0.03;
    this.sinceScale++;
    if (this.sinceScale < 120 || (this.timestamps && this.gpuTotal === 0)) return;
    let next = this.renderScale;
    // Only shed resolution when frames are actually missing the refresh as well: with vsync off,
    // Apple GPU timestamps overlap across passes and read high even when frames are fast.
    if (this.frameEma > high && this.intervalEma > 17.5) next = Math.max(t.renderScaleMin, this.renderScale - 0.05);
    else if (this.frameEma < low && this.sinceScale > 240) next = Math.min(t.renderScaleMax, this.renderScale + 0.05);
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
