// The game: boots the renderer and world, runs the fixed-step simulation, and drives either live
// play (keyboard and mouse) or a named scenario (for the browser runner).

import { Sim, DT, TICK_HZ, type SimEvent } from '../sim/sim';
import { makeTuning, type Tuning } from '../sim/tuning';
import { buildWorld, resolveSpawn, resolveOptions, TimelinePlayer, type Scenario, type DistrictData } from '../sim/scenario';
import { sphereCapsule, titanPose, defaultPoseInput } from '../sim/titan-body';
import { Vector3 } from 'three/webgpu';
import { nearSpawn } from '../../scenarios/titans';
import { districtFromGlb } from '../sim/district';
import { v3, lerp, len, type Vec3 } from '../sim/vec';
import { Renderer } from '../render/renderer';
import { CameraRig } from '../render/camera-rig';
import { Mannequin } from '../render/mannequin';
import { GearFx } from '../render/gear-fx';
import { TitanMesh } from '../render/titan-mesh';
import { Steam } from '../render/steam';
import { districtMesh, fixtureMesh, parseGlb } from '../render/world-mesh';
import { Input } from './input';
import { Hud } from '../ui/hud';
import { TuningPanel } from '../ui/tuning-panel';
import { PerfOverlay } from '../ui/perf-overlay';
import { Audio } from '../audio/audio';
import { Automation, type AdapterReport } from './automation';

