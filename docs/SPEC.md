# ODM: spec

Status: ready for agent. Testing seams confirmed by Jake. Tracked as a GitHub issue on this repo.

## Problem Statement

Jake wants to find out how close Claude Opus 5.5 can get to a AAA-looking, AAA-feeling third-person game, built in a browser on the only machine he has: a MacBook Air (M4, 16 GB, fanless), with keyboard and mouse.

Earlier attempts show the gap. Aloft (a storm-at-sea game) looked weird: the sea had no large-scale form, foam read as ice sheets, and its visual self-check compared brightness statistics against AI-generated reference images, so it passed while looking wrong. The public bar is Spiderbench, a web-swinging game built by Opus 5.5 in about three days, which looks gorgeous and is fun because the fantasy is fun. Across the other public Opus-built games, the consistent gaps are code-built characters that look like mannequins, surfaces that read as procedural noise, flat or tiling textures up close, and laptop frame rates around 30 fps.

Jake does not want another Spiderbench. He wants the fantasy of being Levi Ackerman flying through an evacuated walled town on ODM gear and cutting down Titans, with the answer to one question in his gut: does this look and feel like a AAA game?

## Solution

A private, free, third-person browser game in which the player is Levi, moving through a Trost-style evacuated district inside the Wall using ODM gear (twin grappling hooks, gas thrust, reeling), and killing Titans with a clean cut to the nape.

It is built in milestones, each a playable local build Jake can play and send to friends or family:

1. **Gear.** ODM traversal feel in a to-scale greybox town. Nothing else matters until this is fun.
2. **Nape.** One Titan that wanders, notices, chases and grabs, and dies only to a nape cut. Gas supply points. Minimal HUD.
3. **Trost.** The environment art pass: a modular medieval town kit, scanned materials, golden-hour lighting, the full post stack, the Wall, a far horizon. The shot list and the blind critic start gating here.
4. **Levi.** The hero character: model, rig, animation clips and the procedural layer, cloak cloth, blades, gas effects.
5. **Titans.** Titan art, several sizes and behaviors, steam, footsteps, debris.
6. **Forest.** The Forest of Giant Trees beyond a gate. Later, not planned in detail here.

The look is clean realism, like Insomniac's Spider-Man: real materials and light, slightly polished, saturated and readable at speed. Golden hour only until further notice.

## User Stories

### Playing: getting in

1. As a player, I want to open a local link in Chrome or Safari on my MacBook Air and be flying within a few seconds, so that trying a build is effortless.
2. As a player, I want the game to warm up every shader before I gain control, so that I never get a freeze the first time a new material or effect appears.
3. As a player, I want a clear message if my browser lacks WebGPU, so that I know why it will not run rather than seeing a blank page.
4. As a player, I want to click once to capture the mouse and press Escape to release it and pause, so that control feels like a desktop game.
5. As a player, I want to spawn on a rooftop facing an interesting line of buildings, so that my first input already feels like flight.
6. As a player, I want a key to reset to the spawn point, so that I can retry a line quickly.

### Playing: ODM gear (Milestone 1)

7. As a player, I want a crosshair at screen center that shows whether the surface under it is in hook range, so that I know before I fire whether the hook will catch.
8. As a player, I want holding left click to fire and hold the left hook and holding right click to fire and hold the right hook, so that each hand maps to one mouse button like real ODM gear.
9. As a player, I want releasing a mouse button to detach that hook, so that letting go is as direct as holding on.
10. As a player, I want hooks to fly out visibly at a finite speed and catch where I aimed, so that firing has weight and I can read what happened.
11. As a player, I want a small aim assist that snaps a hook to the nearest valid surface when my aim is just off an edge, so that near misses do not drop me into the street.
12. As a player, I want hooks to attach only to solid world surfaces (walls, roofs, towers, the Wall, later Titans), so that the rules are consistent.
13. As a player, I want a hook fired at empty sky or beyond range to retract with clear feedback, so that I understand the miss.
14. As a player, I want an attached cable to act like a rope that can go slack and snaps taut, so that swinging feels physical rather than on rails.
15. As a player, I want to swing on one hook in a pendulum arc that keeps my momentum, so that swinging is the core pleasure.
16. As a player, I want two hooks attached at once to pull me toward a point between them, so that I can thread gaps and change direction sharply.
17. As a player, I want to hold Shift to reel in on attached cables, so that I can pull myself up and toward anchors quickly.
18. As a player, I want Space to fire a burst of gas thrust in the direction I am steering, so that I can gain speed, correct a line or save a fall.
19. As a player, I want WASD to steer me in the air and move me on the ground, so that I always have directional control.
20. As a player, I want releasing a hook at the bottom or rising part of a swing to fling me forward and up with a small boost, so that good timing is rewarded and chaining swings feels fast.
21. As a player, I want chaining swings and releases in quick succession to raise my top speed a little, so that flow is rewarded.
22. As a player, I want a light assist that keeps swings from dragging me into the ground or straight into a wall, so that the first ten seconds feel great.
23. As a player, I want a limited gas supply shown on screen, spent by boosting and reeling, so that gas is a resource to manage.
24. As a player, I want to land on roofs, slide along them, and run and jump on foot, so that I can recover and set up the next line.
25. As a player, I want to hit a wall at speed and stick to it briefly with a chance to push off, so that impacts become moves rather than failures.
26. As a player, I want a hard fall to cost me time (a stumble or a roll) but never kill me in Milestone 1, so that feel testing is not interrupted.
27. As a player, I want the ODM gear to have a high skill ceiling, so that hour three is still more fun than minute one.

