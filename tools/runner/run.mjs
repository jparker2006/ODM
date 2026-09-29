// Browser runner: boots the real game in Google Chrome (real Apple GPU, never a software adapter)
// through Playwright, runs named scenarios at fixed simulation steps, and writes evidence.
//
//   node tools/runner/run.mjs smoke no-webgpu perf replays features
//   node tools/runner/run.mjs shot <scenario>        one scenario, screenshots at its shot times
//
// The game is built with Vite and served with vite preview on a local port for every run.

import { build, preview } from 'vite';
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';
import { loadavg } from 'node:os';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const EVIDENCE = resolve(ROOT, 'evidence');
const PORT = 4190;
// Jake's MacBook Air M4 default display: 1470 x 956 points at 2x.
const VIEWPORT = { width: 1470, height: 956 };
const DPR = 2;

const REPLAYS = ['replay-swing-chain', 'replay-double-thread', 'replay-wall-reel', 'nape-kill', 'grab-escape', 'hook-titan'];

let failures = 0;
const fail = (msg) => {
  failures++;
  console.error(`FAIL ${msg}`);
};
const pass = (msg) => console.log(`PASS ${msg}`);

async function serve() {
  await build({ root: ROOT, logLevel: 'warn' });
  const server = await preview({ root: ROOT, preview: { port: PORT, strictPort: true, host: '127.0.0.1' }, logLevel: 'warn' });
  return server;
}

async function launch({ uncapped = false } = {}) {
  const args = ['--enable-unsafe-webgpu', '--ignore-gpu-blocklist'];
  if (uncapped) args.push('--disable-gpu-vsync', '--disable-frame-rate-limit');
  // Headless by default: it still gets the real Apple GPU (the adapter check proves it) and never
  // opens a window over the desktop. ODM_HEADED=1 shows the window.
  return chromium.launch({ channel: 'chrome', headless: process.env.ODM_HEADED !== '1', args });
}

async function openPage(browser, query, { noWebGpu = false } = {}) {
  const context = await browser.newContext({ viewport: VIEWPORT, deviceScaleFactor: DPR });
  if (noWebGpu) {
    await context.addInitScript(() => {
      Object.defineProperty(Navigator.prototype, 'gpu', { get: () => undefined, configurable: true });
    });
  }
  const page = await context.newPage();
  const logs = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') logs.push(`${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => logs.push(`pageerror: ${e.message}`));
  await page.goto(`http://127.0.0.1:${PORT}/${query}`);
  return { page, context, logs };
}

async function waitState(page, states, timeout = 120000) {
  await page.waitForFunction((s) => window.__odm && s.includes(window.__odm.state), states, { timeout, polling: 100 });
  return page.evaluate(() => window.__odm.state);
}

function checkAdapter(adapter, label) {
  if (!adapter) return fail(`${label}: no adapter report`);
  const desc = `${adapter.vendor} ${adapter.architecture} ${adapter.description}`.toLowerCase();
  if (adapter.isFallback || desc.includes('swiftshader') || desc.includes('llvmpipe') || adapter.vendor.toLowerCase() !== 'apple') {
    fail(`${label}: adapter is not the Apple GPU (${JSON.stringify(adapter)})`);
  } else {
    pass(`${label}: adapter ${adapter.vendor} ${adapter.architecture} (fallback ${adapter.isFallback}, timestamps ${adapter.timestamps})`);
  }
}

/** Runs a started scenario to completion, taking a screenshot at every pause. */
async function runToDone(page, dir, prefix, timeout = 240000) {
  const shots = [];
  const deadline = Date.now() + timeout;
  for (;;) {
    if (Date.now() > deadline) throw new Error('scenario timed out');
    const s = await page.evaluate(() => ({ state: window.__odm.state, paused: window.__odm.paused, label: window.__odm.pauseLabel }));
    if (s.paused) {
      // Let one more frame render the paused state before capturing.
      await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
      const file = resolve(dir, `${prefix}${s.label}.png`);
      await page.screenshot({ path: file });
      shots.push(file);
      await page.evaluate(() => window.__odm.resume());
      continue;
    }
    if (s.state === 'done' || s.state === 'error') return { shots, state: s.state };
    await page.waitForTimeout(15);
  }
}

// ---------------------------------------------------------------- commands

