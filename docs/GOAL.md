# Goal: Milestone 2, "Nape"

Add the first Titan, the slash, grabs, blades and gas supply to the greybox district. Stop at one defined endpoint: a build that passes every criterion below, handed to Jake for the feel review.

Read `CLAUDE.md`, `docs/SPEC.md`, `docs/SPEC-M2.md` (the source of truth for this milestone), `STATUS.md` and `docs/handoff/M1.md` before starting. The M2 spec is also GitHub issue https://github.com/jparker2006/ODM/issues/2, labelled `ready-for-agent`. Milestone 1's goal is archived in `docs/goals/M1.md`; its tooling (scenario suite, browser runner, features runner, asset contracts) is the prior art to extend.

## Scope

**In:** everything in `docs/SPEC-M2.md`:
- the Titan in the sim core: pose function, capsules, nape volume, navigation, brain, grab and hold, hooks on Titans, collision, death and respawn
- the slash, blades and supply
- `titan.glb` and the district additions (supply crates, titan-spawn markers)
- Titan rendering and steam
- camera additions, the slash and grabbed poses
- the HUD additions and audio
- the `titan-yard` and `titan-street` fixtures
- live play with one Titan
- tests, browser checks and the handoff

**Out:** everything in the M2 spec's Out of Scope. Do not start Milestone 3. No art beyond greybox legibility.

## Working method

- Work as the director with owner subagents where it helps. One owner per coupled concern, never two agents on the same system at once:
  - Titans (sim brain, body, navigation, grab, slash rules)
  - environment (titan.glb and the district additions)
  - traversal (hooks on moving anchors, collision with capsules, the camera)
  - tooling and performance (scenarios, runners, prewarm, the performance check)
- **Feel gate:**
  - The M1 values Jake has played, including `autoPull` = 8, must not change.
  - New M2 constants use the spec's starting values. If one must change to make a scenario pass, record the before and after in the handoff.
  - Do not change any M1 constant to make an M2 test pass. If an M1 behavior is blocking, stop and ask.
- Commit in small, logical steps with clear messages, and push to `origin main`. Append to `STATUS.md` after each major step.
- Measure performance only when the laptop's load average is below about 10, and record the load average. Another session on this Mac sometimes compiles Rust or runs Pieced; wait, and never stop another session's processes.

## Done-criteria

Every item must be green at the same time, on the same pushed commit, or on a later commit that changes only docs or evidence and has had `npm run check` and the smoke check re-run on it.

### 1. Project health
- [ ] `npm run check` passes with zero errors and zero warnings.
- [ ] The simulation core still imports nothing from three.js or the DOM, including all the new Titan code.
- [ ] Every M1 test still passes unchanged, apart from tests whose scenarios must now declare "no Titan", which is the default for fixture worlds.

### 2. Headless scenario suite (M2)
Each scenario is a named file driven by a timeline and a deterministic policy where the player must react. Each asserts through telemetry and events only.

- [ ] **titan-wander:** 120 s in the district. The Titan never overlaps a building footprint, stays inside the Wall, and travels at least 150 m in total.
- [ ] **titan-notice-sight:** the player in view and in range notices within 1 s.
- [ ] **titan-hidden:** the player hidden behind a building is never noticed over 10 s.
- [ ] **titan-noise:** a gas burst within noise range behind a building is noticed.
- [ ] **titan-chase:** once noticed, the distance to the player on the ground shrinks.
- [ ] **titan-lose-interest:** after the player stays hidden for the lose-interest time, the Titan returns to wander.
- [ ] **titan-grab:** a player hovering in reach is grabbed after the wind-up, never before it.
- [ ] **titan-dodge:** boosting away during the wind-up is never grabbed.
- [ ] **grab-escape:**
  - Mashing Space frees the player before the max hold.
  - The throw puts the player at least 5 m from the hand within 1 s.
  - The re-grab grace holds.
