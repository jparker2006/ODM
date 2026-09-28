# Status

Progress log. Append after every working session: what was done, what failed, what is next.

## 2026-09-28

- Spec written (`docs/SPEC.md`) and published as a GitHub issue.
- Milestone 1 goal written (`docs/GOAL.md`).

### Milestone 1 build (same day)

**Done**
- Toolchain: Vite, strict TypeScript, ESLint with a purity rule for `src/sim`, Vitest, Playwright driving installed Chrome.
- Simulation core (fixed 120 Hz, pure TypeScript): hooks with finite travel and an aim-assist cone, one-sided cables with a slack winder, reel, gas boost, ground running, jump, wall stick and push-off, stumble and roll landings, and the assists.
- Scenario format shared by the headless tests and the browser runner. There are 23 fixture scenarios plus 20 no-tunnel dives, and 6 district scenarios.
- Blender greybox district (6,875 colliders) and a jointed mannequin, both deterministic, with contract tests. The environment owner agent built these.
- Renderer, camera rig, mannequin poses, cable and gas effects, HUD, F3 overlay with per-pass GPU time, F4 tuning panel with Markdown export, synthesized audio.
- Browser suite: smoke, no-WebGPU, perf, replays and features, all run in real Chrome on the Apple GPU.

**What failed along the way, and the fixes**
- *The spawn faced a taller neighbour's blank wall.* Moved it to a 20 m corner roof.
- *Shader and buffer uploads caused stalls mid-flight* (510 ms). Prewarm now draws the whole district in both passes.
- *Adaptive render scale misread vsync waits as load*, and each resize stalled (400 ms). It now follows GPU time, and only drops when frames also miss the refresh.
- *`rayBox` allocated per test,* causing GC pressure. It's allocation-free now.
- *GPU timestamps summed many frames.* The loop now runs on `setAnimationLoop`. With vsync off, Apple timestamps overlap across passes, so render scale ignores them unless frames are slow.
- *Reel held at the anchor looped Levi into the Wall edge.* Reel now stops at minimum length.
- *The camera collapsed into Levi's back when looking up from the ground.* Its ideal point is now lifted above the floor.
- *The ground ended 20 m past the Wall.* It's extended to 3 km, and a fall-out reset was added.
- *Quick taps inside one frame were lost.* Input now latches presses.
- *Impact shake was invisible.* Raised it.
- *Perf runs are noisy while another session compiles Rust or runs Pieced on this laptop* (load average up to 78). Each result records the load average.

**Next**
- Jake plays Milestone 1 and gives a feel verdict (see `docs/handoff/M1.md`). All tuning after that goes through the feel gate.
- Milestone 2 ("Nape") starts only after that.