async function smoke(browser) {
  const dir = resolve(EVIDENCE, 'smoke');
  mkdirSync(dir, { recursive: true });
  const { page, context, logs } = await openPage(browser, '?scenario=smoke');
  const state = await waitState(page, ['ready', 'error', 'no-webgpu']);
  const adapter = await page.evaluate(() => window.__odm.adapter);
  checkAdapter(adapter, 'smoke');
  if (state !== 'ready') fail(`smoke: state ${state}: ${await page.evaluate(() => window.__odm.errors.join('\n'))}`);
  await page.evaluate(() => window.__odm.start());
  const { shots } = await runToDone(page, dir, '');
  if (shots.length === 0) fail('smoke: no screenshot');
  else pass(`smoke: screenshot ${shots[0].replace(ROOT + '/', '')}`);
  const telemetry = await page.evaluate(() => window.__odm.telemetry());
  if (!telemetry || telemetry.mode !== 'ground') fail(`smoke: expected Levi standing on the spawn roof, got ${telemetry?.mode}`);
  const titan = await page.evaluate(() => window.__odm.game.titan());
  if (!titan || !titan.visible) fail(`smoke: expected a Titan in the district, got ${JSON.stringify(titan)}`);
  else pass(`smoke: Titan ${titan.h} m tall at (${titan.x.toFixed(0)}, ${titan.z.toFixed(0)}), ${titan.brain}`);
  if (logs.length) fail(`smoke: console errors or warnings:\n  ${logs.join('\n  ')}`);
  else pass('smoke: zero console errors and warnings');
  writeFileSync(resolve(dir, 'smoke.json'), JSON.stringify({ adapter, state, logs, titan, telemetry: { pos: telemetry?.pos, mode: telemetry?.mode } }, null, 2));
  await context.close();
}

async function noWebGpu(browser) {
  const dir = resolve(EVIDENCE, 'smoke');
  mkdirSync(dir, { recursive: true });
  const { page, context } = await openPage(browser, '', { noWebGpu: true });
  const state = await waitState(page, ['no-webgpu', 'ready', 'error'], 30000);
  const text = await page.locator('#overlay').innerText();
  await page.screenshot({ path: resolve(dir, 'no-webgpu.png') });
  if (state !== 'no-webgpu' || !/WebGPU/.test(text)) fail(`no-webgpu: state ${state}, overlay "${text}"`);
  else pass('no-webgpu: shows the WebGPU-missing message');
  await context.close();
}