### Playing: camera (Milestone 1)

28. As a player, I want a third-person over-the-shoulder camera that follows smoothly without lag sickness, so that I can see Levi and aim.
29. As a player, I want the field of view to widen with speed, so that speed feels like speed.
30. As a player, I want the camera to lean into swings and add small shakes on hard impacts, so that motion has weight.
31. As a player, I want the camera never to clip inside buildings, so that the view is always readable.
32. As a player, I want mouse sensitivity and invert-Y settings, so that aiming suits me.

### Playing: Titans (Milestone 2)

33. As a player, I want a Titan that wanders the streets and turns toward me when I come close or make noise, so that the town feels threatening.
34. As a player, I want a Titan to chase me and try to grab me out of the air, so that I have to use the gear to evade.
35. As a player, I want a grab to hold me for a moment while I mash to escape, so that a mistake is punished without ending the run.
36. As a player, I want my hooks to attach to a Titan's body, so that I can swing around it to reach the nape.
37. As a player, I want to press E to slash, and a slash through the nape at enough speed to kill the Titan, so that a kill is a skill shot.
38. As a player, I want a slash that hits anywhere else, or is too slow, to do little or nothing, so that the nape rule is clear.
39. As a player, I want a killed Titan to collapse and give off steam, so that the kill feels final.
40. As a player, I want gas supply points on certain rooftops that refill my gas, so that gas management becomes a route decision.
41. As a player, I want a minimal HUD with gas, blade condition and a subtle hit indicator, so that I know my state without clutter.

### Looking at it: environment (Milestone 3)

42. As a player, I want the district to be a dense medieval walled town of stone, timber and plaster, like Nördlingen or Rothenburg, so that it reads as the Attack on Titan world in real life.
43. As a player, I want the 50 m Wall to rise at the district edge, climbable with the gear, so that the boundary is part of the fantasy.
44. As a player, I want a tall landmark or two (a bell tower, a church spire) to anchor high lines and orient me, so that the town has shape.
45. As a player, I want golden-hour light with long shadows, warm bounce and haze, so that every shot looks composed.
46. As a player, I want roofs, walls and streets to hold up at the 5 to 10 m distance I fly past them, so that nothing reads as flat grey or blurry.
47. As a player, I want the land beyond the Wall and the far horizon to be visible from high points, so that the world feels big.
48. As a player, I want a quality setting and automatic render-scale drop under load, so that the frame rate holds on my Air.

### Looking at it: Levi and Titans (Milestones 4 and 5)

49. As a player, I want Levi to look like a grounded, real-world version of himself (short, dark hair, Survey Corps jacket, green cloak, ODM rig), so that he is recognizable without looking like a cartoon.
50. As a player, I want Levi's hands to stay on the gear triggers and his body to lean with the swing and tuck on the reel, so that he never looks like a mannequin.
51. As a player, I want his feet to plant without sliding when running and landing, so that ground movement looks real.
52. As a player, I want his cloak to move with speed and wind, so that motion reads even in a still frame.
53. As a player, I want gas bursts to leave short white trails and hooks to trail thin steel cables, so that the gear is visible and satisfying.
54. As a player, I want Titans to look unsettling in the way the source is unsettling (wrong proportions, empty smiles), so that their uncanniness reads as intended, not as a rendering flaw.
55. As a player, I want several Titan sizes, footsteps that shake the camera, and steam from wounds, so that Titans feel enormous.

### Building it: Jake as director