function settle(r: Renderer, camera: import('three/webgpu').Camera, frames: number): Promise<void> {
  return new Promise((done) => {
    let n = 0;
    const tick = () => {
      r.render(camera, 16.7, false);
      if (++n >= frames) done();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

export interface GameConfig {
  scenario: Scenario | null;
  /** Play live with keyboard and mouse in the scenario's world instead of running its timeline. */
  live?: boolean;
  adapter: GPUAdapter;
  report: AdapterReport;
  automation: Automation;
}

export class Game {
  private sim!: Sim;
  private tuning: Tuning;
  private renderer!: Renderer;
  private rig!: CameraRig;
  private mannequin!: Mannequin;
  private fx = new GearFx();
  private titanMesh: TitanMesh | null = null;
  private steam = new Steam();
  private probe = new Vector3();
  private input!: Input;
  private hud = new Hud();
  private panel!: TuningPanel;
  private perf = new PerfOverlay();
  private audio = new Audio();
  private player: TimelinePlayer | null = null;
  private prevPos: Vec3 = v3();
  private acc = 0;
  private lastFrame = 0;
  private running = false;
  private frameTimes: number[] = [];
  private pendingEvents: SimEvent[] = [];

  constructor(private readonly cfg: GameConfig) {
    this.tuning = makeTuning(cfg.scenario?.tuning ?? {});
  }

  async boot(): Promise<void> {
    const auto = this.cfg.automation;
    const s = this.cfg.scenario;
    const needsDistrict = !s || s.world === 'district';
    let district: DistrictData | null = null;
    let districtBytes: ArrayBuffer | null = null;
    if (needsDistrict) {
      districtBytes = await (await fetch('assets/district.glb')).arrayBuffer();
      district = districtFromGlb(new Uint8Array(districtBytes));
    }
    // The default live game: the district, with one Titan on the avenue in sight of the spawn roof.
    const scenario: Scenario = s ?? {
      name: 'play',
      description: 'Live play',
      world: 'district',
      spawn: 'district',
      duration: Infinity,
      timeline: [],
      titan: (m) => {
        const at = nearSpawn(m);
        const sp = m['spawn'] ?? [0, 0, 0];
        return { at, yaw: Math.atan2(-(sp[0] - at[0]), -(sp[2] - at[1])) };
      },
    };
    const world = buildWorld(scenario, district);
    const spawn = resolveSpawn(scenario, district);
    const options = resolveOptions(scenario, district);
    this.sim = new Sim(world, this.tuning, spawn, options);
    this.prevPos = { ...this.sim.pos };
    if (s && !this.cfg.live) this.player = new TimelinePlayer(s, spawn);

    const app = document.getElementById('app')!;
    this.renderer = new Renderer(app, this.tuning, this.cfg.report.timestamps);
    this.rig = new CameraRig(window.innerWidth / window.innerHeight);
    await this.renderer.init(this.rig.camera);
    window.addEventListener('resize', () => {
      this.rig.camera.aspect = window.innerWidth / window.innerHeight;
      this.rig.camera.updateProjectionMatrix();
    });

    const worldObj = districtBytes ? await districtMesh(districtBytes) : fixtureMesh(world.boxes);
    this.renderer.scene.add(worldObj);
    const mq = await parseGlb(await (await fetch('assets/mannequin.glb')).arrayBuffer());
    this.mannequin = new Mannequin(mq);
    this.renderer.scene.add(this.mannequin.root, this.fx.group, this.steam.mesh);
    // Titans: only in worlds that have one or can spawn one.
    if (options.titan || (options.titanSpawns?.length ?? 0) > 0) {
      this.titanMesh = new TitanMesh(await parseGlb(await (await fetch('assets/titan.glb')).arrayBuffer()));
      this.renderer.scene.add(this.titanMesh.group);
    }

    const fakeLock = new URLSearchParams(location.search).get('nolock') === '1';
    this.input = new Input(this.renderer.renderer.domElement, this.tuning, spawn.yaw, spawn.pitch ?? 0, fakeLock);
    this.panel = new TuningPanel(this.tuning);
    this.input.onToggleOverlay = () => this.perf.toggle();
    this.input.onTogglePanel = () => {
      this.panel.toggle();
      if (this.panel.open && this.input.locked) document.exitPointerLock();
    };
    auto.tuningTable = (all) => this.panel.exportTable(all);

    // Prewarm: every pipeline compiles before the player gains control.
    this.fx.showAllForPrewarm(this.sim.pos);
    this.renderer.followSun(this.sim.pos);
    this.rig.update(this.sim, this.sim.pos, this.sim.yaw, this.sim.pitch, 0, 1 / 60);
    this.mannequin.update(this.sim, this.sim.pos, this.sim.vel, 1 / 60);
    this.steam.prewarm(new Vector3(this.sim.pos.x, this.sim.pos.y + 2, this.sim.pos.z));
    if (this.titanMesh) {
      const ti = this.sim.titan;
      if (ti) this.titanMesh.update(ti.pose, ti.h);
      else {
        // No Titan yet: pose a stand-in so its pipelines compile now, not at the first spawn.
        this.titanMesh.update(titanPose(defaultPoseInput(this.sim.pos.x, this.sim.pos.z - 40, 0, 12)), 12);
      }
    }
    await this.renderer.prewarm(this.rig.camera);
    this.fx.update(this.sim, this.sim.pos, 1, false);
    this.rig.snap();

    auto.bind({
      start: () => this.startScenario(),
      telemetry: () => this.sim.telemetry(),
      renderScale: () => this.renderer.renderScale,
      passTimes: () => ({ total: this.renderer.gpuTotal, passes: this.renderer.passTimes }),
      cameraPulledIn: () => this.rig.pulledIn,
      pose: () => this.mannequin.pose,
      crosshair: () => this.hud.crosshair,
      gas: () => this.hud.gasFraction,
      toggleOverlay: () => this.perf.toggle(),
      togglePanel: () => this.panel.toggle(),
      setTuning: (k, v) => {
        this.tuning[k] = v;
      },
      getTuning: (k) => this.tuning[k],
      camera: () => ({ fov: this.rig.fov, roll: this.rig.roll, trauma: this.rig.trauma, pulledIn: this.rig.pulledIn, kick: this.rig.kick, lastStep: this.rig.lastStep }),
      hud: () => ({
        blades: this.hud.bladeFraction,
        kills: this.hud.kills,
        grabShown: this.hud.grabShown,
        escape: this.hud.escape,
        supplying: this.hud.supplying,
        marker: this.hud.lastMarker,
        crosshair: this.hud.crosshair,
      }),
      audioLog: () => this.audio.log.slice(),
      titan: () => {
        const ti = this.sim.titan;
        return ti ? { brain: ti.brain, x: ti.x, z: ti.z, yaw: ti.yaw, h: ti.h, visible: this.titanMesh?.group.visible ?? false } : null;
      },
      steam: () => this.steam.alive,
    });

    this.hud.showHud(true);
    if (this.player) {
      this.hud.hideOverlay();
      // Settle: render one idle second so load-time garbage collection and any late driver work
      // happen before control is given.
      await settle(this.renderer, this.rig.camera, 60);
      auto.state = 'ready';
    } else {
      this.hud.showStart('Click to play.');
      this.hud.onOverlayClick(() => {
        this.input.requestLock();
        this.audio.start();
      });
      this.input.onLockChange = (locked) => {
        this.running = locked;
        if (locked) this.hud.hideOverlay();
        else {
          this.hud.showStart('Paused. Click to resume.');
          this.audio.suspend();
        }
      };
      auto.state = 'ready';
    }
    this.lastFrame = performance.now();
    // three.js drives the loop so its frame counter (used to group GPU timestamps per frame) advances.
    this.renderer.renderer.setAnimationLoop((t) => this.frame(t));
  }

  private startScenario(): void {
    this.running = true;
    this.cfg.automation.state = 'running';
  }

  private stepTick(): void {
    this.prevPos = { ...this.sim.pos };
    const intent = this.player ? this.player.next(this.sim, this.sim.tick) : this.input.intent();
    if (!this.player) {
      this.input.yaw = intent.yaw;
      this.input.pitch = intent.pitch;
    }
    this.sim.step(intent);
    if (this.sim.events.some((e) => e.type === 'reset')) this.rig.snap();
    this.pendingEvents.push(...this.sim.events);
    const counts = this.cfg.automation.eventCounts;
    for (const e of this.sim.events) counts[e.type] = (counts[e.type] ?? 0) + 1;
  }

  private frame(now: number): void {
    const jsStart = performance.now();
    const recording = Boolean(this.player && this.running && !this.cfg.automation.paused);
    const auto = this.cfg.automation;
    const realDt = Math.min(0.1, (now - this.lastFrame) / 1000);
    const frameMs = now - this.lastFrame;
    this.lastFrame = now;

    let alpha = 1;
    let dt = realDt;
    if (this.player) {
      // Scenario: exactly 1/60 s of simulation per rendered frame, paused while the runner captures.
      dt = 1 / 60;
      if (this.running && !auto.paused && auto.state === 'running') {
        auto.recordFrame(frameMs);
        for (let i = 0; i < TICK_HZ / 60; i++) this.stepTick();
        auto.simTime = this.sim.time;
        auto.frame++;
        const sc = this.cfg.scenario!;
        if (auto.pauseTimes.some((t) => Math.abs(t - this.sim.time) < 0.5 / 60)) auto.pause(`probe-${this.sim.time.toFixed(2)}`);
        else if (sc.browser?.shots?.some((t) => Math.abs(t - this.sim.time) < 0.5 / 60)) auto.pause(`shot-${this.sim.time.toFixed(2)}`);
        else if (sc.browser?.replayEvery && auto.replay && auto.frame % sc.browser.replayEvery === 0) auto.pause(`replay-${auto.frame}`);
        if (this.sim.time >= sc.duration - 1e-9) {
          auto.state = 'done';
          this.running = false;
        }
      }
    } else if (this.running) {
      this.acc += realDt;
      while (this.acc >= DT) {
        this.stepTick();
        this.acc -= DT;
      }
      alpha = this.acc / DT;
      this.frameTimes.push(frameMs);
      if (this.frameTimes.length > 240) this.frameTimes.shift();
    }

    const pos = {
      x: lerp(this.prevPos.x, this.sim.pos.x, alpha),
      y: lerp(this.prevPos.y, this.sim.pos.y, alpha),
      z: lerp(this.prevPos.z, this.sim.pos.z, alpha),
    };
    const events = this.pendingEvents;
    this.pendingEvents = [];
    const speed = len(this.sim.vel);
    this.rig.onEvents(events, this.tuning, pos);
    this.audio.onEvents(events, pos);
    this.audio.update(this.sim, speed);
    const yaw = this.player ? this.sim.yaw : this.input.yaw;
    const pitch = this.player ? this.sim.pitch : this.input.pitch;
    this.rig.update(this.sim, pos, yaw, pitch, speed, dt);
    this.mannequin.update(this.sim, pos, this.sim.vel, dt);
    this.fx.update(this.sim, pos, dt, events.some((e) => e.type === 'boostBurst'));
    const ti = this.sim.titan;
    this.titanMesh?.update(ti ? ti.pose : null, ti ? ti.h : 1);
    this.steam.update(ti ? ti.pose : null, ti && !ti.alive ? 1 : 0, dt);
    this.renderer.followSun(pos);

    const aim = this.sim.aim(yaw, pitch);
    this.hud.setCrosshair(aim.valid ? (aim.assisted ? 'assist' : 'in') : 'out');
    this.hud.setGas(this.tuning.infiniteGas >= 0.5 ? 1 : this.sim.gas / this.tuning.gasCapacity);
    this.hud.setBlades(this.sim.blades);
    this.hud.setKills(this.sim.kills);
    this.hud.setGrab(this.sim.grab !== null, this.sim.grab ? Math.min(1, this.sim.grab.presses / this.tuning.escapePresses) : 0);
    this.hud.setSupply(this.sim.supplying);
    for (const e of events) if (e.type === 'slashHit') this.hud.marker(e.kill ? 'kill' : 'hit');

    const cp = this.rig.camera.position;
    const inside: import('../sim/world').SphereContact[] = [];
    this.sim.world.sphereContacts({ x: cp.x, y: cp.y, z: cp.z }, 0.05, inside);
    const inTitan = ti ? ti.pose.capsules.some((c) => sphereCapsule({ x: cp.x, y: cp.y, z: cp.z }, 0.05, c) !== null) : false;
    if (ti && auto.state === 'running') {
      // Is the Titan on screen? Project its chest.
      this.probe.set(ti.x, ti.h * 0.6, ti.z).project(this.rig.camera);
      if (Math.abs(this.probe.x) < 1 && Math.abs(this.probe.y) < 1 && this.probe.z < 1) auto.titanInViewFrames++;
    }
    if (auto.state === 'running') auto.viewFrames++;
    if ((inside.length > 0 || inTitan) && auto.state === 'running') {
      auto.cameraInsideFrames++;
      if (inTitan) auto.cameraInsideTitanFrames++;
    }
    this.renderer.render(this.rig.camera, frameMs, true);
    auto.noteRenderScale(this.renderer.renderScale);

    const info = this.renderer.renderer.info.render;
    this.perf.update(
      {
        frameMs: this.player ? auto.recentFrames() : this.frameTimes,
        renderScale: this.renderer.renderScale,
        gpuTotal: this.renderer.gpuTotal,
        passes: this.renderer.passTimes,
        timestamps: this.renderer.timestamps,
        drawCalls: info.drawCalls,
        triangles: info.triangles,
        mode: this.sim.mode,
        speed,
        gas: this.sim.gas,
        pos: [this.sim.pos.x, this.sim.pos.y, this.sim.pos.z],
        adapter: `${this.cfg.report.vendor} ${this.cfg.report.architecture}`.trim(),
      },
      now,
    );
    if (recording) auto.jsTimes.push(performance.now() - jsStart);
  }
}
