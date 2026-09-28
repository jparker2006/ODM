# Goal: Milestone 1, "Gear"

Build ODM traversal in a to-scale greybox Trost district, with the testing and capture tooling the rest of the project depends on. Stop at a single, defined endpoint: a build that passes every criterion below, handed to Jake for the feel review.

Read `CLAUDE.md` and `docs/SPEC.md` before starting. The spec is the source of truth for decisions. The spec is also tracked as a GitHub issue on this repo, labelled `ready-for-agent`.

## Scope

**In:** everything in the spec's Milestone 1:
- project scaffold
- simulation core
- input
- the ODM model with assists
- character controller
- camera rig
- greybox district and Wall from a Blender script
- a placeholder mannequin
- crosshair and gas meter
- tuning panel, performance overlay, reset and pause
- the WebGPU-missing message
- shader prewarm
- minimal synthesized audio (hook fire, cable, reel, gas, wind)
- the scenario runners and the asset contract tests

**Out:** Titans, slashing, gas supply points, art beyond greybox legibility, Levi's real model, cloak, effects beyond a simple cable line and a gas puff, the shot list and critic. Do not start Milestone 2.

Greybox legibility means untextured or grid-textured blocks, one sun with shadows, and flat ambient light. The one visual requirement is that speed, distance and surfaces read clearly while flying.

## Working method

- Work as the director with owner subagents where it helps:
  - traversal (simulation, ODM, camera, character controller)
  - environment (greybox district script and colliders)
  - tooling and performance (scenario runners, capture, overlay, prewarm)

  One owner per coupled concern; do not run two agents on the same system at once.
- Use the spec's starting values for every feel constant. The feel gate in `CLAUDE.md` does not apply to setting these for the first time. If a value must change to make a scenario pass, record the before and after in the handoff note.
- Commit in small, logical steps with clear messages, and push to `origin main`.
- Append to `STATUS.md` after each major step.

## Done-criteria

Every item must be green at the same time, on the same commit.

### 1. Project health
- [ ] A fresh clone runs with `npm ci` and `npm run dev`, and the README documents both.
- [ ] `npm run check` (typecheck, lint, unit and scenario tests) passes with zero errors and zero warnings.
- [ ] The simulation core imports nothing from three.js or the DOM, enforced by a lint rule or a test.

### 2. Headless scenario suite
Each scenario is a named file (spawn, seed, input timeline) run by the simulation in Node. Each asserts behavior through telemetry only.

- [ ] **hook-attach:** a hook aimed at a wall within range attaches, and the attach time matches range divided by hook speed within one tick.
- [ ] **hook-miss:** a hook aimed at open sky, or at a wall beyond range, retracts and never attaches.
- [ ] **aim-assist:** a hook aimed just past a building edge (inside the assist cone) attaches to that building. One aimed outside the cone does not.
- [ ] **swing-momentum:** entering a swing at 20 m/s, the player leaves the bottom of the arc at 20 m/s or faster, and never stops dead when the cable goes taut.
- [ ] **release-gain:** releasing on the rising part of an arc produces a higher apex than holding on.
- [ ] **double-hook:** with both hooks attached to two buildings, the player is pulled toward a point between the anchors and passes between them.
- [ ] **reel:** holding reel shortens the cable, raises the player toward the anchor and spends gas.
- [ ] **gas-empty:** boosting until the gas runs out stops thrust at exactly zero gas; reel and boost do nothing until gas is available again (use the tuning option for an infinite-gas toggle to verify both states).
- [ ] **no-tunnel:** at the hard speed cap, flying straight into a 0.3 m thick wall never passes through it, from 20 angles.
- [ ] **ground-clearance:** a standard street-level swing between two 12 m buildings never touches the ground with assists on.
- [ ] **wall-stick:** hitting a wall at speed sticks briefly, and a push-off input leaves the wall.
- [ ] **landing:** a fall from 20 m onto a roof results in a roll or stumble state, then control returns within 1.5 s; the player never dies.
- [ ] **line-run:** a scripted route of at least 8 hook points across the district completes, start to finish, within a time the director sets from the first working build and records in the handoff note.
- [ ] **determinism:** every scenario run twice produces bit-identical telemetry.

### 3. Browser runner
The same scenario files boot the real game in Chrome through Playwright, at simulated fixed steps.

- [ ] **Adapter check:** the runner records the WebGPU adapter info and fails if it is a software or fallback adapter. It must be the Apple GPU.
- [ ] **smoke:** the game boots to player control with zero console errors or warnings, and a screenshot is saved.
- [ ] **no-webgpu:** with WebGPU disabled, the page shows the WebGPU-missing message instead of a blank page.
- [ ] **perf:** a 60-second scripted flight through the densest part of the district, run on this MacBook Air, measures real frame timings and passes:
  - average 60 fps or better
  - 1% low 45 fps or better
  - no frame over 100 ms after control is given (no shader stalls)
  - render scale never below 0.75

  Results are written to `evidence/`, and a summary goes in the handoff note.
- [ ] **replays:** three motion replays (a swing chain, a double-hook thread between buildings, a reel up the Wall) are captured as image sequences plus a contact sheet each, for Jake to view.

### 4. Assets
- [ ] The greybox district and Wall come from a Blender 5.2 script run headless. Running it twice produces byte-identical GLB output.
- [ ] A contract test checks the GLB:
  - it exists
  - its hash is stable
  - it is under the triangle budget the director sets and records
  - it has colliders
  - every building face, roof and the Wall carry the anchorable flag
  - the ground does not carry the anchorable flag
- [ ] The district matches the spec's world section:
  - about 1.5 by 1.5 km
  - 2 to 5 storey blocks, narrow streets and squares
  - at least three towers of 30 to 45 m
  - the 50 m Wall along at least one side

### 5. In-game features
Verified by a browser scenario or a unit test where possible, otherwise by a screenshot in `evidence/`:
- [ ] The controls work as in the spec's controls table: both hooks, reel, boost, WASD, reset, pause with pointer-lock release, F3 and F4.
- [ ] The crosshair shows in-range and out-of-range states. The gas meter shows gas and updates as it is spent.
- [ ] The F4 tuning panel shows every feel constant, grouped by system with units, edits them live, and exports a before and after table as Markdown.
- [ ] The F3 overlay shows frame time, render scale and per-pass GPU time.
- [ ] The placeholder mannequin is visibly posed differently for idle, run, air, swing and reel, and the camera follows as specified (over the shoulder, FOV widening with speed, lean, impact shake, no clipping into buildings in the perf run).
- [ ] Every shader is prewarmed before control is given, as shown by the no-stall result in the perf run.

### 6. Handoff
- [ ] `docs/handoff/M1.md` contains:
  - how to play
  - the full tuning table with current values
  - every value changed from the spec's starting values, and why
  - perf results
  - links to the replay contact sheets
  - the three weakest things about the feel, as honestly judged by the director
  - a list of specific things for Jake to try
- [ ] `STATUS.md` is up to date. Everything is committed and pushed.

## Endpoint

When every box above is green on one pushed commit, **stop.** Do not tune further, do not start Milestone 2, do not add art. Post a short summary with the handoff link and ask Jake to play the build and give his feel verdict. Any tuning after that goes through the feel gate.

If a criterion cannot be met (for example, the perf floor on this hardware), do not weaken it silently. Stop, write down what was tried and the measured numbers in the handoff note, and ask Jake.