async function perf() {
  const uncapped = process.env.ODM_PERF_VSYNC !== '1';
  const browser = await launch({ uncapped });
  const { page, context, logs } = await openPage(browser, `?scenario=perf${process.env.ODM_PERF_QUERY ?? ''}`);
  await waitState(page, ['ready']);
  const adapter = await page.evaluate(() => window.__odm.adapter);
  checkAdapter(adapter, 'perf');
  await page.evaluate(() => window.__odm.game.toggleOverlay());
  const tracing = process.env.ODM_TRACE === '1';
  if (tracing) {
    await browser.startTracing(page, {
      path: resolve(EVIDENCE, 'perf', 'trace.json'),
      categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'v8', 'v8.gc', 'gpu', 'viz', 'blink'],
    });
  }
  const loadStart = loadavg().map((v) => +v.toFixed(2));
  await page.evaluate(() => window.__odm.start());
  const t0 = Date.now();
  await waitState(page, ['done', 'error'], 600000);
  if (tracing) await browser.stopTracing();
  const wall = (Date.now() - t0) / 1000;
  await page.screenshot({ path: resolve(EVIDENCE, 'perf', 'perf-end.png') });
  const r = await page.evaluate(() => ({
    frames: window.__odm.frameTimes,
    js: window.__odm.jsTimes,
    minScale: window.__odm.minRenderScale,
    gpu: window.__odm.game.passTimes(),
    cameraInside: window.__odm.cameraInsideFrames,
    cameraInsideTitan: window.__odm.cameraInsideTitanFrames,
    titanInView: window.__odm.titanInViewFrames / Math.max(1, window.__odm.viewFrames),
    simTime: window.__odm.simTime,
  }));
  await context.close();
  await browser.close();

  const frames = r.frames.slice(1); // the first delta spans the start call
  const mean = frames.reduce((a, b) => a + b, 0) / frames.length;
  const sorted = [...frames].sort((a, b) => b - a);
  const worst = sorted.slice(0, Math.max(1, Math.floor(frames.length * 0.01)));
  const low1 = 1000 / (worst.reduce((a, b) => a + b, 0) / worst.length);
  const avgFps = 1000 / mean;
  const maxMs = sorted[0];
  const p99 = [...frames].sort((a, b) => a - b)[Math.floor(frames.length * 0.99)];
  const result = {
    date: new Date().toISOString(),
    machine: `MacBook Air M4 16 GB, Google Chrome, ${uncapped ? 'vsync and frame-rate limit off' : 'vsync on'}`,
    // System load (1, 5, 15 min) at the start and end of the run: other work on the laptop causes
    // stalls, so a result only counts when the 1-minute load stays under about 10.
    loadAverageStart: loadStart,
    loadAverage: loadavg().map((v) => +v.toFixed(2)),
    viewport: `${VIEWPORT.width}x${VIEWPORT.height} @${DPR}x`,
    adapter,
    simSeconds: r.simTime,
    wallSeconds: wall,
    frames: frames.length,
    avgFps: +avgFps.toFixed(1),
    onePercentLowFps: +low1.toFixed(1),
    p99Ms: +p99.toFixed(2),
    maxFrameMs: +maxMs.toFixed(2),
    minRenderScale: r.minScale,
    cameraInsideGeometryFrames: r.cameraInside,
    cameraInsideTitanFrames: r.cameraInsideTitan,
    titanOnScreenFraction: +r.titanInView.toFixed(3),
    // Frames over 25 ms, with the simulation time they happened at (1/60 s per frame).
    spikes: frames
      .map((ms, i) => ({ frame: i + 1, simT: +((i + 1) / 60).toFixed(2), ms: +ms.toFixed(1), prevJsMs: +(r.js[i] ?? 0).toFixed(1) }))
      .filter((f) => f.ms > 25),
    jsMsAvg: +(r.js.reduce((a, b) => a + b, 0) / Math.max(1, r.js.length)).toFixed(2),
    jsMsMax: +Math.max(...r.js).toFixed(1),
    gpuLastSample: r.gpu,
    consoleIssues: logs,
  };
  mkdirSync(resolve(EVIDENCE, 'perf'), { recursive: true });
  const suffix = uncapped ? '' : '-vsync';
  writeFileSync(resolve(EVIDENCE, 'perf', `perf${suffix}.json`), JSON.stringify(result, null, 2));
  const quiet = Math.max(loadStart[0], result.loadAverage[0]) < 10;
  // ODM_PERF_ANY_LOAD=1 records a busy-machine run without failing it (only when Jake asks for one).
  const loadMsg = `perf: load average ${loadStart[0]} at start, ${result.loadAverage[0]} at end (quiet means under about 10)`;
  if (quiet) pass(loadMsg);
  else if (process.env.ODM_PERF_ANY_LOAD === '1') console.log(`NOTE ${loadMsg}; run on a busy machine at Jake's request`);
  else fail(loadMsg);
  const line = `avg ${result.avgFps} fps, 1% low ${result.onePercentLowFps} fps, max frame ${result.maxFrameMs} ms, min render scale ${result.minRenderScale}`;
  if (avgFps < 60) fail(`perf: average ${avgFps.toFixed(1)} fps < 60 (${line})`);
  if (low1 < 45) fail(`perf: 1% low ${low1.toFixed(1)} fps < 45 (${line})`);
  if (maxMs > 100) fail(`perf: a frame took ${maxMs.toFixed(1)} ms > 100 (${line})`);
  if (r.minScale < 0.75) fail(`perf: render scale dropped to ${r.minScale} < 0.75`);
  if (r.titanInView < 0.5) fail(`perf: the Titan was on screen for only ${(r.titanInView * 100).toFixed(0)}% of frames`);
  else pass(`perf: Titan on screen for ${(r.titanInView * 100).toFixed(0)}% of frames`);
  if (r.cameraInside > 0) fail(`perf: camera was inside geometry for ${r.cameraInside} frames`);
  else pass('perf: camera never inside geometry');
  if (logs.length) fail(`perf: console issues: ${logs.join(' | ')}`);
  if (avgFps >= 60 && low1 >= 45 && maxMs <= 100 && r.minScale >= 0.75 && !logs.length) pass(`perf: ${line}`);
}

