// Milestone 2 in-game feature checks (docs/GOAL.md section 5): the Titan's states, steam, the
// slash and grabbed poses, the fight HUD, the camera, live play with real input, and audio (checked
// through the audio module's event log, since sound can't be heard headless).

import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';

export async function featuresM2(browser, h) {
  const { openPage, waitState, pass, fail, EVIDENCE } = h;
  const dir = resolve(EVIDENCE, 'features');
  mkdirSync(dir, { recursive: true });
  const report = {};
  const audio = [];
  let insideTitan = 0;

  /** Runs a scenario, pausing at sim times to call probe(page, t); returns the probe results. */
  async function run(name, times, probe) {
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
    const end = await page.evaluate(() => ({ log: window.__odm.game.audioLog(), inside: window.__odm.cameraInsideTitanFrames }));
    audio.push(...end.log.map((x) => ({ ...x, scenario: name })));
    insideTitan += end.inside;
    report[`insideTitan:${name}`] = end.inside;
    await context.close();
    if (logs.length) fail(`features: ${name} console issues: ${logs.join(' | ')}`);
    return results;
  }

  const state = (page) =>
    page.evaluate(() => ({
      pose: window.__odm.game.pose(),
      camera: window.__odm.game.camera(),
      hud: window.__odm.game.hud(),
      titan: window.__odm.game.titan(),
      steam: window.__odm.game.steam(),
      t: window.__odm.telemetry(),
    }));
  const shot = (page, file, clip) => page.screenshot({ path: resolve(dir, file), ...(clip ? { clip } : {}) });
  const check = (ok, msg, detail) => (ok ? pass(msg) : fail(`${msg}: ${JSON.stringify(detail)}`));

  // ------------------------------------------------ the Titan's states
  const [walk] = await run('titan-yard', [2.0], async (page) => {
    await shot(page, 'titan-walk.png');
    return state(page);
  });
  check(walk.titan?.visible && walk.t.titan.brain === 'wander' && walk.t.titan.pose.stride > 0.2, 'titan: walks (wander, gait on, rendered)', walk.t.titan);

  const turn = await run('titan-turn', [0.3, 1.5], async (page, t) => {
    await shot(page, t < 1 ? 'titan-look.png' : 'titan-turn.png');
    return state(page);
  });
  check(
    turn[0].t.titan.brain === 'notice' && Math.abs(turn[0].t.titan.pose.lookYaw) > 0.3 && Math.abs(turn[1].t.titan.pose.yaw) > 0.4,
    `titan: notices, looks (head ${(turn[0].t.titan.pose.lookYaw * 57.3).toFixed(0)} deg) and turns (body ${(turn[1].t.titan.pose.yaw * 57.3).toFixed(0)} deg)`,
    turn.map((x) => x.t.titan),
  );

  const grab = await run('titan-grab', [4.4, 5.0], async (page, t) => {
    await shot(page, t < 4.66 ? 'titan-windup.png' : 'titan-grab.png');
    return state(page);
  });
  check(grab[0].t.titan.brain === 'windup' && grab[0].t.titan.pose.action === 'windup', 'titan: winds up (arm raised)', grab[0].t.titan);
  check(grab[1].t.titan.brain === 'hold' && grab[1].t.grabbed, 'titan: grabs and holds the player', grab[1].t.titan);

  const kill = await run('nape-kill', [0.8, 0.9, 2.2, 4.0], async (page, t) => {
    if (t > 2 && t < 3) await shot(page, 'titan-collapse.png');
    if (t > 3) await shot(page, 'titan-steam.png');
    if (t < 0.85) await shot(page, 'pose-slash.png');
    return state(page);
  });
  check(kill[2].t.titan.brain === 'collapse' && kill[2].t.titan.pose.actionT > 0.4, 'titan: collapses after the kill', kill[2].t.titan);
  check(kill[3].steam > 20 && ['collapse', 'dead'].includes(kill[3].t.titan.brain), `steam: ${kill[3].steam} puffs rising from the dead Titan`, kill[3]);
  report.titan = { walk: walk.t.titan, turn: turn.map((x) => x.t.titan), windup: grab[0].t.titan, hold: grab[1].t.titan, collapse: kill[2].t.titan, steam: kill[3].steam };

  // ------------------------------------------------ poses
  check(kill[0].pose === 'slash', `pose: slash during the cut (${kill[0].pose})`, kill[0].pose);
  await run('titan-grab', [5.0], async (page) => {
    await shot(page, 'pose-grabbed.png');
    const s = await state(page);
    check(s.pose === 'grabbed', `pose: grabbed while held (${s.pose})`, s.pose);
    return s;
  });

  // ------------------------------------------------ HUD
  const [hit] = await run('body-slash', [1.05], async (page) => {
    await shot(page, 'hud-hit.png', { x: 635, y: 378, width: 200, height: 200 });
    await shot(page, 'hud-blades-worn.png', { x: 585, y: 860, width: 300, height: 96 });
    return state(page);
  });
  check(hit.hud.marker.kind === 'hit', 'HUD: hit marker on a body cut', hit.hud.marker);
  check(Math.abs(hit.hud.blades - hit.t.blades) < 1e-9 && hit.hud.blades < 1, `HUD: blade meter tracks wear (${hit.hud.blades.toFixed(2)})`, hit.hud);
  check(kill[1].hud.marker.kind === 'kill', 'HUD: distinct kill marker on a nape kill', kill[1].hud.marker);
  check(kill[1].hud.kills === 1 && kill[1].t.kills === 1, 'HUD: kill count increments', kill[1].hud);
  await run('nape-kill', [0.87], async (page) => shot(page, 'hud-kill.png', { x: 635, y: 378, width: 200, height: 200 }));
  const esc = await run('grab-escape', [5.0, 5.4], async (page, t) => {
    if (t > 5.2) await shot(page, 'hud-grab.png');
    return state(page);
  });
  check(esc[1].hud.grabShown && esc[1].hud.escape > esc[0].hud.escape && esc[1].hud.escape > 0, `HUD: grab warning with escape progress (${esc[0].hud.escape.toFixed(2)} -> ${esc[1].hud.escape.toFixed(2)})`, esc.map((x) => x.hud));
  const sup = await run('supply', [0.1, 0.8, 1.7], async (page, t) => {
    await shot(page, `hud-supply-${t.toFixed(1)}.png`, { x: 585, y: 840, width: 300, height: 116 });
    return state(page);
  });
  check(
    sup[0].hud.blades < 0.3 && sup[1].hud.blades > sup[0].hud.blades && sup[1].hud.supplying && sup[2].hud.blades === 1,
    `HUD: blade meter refills at supply (${sup.map((x) => x.hud.blades.toFixed(2)).join(' -> ')})`,
    sup.map((x) => x.hud),
  );
  const [aimT] = await run('hook-titan', [0.3], async (page) => {
    await shot(page, 'crosshair-titan.png', { x: 635, y: 378, width: 200, height: 200 });
    return state(page);
  });
  check(aimT.hud.crosshair === 'in', `HUD: crosshair valid on the Titan (${aimT.hud.crosshair})`, aimT.hud);
  report.hud = { hit: hit.hud, kill: kill[1].hud, grab: esc.map((x) => x.hud), supply: sup.map((x) => x.hud), crosshairOnTitan: aimT.hud.crosshair };

  // ------------------------------------------------ camera
  const steps = await run('titan-approach', [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], async (page) => (await state(page)).camera.lastStep);
  const far = steps.filter((s) => s.distance >= 45 && s.distance <= 75 && s.shake > 0);
  const near = steps.filter((s) => s.distance >= 8 && s.distance <= 22);
  report.footsteps = steps;
  check(
    far.length > 0 && near.length > 0 && Math.min(...near.map((s) => s.shake)) > Math.max(...far.map((s) => s.shake)),
    `camera: footstep shake stronger near (${near.map((s) => `${s.distance.toFixed(0)} m ${s.shake.toFixed(2)}`).join(', ')}) than far (${far.map((s) => `${s.distance.toFixed(0)} m ${s.shake.toFixed(3)}`).join(', ')})`,
    steps,
  );
  const [, held] = grab;
  check(held.camera.trauma > 0.3, `camera: shakes while grabbed (trauma ${held.camera.trauma.toFixed(2)})`, held.camera);
  check(kill[1].camera.kick > 2, `camera: nape-kill kick (+${kill[1].camera.kick.toFixed(1)} deg FOV)`, kill[1].camera);
  check(insideTitan === 0, `camera: never inside the Titan (${insideTitan} frames over the Titan runs)`, report);

  // ------------------------------------------------ live play with real input
  {
    const { page, context, logs } = await openPage(browser, '?play=grab-ledge&nolock=1');
    await waitState(page, ['ready']);
    await page.bringToFront();
    // Pointer lock needs a focused page; retry the click a few times.
    await page.locator('#overlay').click();
    await page.waitForTimeout(500);
    const live = {};
    if (!(await page.locator('#overlay').isHidden())) fail('live: the game did not start on click');
    const counts = () => page.evaluate(() => ({ ...window.__odm.eventCounts }));
    const tel = () => page.evaluate(() => window.__odm.telemetry());
    live.crosshair = await page.evaluate(() => window.__odm.game.crosshair());
    // Hook the Titan walking up (it is straight ahead).
    await page.mouse.down({ button: 'left' });
    await page.waitForTimeout(350);
    const hooked = await tel();
    live.hook = { state: hooked.hooks[0].state, part: hooked.hooks[0].part };
    await page.mouse.up({ button: 'left' });
    await page.waitForTimeout(300);
    // E slashes.
    const before = await counts();
    await page.keyboard.press('KeyE');
    await page.waitForTimeout(200);
    const after = await counts();
    live.slash = (after.slash ?? 0) - (before.slash ?? 0);
    // Wait to be grabbed, then mash Space.
    const deadline = Date.now() + 15000;
    while (Date.now() < deadline && !(await tel()).grabbed) await page.waitForTimeout(50);
    live.grabbed = (await tel()).grabbed;
    await page.screenshot({ path: resolve(dir, 'live-grabbed.png') });
    const mashStart = Date.now();
    while (Date.now() - mashStart < 3500 && (await tel()).grabbed) {
      await page.keyboard.press('Space');
      await page.waitForTimeout(45);
    }
    const end = await counts();
    live.escaped = (end.grabEscape ?? 0) > 0;
    live.mashMs = Date.now() - mashStart;
    report.live = live;
    check(live.hook.state === 'attached' && live.hook.part >= 0, `live: a real left click hooks the Titan (part ${live.hook.part})`, live);
    check(live.slash === 1, 'live: E slashes', live);
    check(live.grabbed && live.escaped, `live: grabbed, then mashing Space breaks free (${live.mashMs} ms)`, live);
    if (logs.length) fail(`live: console issues: ${logs.join(' | ')}`);
    await context.close();
  }

  // ------------------------------------------------ audio (event log)
  const want = {
    'slash-swish': 'slash',
    'blade-clang': 'slashHit',
    'kill-thud': 'napeKill',
    'steam-hiss': 'napeKill',
    'titan-step': 'titanStep',
    'grab-crunch': 'grabbed',
    'release-whoosh': 'thrown',
    'titan-groan': 'titanNotice',
    'windup-rush': 'titanWindup',
    'titan-grunt': 'flinch',
    'collapse-rumble': 'titanCollapse',
    'supply-clank': 'supplyStart',
    'supply-done': 'supplyDone',
  };
  const heard = {};
  for (const [sound, event] of Object.entries(want)) {
    const hits = audio.filter((a) => a.sound === sound && a.event === event);
    heard[sound] = hits.length;
    check(hits.length > 0, `audio: ${event} triggers ${sound} (${hits.length}x)`, sound);
  }
  report.audio = heard;
  return report;
}
