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

**Next** (at the time): Jake's feel review.

### Milestone 1 closed (same day)

- **Jake's verdict: approved.** "Plays like butter," but hard to control.
- He asked for a light auto-pull on hook attach. Added `autoPull` = 8 m/s² (gas-free, off while actually reeling) and committed at his request.
- A bug surfaced while testing it: holding reel with no gas used to switch the auto-pull off. The auto-pull is now gated on reeling actually happening.
- The release-gain test runs with auto-pull off, because hanging on now climbs.
- M1 goal archived to `docs/goals/M1.md`.
- Next: Milestone 2 "Nape" (`docs/SPEC-M2.md`, `docs/GOAL.md`).

### Milestone 2 build (same day)

**Done**
- **Titan in the sim core.**
  - A shared pose function (`titan-body.ts`) gives the capsules, the nape and the part transforms that the renderer uses.
  - Navigation: a 4 m occupancy grid with connected components, A* and string pulling.
  - A brain: wander, notice by sight or gas noise, chase, wind-up, grab, hold, recover, flinch, collapse, dead, then a respawn out of view.
- **Fight rules.** Hooks ride on body parts with relative-velocity cables. E slashes; the nape kills at 15 m/s with blades left. Blades wear and supply crates refill.
- **Tests.** 18 fixture scenarios and `titan-wander` in the district, with 36 new headless tests. The M1 tests are unchanged.
- **Assets** (environment owner agent): `titan.glb` (2,016 triangles, skeleton read from the TypeScript), and the district's 8 rooftop supply crates and 6 Titan spawn markers.
- **Render, HUD, camera, audio.**
  - The Titan model and steam, and the slash and grabbed poses.
  - The HUD: blades, hit and kill markers, the grab warning with escape bar, kills.
  - The camera: footstep shake by distance, grab shake and zoom, the kill kick, and collision against the Titan.
  - Synthesized fight sounds, with an event log.
- **Browser runner.**
  - smoke now has a Titan in view.
  - perf orbits a walking Titan; the M1 flight is kept as `perf-m1`.
  - Replays for nape-kill, grab-escape and hook-titan.
  - An M2 features runner covering Titan states, steam, poses, HUD, camera, live play and audio.

**What failed along the way, and the fixes**
- *The nape was buried in the top of the torso capsule,* so cuts from behind hit the back first. The nape moved just above the torso, and a slash window that passes through the nape now counts as a nape hit.
- *A Titan could get stuck forever* when turning pushed it toward a blocked cell. It now re-plans from where it stands.
- *`nearSpawn` picked the central square* (closer, but behind the spawn view). It now prefers the avenue marker.
- *The perf orbit at 75 m dipped inside the notice range and crashed into walls.* It now orbits at 90 m and 38 m up, and the pilot tilts its look to hold altitude.
- *The GAS label was clipped* by its transformed, overflow-hidden meter.
- *Pointer lock is refused* when the automated Chrome window isn't the active window. Live checks use the `?nolock=1` seam.
- *The M1 camera-lean check probed side-swing at 1.0 s,* but with the auto-pull (added when M1 closed) the cable only goes taut at 1.1 s. The probe moved to 1.4 s; the lean itself is unchanged.
- *Supply coverage of 150 m everywhere is impossible with 8 crates* (it needs about 38). The measured worst case is 394 m. Flagged for Jake.

**Next:** Jake's feel review of M2 (`docs/handoff/M2.md`).