- [ ] **grab-timeout:** not mashing releases the player at max hold with exactly the gas penalty. The player never dies.
- [ ] **hook-titan:** a hook fired at the walking Titan attaches to a body part. The anchor stays within 0.05 m of the pose function's position for that part for 3 s of walking.
- [ ] **nape-kill:**
  - A policy swings behind the Titan and slashes through the nape at or above the kill speed.
  - The Titan dies, collapses and steams.
  - A new Titan spawns after the respawn delay, at a spawn marker at least 150 m away and out of the player's view.
- [ ] **nape-slow:** the same approach below the kill speed does not kill.
- [ ] **body-slash:** a fast slash on an arm or leg only makes the Titan flinch.
- [ ] **dull-blades:** with blades at zero, a fast nape slash does not kill.
- [ ] **supply:**
  - Standing on a crate with low gas and blades refills both to full within the refill time.
  - Leaving early stops the refill.
- [ ] **determinism:** every new scenario, run twice, gives bit-identical telemetry.

### 3. Browser runner
- [ ] **Adapter check** still passes: the Apple GPU, never a fallback.
- [ ] **smoke:** the district with a Titan in view boots to control with zero console errors or warnings. Screenshot saved.
- [ ] **perf:**
  - The 60-second flight with a walking Titan in view for most of it, measured with the load average below about 10: average 60 fps or better, 1% low 45 fps or better, no frame over 100 ms, render scale never below 0.75, camera never inside geometry or a Titan.
  - Results and the load average go in `evidence/perf/`.
  - A vsync reference run is recorded too.
- [ ] **replays:** `nape-kill`, `grab-escape` and `hook-titan`, each captured as an image sequence plus a contact sheet. The M1 replays still run.

### 4. Assets
- [ ] `titan.glb` comes from `tools/blender/titan.py`, run headless. Building it twice gives byte-identical output.
- [ ] The titan contract test checks the file exists, a stable hash, fewer than 8k triangles, every skeleton node the pose function needs, and the nape marker.
- [ ] The district includes six to eight rooftop supply crates (one near the spawn, one within about 150 m of anywhere inside the Wall) and at least four titan-spawn markers in open ground. The contract test checks both. The hash is updated, and `npm run assets:check` passes.

### 5. In-game features
Verified by the features runner, with screenshots in `evidence/features/`.
- [ ] The Titan renders posed from the shared pose function. It walks, turns, looks at the player when it notices, winds up and grabs, and collapses. A screenshot shows each state.
- [ ] Steam rises from a dead Titan.
- [ ] Mannequin poses `slash` and `grabbed`, alongside the five M1 poses.
- [ ] **HUD:**
  - the blade meter tracks wear and refills at supply
  - the hit marker and a distinct kill marker
  - the grab warning with escape progress
  - the kill count increments
  - the crosshair is valid on a Titan
- [ ] **Camera:**
  - footstep shake scales with distance: stronger at 15 m than at 60 m
  - grab shake
  - nape-kill kick
  - no clipping into the Titan
- [ ] **Live play with real input** (`?play=titan-yard`): E slashes, mashing Space escapes a grab, hooks catch on the Titan, and every M1 control still works.
- [ ] **Audio:** every new event triggers its sound. Check it through the audio module's event log, since audio can't be heard headless.

### 6. Handoff
- [ ] `docs/handoff/M2.md` contains:
  - how to play and the test worlds
  - the new tuning table
  - every value changed from the spec's starting values, and why
  - perf results with the load average
  - links to the replay contact sheets
  - **the three weakest things about the fight, honestly judged**, including whether hitting the nape is fun or frustrating given that Jake found M1 hard to control
  - specific proposed assist values (not applied)
  - things for Jake to try
- [ ] `STATUS.md` is up to date. Everything is committed and pushed.

## Endpoint

When every box above is green on one pushed commit, **stop.** Do not tune further, do not start Milestone 3, do not add art. Post a short summary with the handoff link, and ask Jake to play the build and give his feel verdict. Any tuning after that goes through the feel gate.

If a criterion can't be met (for example, the performance floor, or a rule that conflicts with an M1 feel value), don't weaken it quietly. Stop, write down what was tried and the measured numbers in the handoff, and ask Jake.
