// In-game feature checks (docs/GOAL.md section 5): controls with real keyboard and mouse input,
// crosshair states, gas meter, tuning panel, performance overlay, mannequin poses and camera.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

export async function features(browser, h) {
  const { openPage, waitState, pass, fail, EVIDENCE, ROOT } = h;
  const dir = resolve(EVIDENCE, 'features');
  mkdirSync(dir, { recursive: true });
  const report = {};

  /** Runs a scenario, pausing at the given sim times to call probe(page, t). */
  async function probeScenario(name, times, probe) {
    const { page, context, logs } = await openPage(browser, `?scenario=${name}`);
    await waitState(page, ['ready']);
    await page.evaluate((ts) => {
      window.__odm.pauseTimes = ts;
    }, times);
    await page.evaluate(() => window.__odm.start());
    const results = [];
    for (;;) {
      const s = await page.evaluate(() => ({ state: window.__odm.state, paused: window.__odm.paused, label: window.__odm.pauseLabel, t: window.__odm.simTime }));
      if (s.paused) {
        await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
        if (s.label.startsWith('probe')) results.push(await probe(page, s.t));
        await page.evaluate(() => window.__odm.resume());
        continue;
      }
      if (s.state === 'done' || s.state === 'error') break;
      await page.waitForTimeout(10);
    }
    await context.close();
    if (logs.length) fail(`features: ${name} console issues: ${logs.join(' | ')}`);
    return results;
  }

  const game = (page, expr) => page.evaluate(expr);
  const state = (page) =>
    page.evaluate(() => ({
      crosshair: window.__odm.game.crosshair(),
      gas: window.__odm.game.gas(),
      pose: window.__odm.game.pose(),
      camera: window.__odm.game.camera(),
      t: window.__odm.telemetry(),
    }));

  // ------------------------------------------------ crosshair
  const cross = {};
  for (const [name, want] of [
    ['hook-attach', 'in'],
    ['hook-miss', 'out'],
    ['aim-assist-inside', 'assist'],
  ]) {
    const [r] = await probeScenario(name, [0.1], async (page) => {
      await page.screenshot({ path: resolve(dir, `crosshair-${want}.png`), clip: { x: 635, y: 378, width: 200, height: 200 } });
      return state(page);
    });
    cross[want] = r.crosshair;
    if (r.crosshair !== want) fail(`crosshair: ${name} shows "${r.crosshair}", expected "${want}"`);
  }
  if (cross.in === 'in' && cross.out === 'out' && cross.assist === 'assist') pass('crosshair: in-range, assisted and out-of-range states');
  report.crosshair = cross;

  // ------------------------------------------------ gas meter
  const gas = await probeScenario('gas-empty', [0.2, 1.5, 4.1], async (page, t) => {
    await page.screenshot({ path: resolve(dir, `gas-${t.toFixed(1)}.png`), clip: { x: 585, y: 880, width: 300, height: 76 } });
    const s = await state(page);
    return { t, meter: s.gas, gas: s.t.gas };
  });
  report.gas = gas;
  if (gas[0].meter > 0.95 && gas[1].meter < gas[0].meter && gas[2].meter === 0) pass(`gas meter: ${gas.map((g) => g.meter.toFixed(2)).join(' -> ')}`);
  else fail(`gas meter did not track gas: ${JSON.stringify(gas)}`);

  // ------------------------------------------------ poses and camera
  const poseRuns = [
    ['smoke', 1.0, 'idle'],
    ['landing', 3.2, 'run'],
    ['swing-momentum', 0.2, 'air'],
    ['swing-momentum', 1.2, 'swing'],
    ['reel', 1.5, 'reel'],
  ];
  const poses = [];
  for (const [name, t, want] of poseRuns) {
    const [r] = await probeScenario(name, [t], async (page) => {
      await page.screenshot({ path: resolve(dir, `pose-${want}.png`) });
      return state(page);
    });
    poses.push({ scenario: name, t, want, got: r.pose, fov: r.camera.fov, speed: r.t.speed });
    if (r.pose !== want) fail(`pose: ${name} at ${t}s is "${r.pose}", expected "${want}"`);
  }
  if (poses.every((p) => p.got === p.want)) pass(`poses: ${poses.map((p) => p.got).join(', ')}`);
  report.poses = poses;

  // Camera: FOV widens with speed, lean while swinging from a side anchor, shake on impact.
  const idleFov = poses[0].fov;
  const [fast] = await probeScenario('swing-momentum', [1.6], async (page) => state(page));
  const [lean] = await probeScenario('side-swing', [1.0], async (page) => state(page));
  const [shake] = await probeScenario('wall-stick', [1.35], async (page) => state(page));
  report.camera = { idleFov, fastFov: fast.camera.fov, fastSpeed: fast.t.speed, leanRollRad: lean.camera.roll, shakeTrauma: shake.camera.trauma };
  if (fast.camera.fov > idleFov + 4) pass(`camera: FOV ${idleFov.toFixed(1)} at rest, ${fast.camera.fov.toFixed(1)} at ${fast.t.speed.toFixed(1)} m/s`);
  else fail(`camera: FOV did not widen (${idleFov} -> ${fast.camera.fov})`);
  if (Math.abs(lean.camera.roll) > 0.0087) pass(`camera: leans ${(lean.camera.roll * 57.3).toFixed(1)} deg into a side-anchor swing`);
  else fail(`camera: no lean while swinging (${lean.camera.roll})`);
  if (shake.camera.trauma > 0.05) pass(`camera: impact shake (trauma ${shake.camera.trauma.toFixed(2)})`);
  else fail(`camera: no shake after impact (${shake.camera.trauma})`);

  // ------------------------------------------------ F3 overlay and F4 tuning panel (real keys)
  {
    const { page, context } = await openPage(browser, '?scenario=smoke');
    await waitState(page, ['ready']);
    await page.evaluate(() => window.__odm.start());
    await page.waitForTimeout(800);
    await page.keyboard.press('F3');
    await page.waitForTimeout(700);
    const perfText = await page.locator('#perf').innerText();
    await page.screenshot({ path: resolve(dir, 'overlay-f3.png') });
    if (/scene\s+[\d.]+ ms/.test(perfText) && /shadow\s+[\d.]+ ms/.test(perfText) && /scale/.test(perfText) && /fps/.test(perfText))
      pass('F3 overlay: frame time, render scale and per-pass GPU time (scene, shadow)');
    else fail(`F3 overlay text missing fields:\n${perfText}`);
    report.overlay = perfText;

    await page.keyboard.press('F4');
    await page.waitForTimeout(200);
    const rows = await page.locator('#tuning .row').count();
    const src = readFileSync(resolve(ROOT, 'src/sim/tuning.ts'), 'utf8');
    const params = (src.match(/^\s+\w+: p\(/gm) ?? []).length;
    const groups = await page.locator('#tuning h3').allInnerTexts();
    if (rows === params && rows > 0) pass(`F4 panel: all ${rows} constants, groups ${groups.join(', ')}`);
    else fail(`F4 panel shows ${rows} constants, tuning module has ${params}`);
    // Edit gravity live through its number field.
    const gravityRow = page.locator('#tuning .row', { hasText: '(gravity)' });
    await gravityRow.locator('input[type=number]').fill('14.5');
    await gravityRow.locator('input[type=number]').dispatchEvent('change');
    const g = await game(page, () => window.__odm.game.getTuning('gravity'));
    await page.locator('#tuning button', { hasText: 'Export changes' }).click();
    const table = await page.locator('#tuning textarea').inputValue();
    await page.screenshot({ path: resolve(dir, 'panel-f4.png') });
    if (g === 14.5 && /gravity/.test(table) && /\| 16 \| 14\.5 \|/.test(table)) pass('F4 panel: live edit and before/after Markdown export');
    else fail(`F4 panel edit/export failed: gravity ${g}, table:\n${table}`);
    report.tuningExport = table;
    await context.close();
  }

  // ------------------------------------------------ live controls with real input
  {
    // Live play in the hook-attach fixture world: flat ground, a wall 40 m ahead.
    const { page, context, logs } = await openPage(browser, '?play=hook-attach');
    await waitState(page, ['ready']);
    await page.locator('#overlay').click();
    await page.waitForTimeout(400);
    const locked = await page.evaluate(() => Boolean(document.pointerLockElement));
    const results = {};
    if (!locked) {
      fail('controls: pointer lock was not granted after clicking to play');
    } else {
      const tel = () => page.evaluate(() => window.__odm.telemetry());
      const start = await tel();
      await page.keyboard.down('KeyW');
      await page.waitForTimeout(900);
      const ran = await tel();
      const runPose = await page.evaluate(() => window.__odm.game.pose());
      await page.keyboard.up('KeyW');
      results.run = { moved: Math.hypot(ran.pos[0] - start.pos[0], ran.pos[2] - start.pos[2]), pose: runPose };
      for (const [k, axis] of [
        ['KeyA', 'left'],
        ['KeyD', 'right'],
        ['KeyS', 'back'],
      ]) {
        await page.waitForTimeout(500);
        const a = await tel();
        await page.keyboard.down(k);
        await page.waitForTimeout(300);
        await page.keyboard.up(k);
        const b = await tel();
        results[axis] = Math.hypot(b.pos[0] - a.pos[0], b.pos[2] - a.pos[2]);
      }
      await page.waitForTimeout(500);
      await page.keyboard.press('Space');
      await page.waitForTimeout(120);
      results.jumpVy = (await tel()).vel[1];
      await page.waitForTimeout(1200);
      // Hooks: aim at the roof ahead, hold left, then right.
      await page.mouse.down({ button: 'left' });
      await page.waitForTimeout(80);
      results.hookL = (await tel()).hooks[0].state;
      await page.waitForTimeout(600);
      results.hookLHeld = (await tel()).hooks[0].state;
      await page.mouse.down({ button: 'right' });
      await page.waitForTimeout(80);
      results.hookR = (await tel()).hooks[1].state;
      await page.waitForTimeout(600);
      const beforeReel = await tel();
      await page.keyboard.down('ShiftLeft');
      await page.waitForTimeout(500);
      const afterReel = await tel();
      await page.keyboard.up('ShiftLeft');
      results.reel = { attached: beforeReel.hooks.map((x) => x.state), gasBefore: beforeReel.gas, gasAfter: afterReel.gas, restBefore: beforeReel.hooks.map((x) => x.rest), restAfter: afterReel.hooks.map((x) => x.rest) };
      await page.mouse.up({ button: 'left' });
      await page.mouse.up({ button: 'right' });
      await page.waitForTimeout(80);
      results.release = (await tel()).hooks.map((x) => x.state);
      await page.waitForTimeout(800);
      // Boost in the air: jump, then hold Space.
      await page.keyboard.press('Space');
      await page.waitForTimeout(150);
      await page.keyboard.down('Space');
      await page.waitForTimeout(300);
      results.boost = await page.evaluate(() => ({ gas: window.__odm.telemetry().gas, thrusting: window.__odm.telemetry().thrusting }));
      await page.keyboard.up('Space');
      await page.waitForTimeout(1500);
      // Reset.
      await page.keyboard.press('KeyR');
      await page.waitForTimeout(150);
      const afterReset = await tel();
      results.reset = Math.hypot(afterReset.pos[0] - start.pos[0], afterReset.pos[1] - start.pos[1], afterReset.pos[2] - start.pos[2]);
      // Pause: Escape releases the pointer and shows the overlay.
      await page.keyboard.press('Escape');
      await page.waitForTimeout(300);
      results.pause = {
        locked: await page.evaluate(() => Boolean(document.pointerLockElement)),
        overlay: await page.locator('#overlay').isVisible(),
        text: await page.locator('#overlay-text').innerText(),
      };
      await page.screenshot({ path: resolve(dir, 'pause.png') });

      const ok = {
        run: results.run.moved > 3 && results.run.pose === 'run',
        strafe: results.left > 0.5 && results.right > 0.5 && results.back > 0.5,
        jump: results.jumpVy > 2,
        hookL: results.hookL !== 'stowed',
        hookR: results.hookR !== 'stowed',
        reel: results.reel.gasAfter < results.reel.gasBefore || results.reel.restAfter.some((r, i) => r < results.reel.restBefore[i] - 0.1),
        release: results.release.every((s) => s === 'retracting' || s === 'stowed'),
        boost: results.boost.gas < 40,
        reset: results.reset < 0.5,
        pause: !results.pause.locked && results.pause.overlay && /Paused/.test(results.pause.text),
      };
      results.ok = ok;
      for (const [k, v] of Object.entries(ok)) (v ? pass : fail)(`controls: ${k}${v ? '' : ' ' + JSON.stringify(results[k] ?? results)}`);
    }
    report.controls = results;
    if (logs.length) fail(`controls: console issues: ${logs.join(' | ')}`);
    await context.close();
  }

  writeFileSync(resolve(dir, 'features.json'), JSON.stringify(report, null, 2));
}