56. As Jake, I want a live tuning panel with every feel constant, so that I can adjust the gear while playing and tell Opus which numbers felt right.
57. As Jake, I want every change to physics, controls or camera to wait for my approval with a before and after tuning table, so that feel is never changed behind my back.
58. As Jake, I want a performance overlay showing frame time, render scale and per-pass GPU time, so that I can see why a moment stutters.
59. As Jake, I want each milestone to end with a playable build and a short note of what changed and what is still weak, so that I can judge it in minutes.
60. As Jake, I want side-by-side contact sheets of the shot list against reference images, so that I can see how close it is to AAA at a glance.
61. As Jake, I want a blind critic's scores and "single worst flaw" per shot at each milestone, so that I get an honest second opinion that did not write the code.

### Building it: Opus and the agent team

62. As the build agent, I want to run the simulation headless from a scripted input timeline and get telemetry back, so that I can check traversal behavior without a browser.
63. As the build agent, I want to boot the real game into a named scenario at a fixed seed and capture screenshots and frame timings, so that I can verify visuals and performance in the real renderer.
64. As the build agent, I want to replay motion at a simulated fixed frame rate and capture sequences, so that I can catch ghosting, smearing and other artifacts that stills hide.
65. As the build agent, I want every 3D asset to come from a rerunnable Blender script with a contract test, so that assets are reproducible and regressions are caught.
66. As the build agent, I want a status log in the repo that records what was done, what failed and what is next, so that work survives across sessions and agents.
67. As the critic agent, I want to receive only screenshots and reference images, never code, so that my judgment is not biased by knowing how it was built.
68. As an owner agent, I want a single owner per coupled concern (for example one owner for sky, lighting, tone mapping and post together), so that changes do not fight each other.

## Implementation Decisions

### Platform and stack

- Three.js with `WebGPURenderer` and TSL (node materials and compute), Vite, strict TypeScript. Versions pinned. WebGPU only, no WebGL fallback. Targets Chrome and Safari on Apple Silicon macOS.
- Keyboard and mouse only, with pointer lock. No gamepad, no touch.
- Performance target on Jake's MacBook Air M4: 60 fps, never below 45 in normal play. Internal render scale adapts under load. All shaders and pipelines are prewarmed before the player gains control.
- Audio is synthesized (WebAudio or offline generation), consistent with Jake's previous projects. Milestone 1 needs only hook fire, cable, reel, gas and wind sounds.

### Architecture

- **Simulation core.** Pure TypeScript with no rendering dependency. It runs at a fixed 120 Hz, the renderer interpolates, and it runs identically in Node for tests. Same inputs and seed produce the same trajectory.
- **Input.** Turns keyboard and mouse into a per-tick intent (steer vector, look delta, hook left/right held, reel held, boost pressed, slash pressed). The simulation consumes intents, never raw events, so scripted timelines and live play go through the same path.
- **ODM model.**
  - Each hook is an independent state machine: stowed, flying, attached, retracting.
  - An attached cable is a one-sided distance constraint (it can go slack). Reeling shortens its rest length and spends gas. Boost applies thrust along the steer direction and spends gas.
  - With two attached hooks, both constraints act together.
  - Hooks fire along the camera's aim ray at a finite speed, with a maximum range and a small aim-assist cone that snaps to the nearest anchorable surface. They attach only to surfaces flagged anchorable, plus Titans from Milestone 2.
- **Assists.** These follow the ideas observed in the Spiderbench study (restated in our own words; none of its code is copied), each with a strength setting that defaults on:
  - Momentum is preserved and redirected onto the arc when a cable goes taut.
  - Ground-clearance assist.
  - Wall-avoid steering.
  - Release boost at the bottom or rising part of an arc.
  - A small speed-ceiling bonus for chained swings.
  - A minimum-speed floor on the first arc.

  ODM differs from web swinging: anchors are chosen by the player's aim, not picked automatically, and the town is low. So the assists support lateral lines between buildings, not tall overhead arcs.
- **Character controller.** Ground run, jump, roof landing and slide, brief wall stick and push-off, stumble or roll on hard landings. No death in Milestone 1.
- **Camera rig.** Critically damped spring follow with over-the-shoulder offset, crosshair at center, speed-based field of view, lean into swings, impact shake, and multi-ray collision so it never clips into geometry.
- **World and collision.** Static colliders come from the asset pipeline, not from render meshes. Each surface carries an anchorable flag. Raycasts use an acceleration structure over static colliders.
- **Tuning.** All feel constants live in one tuning module, grouped by system, with starting values and units. A live panel edits them in play, and overrides can be exported as a table for approval.
- **Debug.** A performance overlay (frame time, render scale, per-pass GPU timings) and a reset-to-spawn key.
- **Scenario runner.** Named scenarios define a spawn, a seed, an input timeline and capture points. The same scenario definition runs headless (simulation only) and in the browser (full game). See Testing Decisions.

