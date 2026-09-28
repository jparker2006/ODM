# ODM

A private browser game: Levi on ODM gear in an evacuated, walled medieval district, built to find out how close Claude Opus can get to a AAA look and feel. Three.js with WebGPU, TypeScript, and Blender for every asset.

**Status:** Milestone 1 ("Gear", ODM traversal in a greybox district) is done and approved. Milestone 2 ("Nape", the first Titan) is next. The contract is [docs/SPEC.md](docs/SPEC.md), the M2 detail is [docs/SPEC-M2.md](docs/SPEC-M2.md), and the current goal is [docs/GOAL.md](docs/GOAL.md). Past goals are in [docs/goals/](docs/goals/) and handoffs in [docs/handoff/](docs/handoff/).

## Play

This needs Node 22 or newer and a browser with WebGPU. Current Chrome and Safari on an Apple silicon Mac both work.

```sh
npm ci
npm run dev
```

Open http://127.0.0.1:5180 and click to play.

The default game is the district with one Titan on the avenue, in sight of the spawn roof.

- `?play=<scenario>` plays live in a scenario's test world. Examples:
  - `?play=titan-yard`: open ground, a few low blocks, a supply crate and one wandering Titan.
  - `?play=titan-street`: a 16 m street between 15 m buildings, with a Titan.
  - `?play=grab-ledge`: an 8 m roof edge with a Titan walking up to grab you.
  - `?play=hook-attach`: flat ground and a wall ahead, with no Titan.
- `?scenario=<scenario>` watches a scripted run, for example `?scenario=nape-kill` or `?scenario=replay-swing-chain`.

## Controls

| Input | Action |
|---|---|
| Mouse | Aim and camera |
| Left click (hold) | Left hook |
| Right click (hold) | Right hook |
| Shift (hold) | Reel in (spends gas) |
| Space | Gas boost in the air, jump on the ground, push off a wall. Mash it to break free of a grab |
| E | Slash. A cut through the nape at 15 m/s or more kills |
| WASD | Steer in the air, run on the ground |
| R | Reset to spawn |
| Esc | Pause |
| F3 | Performance overlay: frame time, render scale, GPU time per pass |
| F4 | Tuning panel: every feel constant, live, with a before and after export |

The HUD shows gas and blade condition at the bottom and the kill count at the top right. A hit marker flashes at the crosshair when a cut connects; a kill gets a bigger red one. Stand on an orange supply crate (rooftops, with a flag) to refill gas and blades.

The crosshair has three states (a Titan's body counts as something to catch):
- **Solid teal:** a hook fired now will catch.
- **Dashed:** aim assist will snap the hook to a nearby edge.
- **Faded:** out of range, or nothing to catch.

## Develop

| Command | What it does |
|---|---|
| `npm run check` | Typecheck, lint (including the no-em-dash rule), and every Vitest test: unit, asset contracts and the headless scenario suite |
| `npm run assets` | Rebuild `public/assets/*.glb` with Blender 5.2, run headless. After an intended change, update `tests/unit/asset-hashes.json` |
| `npm run assets:check` | Build every asset twice and confirm byte-identical output |
| `npm run browser` | The full browser suite in real Chrome on the Apple GPU (smoke, no-WebGPU, perf, replays, features). Evidence goes to `evidence/` |
| `npm run smoke` / `perf` / `replays` / `features` | One part of the browser suite |

## Layout

| Path | Contents |
|---|---|
| `src/sim/` | The simulation core. Pure TypeScript: no three.js, no DOM. Runs at a fixed 120 Hz and identically in Node. Every feel constant lives in `src/sim/tuning.ts` |
| `src/render/` | Renderer, greybox materials, camera rig, mannequin, gear effects |
| `src/game/` | Game loop, input, and the `window.__odm` automation handle |
| `src/ui/` | HUD, tuning panel, performance overlay |
| `src/audio/` | Synthesized sound |
| `scenarios/` | Named scenarios, each a world, spawn and input timeline, shared by the headless tests and the browser runner |
| `tools/blender/` | Deterministic asset scripts |
| `tools/runner/` | The Playwright browser runner |
| `STATUS.md` | Progress log |
