# ODM

A private browser game: Levi Ackerman on ODM gear in an evacuated, Trost-style walled district, cutting down Titans. The goal of the project is to find out how close Opus can get to a AAA look and feel. Read `docs/SPEC.md` first, then the current goal file (`docs/GOAL.md`) and `STATUS.md`.

## Build rules

- **Stack.** Three.js `WebGPURenderer` with TSL, Vite, strict TypeScript, pinned versions. WebGPU only; there is no WebGL fallback. Keyboard and mouse only.
- **Simulation core is pure TypeScript.** It never imports three.js or touches the DOM, runs at a fixed 120 Hz, and must run identically in Node. Input reaches it only as per-tick intents.
- **Feel constants live in the tuning module only.** No magic numbers for physics, camera or controls anywhere else.
- **Feel gate.** Once Jake has played a build, any change to physics, controls, camera or tuning values needs his approval **before committing**. Show the diff and a before and after tuning table, then wait. First-time values taken from the spec's starting-values table do not need approval.
- **Assets.** Every 3D asset is built by a rerunnable, deterministic Python script under `tools/blender/`, run headless with Blender 5.2 (`blender -b -P <script> -- --out <path>.glb`). Each asset has a contract test. Colliders and anchorable flags come from the asset pipeline, not from render meshes.
- **Visual loop (from Milestone 3).** After every visual change: capture the shot list, compare against `references/`, get a verdict from the image-only critic agent, write a short critique to `docs/critiques/`, and only then continue. Brightness or colour statistics are never the pass criterion.
- **Performance.** 60 fps on Jake's MacBook Air M4 in Chrome, never below 45. Prewarm every shader before the player gains control. Always confirm the browser runner uses the real Apple GPU adapter, never a software fallback.
- **Status log.** Append to `STATUS.md` at the end of every working session: what was done, what failed, what is next.
- **Spiderbench.** It is under a view-only license. Techniques described in `docs/SPEC.md` may be reimplemented in our own words. Never copy its code, shaders, assets or visual theme, and never commit a clone of it.
- **Ownership.** One owner per coupled concern: traversal, environment, render and performance, character and animation, Titans. Coupled systems are changed sequentially by their owner, not fanned out in parallel.