### Starting values (tuned in Milestone 1, subject to Jake's approval)

| Constant | Start | Unit |
|---|---|---|
| Simulation rate | 120 | Hz |
| Gravity | 9.81 to 20 (to tune, stylized heavier than real) | m/s² |
| Hook range | 60 | m |
| Hook travel speed | 150 | m/s |
| Aim-assist cone | 3 | degrees |
| Gas capacity | 40 | seconds of continuous boost |
| Soft top speed | 35 | m/s |
| Levi height | 1.60 | m |
| Wall height | 50 | m |
| District size | about 1.5 by 1.5 | km |
| Camera FOV | 60 to 75 | degrees, by speed |

### Controls

| Input | Action |
|---|---|
| Mouse | Aim and camera |
| Left click (hold) | Left hook |
| Right click (hold) | Right hook |
| Shift (hold) | Reel in |
| Space | Gas boost (jump on the ground) |
| WASD | Steer in the air, run on the ground |
| E | Slash (Milestone 2) |
| R | Reset to spawn |
| Esc | Pause, release mouse |
| F3 / F4 | Performance overlay / tuning panel |

### World

- Milestone 1 greybox is to scale: 2 to 5 storey buildings (about 8 to 20 m), narrow streets, squares, a few towers of 30 to 45 m, and the 50 m Wall on at least one side. The street layout should create good ODM lines from the start, since the art pass keeps the layout.
- Milestone 3 replaces the greybox with a modular medieval kit (walls, timber framing, roofs, chimneys, dormers, shutters, cobbles) generated by Blender scripts, with photoscanned CC0 materials and HDRIs from Poly Haven. Downloads are scripted and pinned, and each license is recorded.
- Far land beyond the Wall is a low-cost horizon layer visible from high points.

### Assets

- Every 3D asset comes from a rerunnable, deterministic Blender 5.2 Python script run headless and exported as GLB. Each script has a contract test.
- **Characters are the biggest risk to the AAA look.** Public evidence shows code-built characters read as mannequins, while meshes from 3D generators (Hunyuan3D, Rodin, Tripo) look better. At the start of Milestone 4, run a bake-off: a Blender-script Levi against a generated Levi base mesh, cleaned, rigged and dressed by Blender scripts. The blind critic judges and Jake decides. Titans get the same bake-off at Milestone 5.
- Animation follows the approach Spiderbench proved: keyframe clips authored by Blender scripts, with a runtime procedural layer on top (blend spaces, hand IK onto the gear triggers and cables, foot planting, lean and tuck driven by the simulation). No motion capture.
- Spiderbench is under a view-only license. Study its techniques; never copy its code, shaders, assets or visual theme, and never commit a clone of it.

### Visual quality loop

- References are real photographs (Nördlingen, Rothenburg ob der Tauber and similar walled towns, golden-hour stone and timber) plus Attack on Titan stills for composition and Insomniac Spider-Man frames for the finish level. No AI-generated reference images.
- A fixed shot list of about 10 camera shots, defined as scenarios, is captured after every visual change from Milestone 3 onward and shown side by side with references.
- The critic is a separate agent that sees only images. It scores shape, materials, lighting, character and composition, and names the single worst flaw per shot.
- Brightness or colour statistics may inform tone decisions but are never the pass criterion. Jake's judgment is final.

### Process

- Workflow: this spec, then a `/goal` per milestone with done-criteria, with Jake approving along the way.
- **Feel gate.** Any change to physics, controls, camera or tuning values needs Jake's approval before commit, shown as a diff plus a before and after tuning table.
- **Agent team,** with one owner per coupled concern:
  - director (Opus, the main session)
  - traversal (simulation, ODM, camera)
  - environment (town kit, Wall, world layout)
  - render and performance (sky, lighting, tone mapping, post and frame budget, one owner because these fight each other when split)
  - character and animation
  - Titans (from Milestone 2)
  - critic (images only, never writes code)

  Coupled systems are worked sequentially by their owner, not fanned out in parallel.
- A status log in the repo records progress, failures and next steps after every working session.

## Testing Decisions

A good test checks behavior the player or Jake would notice, through the highest seam available, and never reaches into internals. "The hook caught the wall I aimed at and I swung past it at 25 m/s" is a good test. "The constraint solver ran 4 iterations" is not.

### Seams (confirmed by Jake)

The ideal is one seam. This plan uses one scenario format shared by two runners, plus a contract check at the asset boundary.