async function replays(browser) {
  for (const name of REPLAYS) {
    const dir = resolve(EVIDENCE, 'replays', name);
    const framesDir = resolve(dir, 'frames');
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(framesDir, { recursive: true });
    const { page, context, logs } = await openPage(browser, `?scenario=${name}`);
    await waitState(page, ['ready']);
    await page.evaluate(() => window.__odm.start({ replay: true }));
    const { shots } = await runToDone(page, framesDir, '');
    await context.close();
    contactSheet(shots, resolve(dir, 'contact.png'), name);
    if (shots.length < 8) fail(`replays: ${name} captured only ${shots.length} frames`);
    else pass(`replays: ${name} ${shots.length} frames, contact sheet ${resolve(dir, 'contact.png').replace(ROOT + '/', '')}`);
    if (logs.length) fail(`replays: ${name} console issues: ${logs.join(' | ')}`);
  }
}

/** Downscales frames (box filter) into a grid, 4 columns. */
function contactSheet(files, out, _title) {
  if (!files.length) return;
  const cols = 4;
  const imgs = files.map((f) => PNG.sync.read(readFileSync(f)));
  const factor = Math.max(1, Math.round(imgs[0].width / 480));
  const w = Math.floor(imgs[0].width / factor);
  const h = Math.floor(imgs[0].height / factor);
  const pad = 6;
  const rows = Math.ceil(imgs.length / cols);
  const sheet = new PNG({ width: cols * (w + pad) + pad, height: rows * (h + pad) + pad });
  sheet.data.fill(24);
  for (let i = 3; i < sheet.data.length; i += 4) sheet.data[i] = 255;
  imgs.forEach((img, k) => {
    const ox = pad + (k % cols) * (w + pad);
    const oy = pad + Math.floor(k / cols) * (h + pad);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let r = 0, g = 0, b = 0;
        for (let dy = 0; dy < factor; dy++) {
          for (let dx = 0; dx < factor; dx++) {
            const si = ((y * factor + dy) * img.width + (x * factor + dx)) * 4;
            r += img.data[si];
            g += img.data[si + 1];
            b += img.data[si + 2];
          }
        }
        const n = factor * factor;
        const di = ((oy + y) * sheet.width + (ox + x)) * 4;
        sheet.data[di] = r / n;
        sheet.data[di + 1] = g / n;
        sheet.data[di + 2] = b / n;
        sheet.data[di + 3] = 255;
      }
    }
  });
  writeFileSync(out, PNG.sync.write(sheet));
}

async function shot(browser, name) {
  const dir = resolve(EVIDENCE, 'shots', name);
  mkdirSync(dir, { recursive: true });
  const { page, context, logs } = await openPage(browser, `?scenario=${name}`);
  await waitState(page, ['ready']);
  await page.evaluate(() => window.__odm.start());
  const { shots } = await runToDone(page, dir, '');
  await page.screenshot({ path: resolve(dir, 'end.png') });
  console.log(`shot ${name}: ${shots.length + 1} images in ${dir.replace(ROOT + '/', '')}${logs.length ? ' | console: ' + logs.join(' | ') : ''}`);
  await context.close();
}

// ---------------------------------------------------------------- main

const cmds = process.argv.slice(2);
if (!cmds.length) cmds.push('smoke', 'no-webgpu', 'perf', 'replays', 'features');
mkdirSync(EVIDENCE, { recursive: true });
const server = await serve();
let browser = null;
const getBrowser = async () => (browser ??= await launch());
try {
  for (let i = 0; i < cmds.length; i++) {
    const c = cmds[i];
    if (c === 'smoke') await smoke(await getBrowser());
    else if (c === 'no-webgpu') await noWebGpu(await getBrowser());
    else if (c === 'perf') await perf();
    else if (c === 'replays') await replays(await getBrowser());
    else if (c === 'shot') await shot(await getBrowser(), cmds[++i]);
    else if (c === 'features') {
      const { features } = await import('./features.mjs');
      await features(await getBrowser(), { openPage, waitState, runToDone, pass, fail, EVIDENCE, ROOT });
    } else if (c === 'features-m2') {
      const { featuresM2 } = await import('./features-m2.mjs');
      const r = await featuresM2(await getBrowser(), { openPage, waitState, runToDone, pass, fail, EVIDENCE, ROOT });
      writeFileSync(resolve(EVIDENCE, 'features', 'features-m2.json'), JSON.stringify(r, null, 2));
    } else throw new Error(`unknown command ${c}`);
  }
} catch (e) {
  fail(String(e?.stack ?? e));
} finally {
  await browser?.close();
  server.httpServer.close();
}
if (existsSync(EVIDENCE)) console.log(`evidence in ${EVIDENCE.replace(ROOT + '/', '')}/`);
console.log(failures ? `${failures} failure(s)` : 'all browser checks passed');
process.exit(failures ? 1 : 0);