1. **Scenario seam, headless runner (primary).** A scenario (spawn, seed, input timeline) runs through the simulation core in Node and returns telemetry: position, velocity, hook states, gas and contacts per tick. Traversal tests live here. Examples:
   - A hook aimed at a wall within range attaches within the expected time.
   - A hook aimed at the sky or beyond range retracts.
   - Momentum carries through a taut cable.
   - Release at the bottom of an arc gains height.
   - Gas reaches zero and boost stops.
   - No tunnelling through colliders at top speed.
   - The ground-clearance assist keeps a standard street swing off the ground.
   - Same scenario, same trajectory (determinism).
   - Titan grab and nape-kill rules (Milestone 2).
2. **Scenario seam, browser runner.** The same scenario boots the real game in Chrome through Playwright at simulated fixed steps and produces screenshots, image sequences, frame timings and per-pass GPU times. Uses:
   - the shot list and blind critic
   - the performance gate (60 fps target, 45 floor, measured on Jake's Air)
   - motion replays for temporal artifacts
   - a smoke check that the game boots with no console errors
3. **Asset contract.** Each Blender script's GLB output is checked for existence, deterministic hash, triangle and texture budgets, required nodes, bones and clip names, collider presence and anchorable flags.

### Prior art in Jake's repos

- Aloft: a capture tool, a live replay tool that drives the game at a simulated 60 fps, GPU tests, visual baselines, and GLB contract tests for its Blender scripts.
- Pieced: named scenarios (smoke, perf, gallery, latency) that write evidence runs.
- Surfi: a fixed-tick deterministic movement simulation with render interpolation.

Freefall's gamepad work is not relevant here.

### Not tested automatically

Whether the gear is fun, and whether it looks AAA. Those are Jake's calls at each milestone gate.

## Out of Scope

- Multiplayer, accounts, leaderboards, monetization. The game is free and private.
- Gamepad, touch and mobile.
- Human NPCs, civilians and crowds (the district is evacuated, which fits the story).
- Combat beyond slashing Titans' napes: no human enemies, no guns, no melee system.
- Story, cutscenes, dialogue and voice.
- Day and night cycle and weather (golden hour only for now).
- The Forest of Giant Trees until Milestone 6.
- A WebGL fallback, Unreal Engine and native builds.
- Copying anything from Spiderbench or any other reference project.
- Public release under Attack on Titan branding. If the game is ever shared publicly, it stays free, and the title and menus avoid the franchise's marks.

## Further Notes

### Glossary

| Term | Meaning |
|---|---|
| ODM gear | Omni-directional mobility gear: twin hooks on cables, gas thrusters, blades |
| Hook | One grappling projectile and its cable |
| Anchor | The point a hook is attached to |
| Reel | Shortening a cable using gas |
| Boost | A burst of gas thrust |
| Nape | The only lethal target on a Titan |
| Line | A route through the town, a series of hook points |
| Shot list | The fixed camera shots used to judge visuals |
| Critic | The image-only reviewing agent |
| Feel gate | Jake's approval step for changes to physics, controls, camera or tuning |

### Research behind this spec

- **Spiderbench study.**
  - About 50,000 lines of JavaScript, built by Opus 5.5 with one human over about three days, using owner agents plus a critic and a director and numbered rounds of human feedback.
  - Heavy traversal assists, and anchors chosen from real geometry.
  - 79 Blender-scripted animation clips under a large procedural animation layer.
  - Recommends a discrete GPU, which Jake does not have.
- **Survey of public Opus-built 3D games.** The best results came from reference frames plus a separate harsh critic, with one owner per coupled system. Parallel agents on coupled render systems did worse than one sequential owner. Consistent shortfalls: code-built characters, procedural-looking surfaces up close, shader-compile stalls (fixed by prewarming) and about 30 fps on laptops.

### Known risks

- **Frame rate on a fanless Air.** Other showcases ran around 30 fps on stronger laptops. The render and performance owner must budget from day one, and the greybox must hit 60 fps before art arrives.
- **Characters.** The top AAA risk; hence the bake-off.
- **Low town.** AoT-style towns are only a few storeys high. The layout and assists must make lateral lines between buildings fun, and the towers and the Wall must provide high lines.

### Milestone 1 done-criteria (for the first `/goal`)

- The greybox district, spawn, controls, camera, both hooks, reel, boost, gas, landing and wall stick all work.
- The headless scenario suite passes, and the browser smoke and performance scenarios pass on Jake's Air.
- The tuning panel and performance overlay work.
- Jake plays it and approves the feel.
