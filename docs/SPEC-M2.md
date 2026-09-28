# ODM Milestone 2 spec: "Nape"

Status: ready for agent. Extends [docs/SPEC.md](SPEC.md) (the whole-game contract) for Milestone 2. Where they differ, this file wins for M2.

## Problem Statement

Milestone 1 proved the ODM gear. Jake's verdict: it plays "like butter", but it's hard to control, and so far there's nothing to do with it. Without Titans the traversal has no purpose, no threat and no reason to master the gear. Attack on Titan's core loop is to swing in, get behind a Titan and cut the nape, and that loop doesn't exist yet. Until it does, we can't tell whether the gear, the camera and the controls hold up under pressure, when a giant is turning toward you and reaching.

## Solution

Add the first Titan to the greybox district, together with everything needed to hunt it:

- **One Titan at a time.** It wanders the streets, notices Levi by sight or by the sound of his gas, chases him, and reaches up to grab him out of the air.
- **Hooks catch on the Titan's body.** Levi can swing around a moving giant.
- **E slashes.** A fast cut through the nape kills. Anything else only makes the Titan flinch. A killed Titan collapses and steams, and a new one appears somewhere else after a delay.
- **Grabs never end the run.** A grab holds Levi until he mashes free. Failing to escape costs gas.
- **Gas supply points on rooftops** refill gas and blades, so resupply becomes a route decision.
- **A minimal HUD:** gas, blade condition, a hit indicator, a grab warning and a kill count.

Everything stays greybox, with no Titan or Levi art (Milestones 4 and 5). The Titan is a deliberately oversized, slightly wrong-proportioned block giant, so it already reads as unsettling.

## User Stories

### Finding and reading a Titan

1. As a player, I want a Titan roaming the district's streets, so that the town has a threat in it.
2. As a player, I want to hear a Titan's footsteps and feel them through the camera as it gets closer, so that I know one is near before I see it.
3. As a player, I want the Titan to be 7 to 15 m tall with a huge head and long arms, so that it feels enormous and wrong next to 10 to 20 m houses.
4. As a player, I want to see where the Titan is looking, so that I can tell whether it has noticed me.
5. As a player, I want a Titan to notice me when I'm in its field of view and within range with a clear line of sight, so that hiding behind buildings works.
6. As a player, I want a Titan to notice me when I burst gas nearby, even out of sight, so that gas has a cost beyond the meter.
7. As a player, I want a Titan to lose interest a while after it loses track of me, so that I can break contact and set up an approach.
8. As a player, I want a noticed Titan to turn and chase me through the streets faster than it wanders, so that being spotted is urgent.
9. As a player, I want the Titan to stay in the streets and squares and never walk through buildings, so that the world stays solid.

### Grabs

10. As a player, I want a Titan in reach to raise its arm in a clear wind-up before it grabs, so that I can react.
11. As a player, I want a grab to catch me only if I'm inside the hand when it closes, so that dodging with gas or a hook works.
12. As a player, I want to be held in the Titan's hand when grabbed, with the screen and sound telling me so, so that the danger is unmistakable.
13. As a player, I want to mash Space to break free, so that a mistake is a scramble, not a game over.
14. As a player, I want to be released anyway after a few seconds even if I fail, losing a chunk of gas, so that a grab is punished but the run continues.
15. As a player, I want to be thrown clear on release with a moment of safety before the Titan can grab again, so that I'm not grabbed in a loop.

### Hooks and movement around Titans

16. As a player, I want the crosshair to light up on a Titan's body and my hooks to catch on it, so that I can swing around a giant.
17. As a player, I want a hook in a Titan to move with it as it walks and turns, so that the cable and swing follow the body.
18. As a player, I want the Titan's body to be solid (I bump off it and can land on its shoulders) but never to trap me, so that close combat feels physical.
19. As a player, I want all my M1 movement (auto-pull, reel, boost, wall stick) to work the same near Titans, so that the gear I learned still applies.

### Cutting

20. As a player, I want E to swing both blades in a quick slash with a clear pose and sound, so that attacking feels decisive.
21. As a player, I want a fast slash through the nape to kill the Titan, so that the kill is a skill shot.
22. As a player, I want a slash that's too slow, or that hits anywhere but the nape, to only make the Titan flinch, so that the nape rule is clear.
23. As a player, I want a hit marker at the crosshair when a slash connects, and a distinct one for a kill, so that I know what happened at speed.
24. As a player, I want a killed Titan to stagger, collapse and steam, so that a kill feels final.
25. As a player, I want a new Titan to appear somewhere else, out of sight, after a delay, so that the hunt continues.
26. As a player, I want a kill count, so that I can see how I'm doing.

### Blades, gas and supply

27. As a player, I want my blades to dull with each hit and a blade meter next to the gas meter, so that blades are a resource.
28. As a player, I want dull blades to be unable to kill, so that I have to resupply.
29. As a player, I want supply crates on a few rooftops that refill gas and blades while I stand on them, so that resupply is a route decision.
30. As a player, I want supply points to be visible from a distance, so that I can plan a route to them.

### Jake as director

31. As Jake, I want every new Titan, slash, grab and supply value in the F4 tuning panel, so that I can tune the fight live.
32. As Jake, I want the feel gate to keep applying to M1 values and to new M2 values after I've played M2, so that nothing is tuned behind my back.
33. As Jake, I want test worlds for the Titan (an open yard, a street and the full district), so that I can try each situation directly.
34. As Jake, I want replays of a nape kill, a grab and escape, and hooking a walking Titan, so that I can judge the fight quickly.
35. As Jake, I want the frame rate to stay at 60 with a Titan in view, so that the fight never stutters.

### Building it

36. As the build agent, I want the Titan's brain and body in the pure simulation core, deterministic and testable headless, so that every Titan rule is a scenario test.
37. As the build agent, I want one pose function shared by the simulation (hit volumes) and the renderer (the model), so that what I see is what I can hook and cut.
38. As the build agent, I want the Titan model to come from a deterministic Blender script with a contract test, so that it follows the asset rules.

## Implementation Decisions

### Titan in the simulation core (pure TypeScript, 120 Hz, deterministic)

- **State:**
  - position on the ground, yaw, height (chosen per spawn from a seeded range of 7 to 15 m, default 12)
  - gait phase
  - brain state
  - grab state
  - flinch timer
  - alive or collapsing or dead

  All randomness comes from the scenario seed through a seeded generator in the sim.
- **Body.** A fixed skeleton scaled by height:
  - pelvis, spine, neck, head, two arms (upper, fore, hand), two legs (thigh, shin)
  - proportions deliberately off: head about 1.6 times human proportion, arms long

  A single pure function computes joint rotations and world capsule volumes from the Titan state (position, yaw, gait phase, brain action and its phase). The simulation uses the capsules for hooks, collision, grabs and cuts. The renderer uses the same joint rotations to pose the Blender model. This is the one source of truth for where the Titan's body is.
- **Nape.** A named target volume at the back of the neck, about height/12 across. It's separate from the neck capsule, so cuts can tell a nape hit from a neck or head hit.
- **Navigation:**
  - A 2D occupancy grid (about 4 m cells) is built at load from the static colliders, with buildings blocked and the Titan's footprint radius dilated.
  - A* runs on that grid with a deterministic tie-break.
  - Wander picks a seeded reachable point within about 150 m; chase re-paths toward the player's ground position a few times per second.
  - The Titan turns at a limited rate and walks with a gait whose phase drives the footstep events.
- **Brain.** A state machine: wander, notice, chase, wind-up, grab, hold, recover, flinch, collapse, dead.
  - **Notice:** the player is within range, inside the field of view, and a head-to-player raycast is clear; or a gas boost or burst happens within the noise range.
  - **Lose interest:** no sight for the lose-interest time.
  - **Grab:**
    - A wind-up of fixed duration (the arm rises, telegraphing), aimed at the player's position predicted to the strike moment.
    - The strike: the hand volume sweeps to the aim point, and catches only if the player's body overlaps the hand at the strike tick.
    - A cooldown follows.
- **Grab and hold:**
  - While held, the player is attached to the hand, and hooks are released.
  - Space presses count toward escape, and presses decay over time. Reaching the count releases the player with a throw velocity.
  - After the maximum hold, the player is released anyway and loses a fraction of gas capacity.
  - Then a grace period with no re-grab.
  - No death.
- **Hooks on Titans:**
  - The aim raycast tests the static world and the Titan capsules and keeps the nearest hit. Titan capsules count as anchorable.
  - An anchor on a Titan is stored as body part plus local offset and re-evaluated in world space every tick.
  - The cable constraint uses the anchor's velocity, so the relative velocity is clipped rather than the absolute.
  - If the Titan dies, its hooks detach.
- **Collision.** The player's body spheres against the Titan capsules push the player out (the Titan is kinematic and never pushed). Surfaces facing up count as ground, so Levi can land on shoulders and the head. Landing on a moving Titan doesn't inherit its velocity in M2.
- **Slash:**
  - E starts a slash with a short active window and a cooldown.
  - During the active window, a blade volume (a sphere ahead of Levi along his velocity, falling back to the camera direction) is tested against the nape first, then the other capsules.
  - Nape overlap, relative speed at or above the kill speed, and blades above zero kill: the Titan collapses and the kill count rises.
  - Any other hit, or a too-slow nape hit, makes the Titan flinch.
  - Every hit wears the blades.
  - **Events:** `slash`, `slashHit` (part, speed), `napeKill`, `flinch`.
- **Death and respawn.** On a kill: stagger, then collapse over a couple of seconds. A dead Titan's capsules stay solid and hookable while it steams. After the respawn delay it's removed, and a new Titan spawns at a titan-spawn marker that is out of the player's view and far away. Only one Titan exists at a time in M2.
- **Supply.**
  - The supply points are rooftop crates: markers plus small anchorable colliders from the district script.
  - Standing within the supply radius refills gas and blades to full over the refill time.
- **Events for rendering and audio:** `titanStep` (position, strength), `titanNotice`, `titanWindup`, `grabbed`, `grabEscape`, `grabRelease`, `thrown`, `slash`, `slashHit`, `napeKill`, `flinch`, `titanCollapse`, `titanSpawn`, `supplyStart`, `supplyDone`.

### New tuning constants

All of these go in the tuning module as first-time values. Jake approves changes after he's played M2.

| Constant | Start | Unit |
|---|---|---|
| Titan height range | 7 to 15 (default 12) | m |
| Wander speed | 2.5 | m/s |
| Chase speed | 6.5 | m/s |
| Turn rate | 70 | deg/s |
| Notice range | 70 | m |
| Notice field of view | 130 | deg |
| Gas noise range | 35 | m |
| Lose interest after | 8 | s |
| Grab reach | 0.6 x height | m |
| Grab wind-up | 0.7 | s |
| Grab cooldown | 2.5 | s |
| Max hold | 3 | s |
| Escape presses | 8 | presses |
| Gas lost on a failed escape | 0.25 | of capacity |
| Throw speed | 12 | m/s |
| Re-grab grace | 2 | s |
| Slash active window | 0.25 | s |
| Slash cooldown | 0.45 | s |
| Blade reach | 2.2 | m |
| Nape kill speed (relative) | 15 | m/s |
| Blade wear per hit | 0.08 | of full |
| Respawn delay | 12 | s |
| Supply radius | 3 | m |
| Supply refill time | 1.5 | s |
| Footstep shake at 20 m | 0.25 | strength |

### Assets

- `tools/blender/titan.py` builds `public/assets/titan.glb`:
  - a jointed block giant, normalized to 1 m tall (the game scales it by height), facing -z
  - required nodes named per the skeleton, plus a nape marker node
  - pale skin material, a darker hair cap, a flat grin plane
  - under 8k triangles
  - deterministic, with a contract test
- `tools/blender/district.py` adds:
  - six to eight rooftop supply crates, spread so one is within about 150 m of anywhere, with one near the spawn (markers `supply_*` plus crate colliders, kind `supply`, anchorable)
  - four or more titan-spawn markers (`titan_spawn_*`) in squares and wide streets

  The district hash and contract test are updated.
- The mannequin gains no new nodes. Slash and grabbed poses are joint targets in the renderer.

### Rendering, UI and audio (greybox)

- **Titan model** posed from the shared pose function, casting shadows. A head-look toward its target. A collapse animation.
- **Steam:** a rising column of pale puffs from a dead Titan, reusing the gear-effects puff approach.
- **Camera:**
  - footstep shake scaled by distance
  - a stronger shake and slight zoom while grabbed
  - an impact kick on a nape kill
  - no clipping into the Titan: its capsules join the camera collision probe
- **Mannequin:** `slash` (arms sweep) and `grabbed` (struggling) poses, in addition to the M1 poses.
- **HUD:**
  - a blade meter beside the gas meter
  - a hit marker at the crosshair (distinct for a kill)
  - a grab warning with the escape progress
  - a small kill count
  - the crosshair treats Titan capsules as valid targets
- **Supply crates:** a bright, readable greybox color, visible from afar.
- **Audio:** slash swish, blade clang on a non-kill hit, a heavy thud and steam hiss on a kill, Titan footsteps (thuds by distance), a grab crunch, a release whoosh.

### Scenarios and live play

- **New fixture worlds:**
  - **`titan-yard`:** open ground, a few low blocks and one Titan.
  - **`titan-street`:** a 16 m street between 15 m buildings.
- Live play works on each with `?play=`. The default live game (district) spawns one Titan at a titan-spawn marker within sight of the spawn roof.

## Testing Decisions

**Seams: the same as M1** (confirmed by Jake).
1. **Headless scenarios:** a scenario plus timelines and deterministic policies, asserting through telemetry. Titan state and events are added to telemetry.
2. **Browser runner:** the same scenarios in real Chrome on the Apple GPU.
3. **Asset contracts.**

A good test asserts what a player would notice (the Titan grabbed me, I escaped, the nape cut killed it), never internal counters.

**Headless scenarios, each with a deterministic policy where the player must react:**
- **titan-wander:** 120 s of wandering in the district. The Titan never overlaps a building footprint, stays inside the Wall, and covers ground.
- **titan-notice-sight / titan-hidden / titan-noise:**
  - Seen in range: the Titan notices within a second.
  - Behind a building: it never notices.
  - A gas burst within noise range behind a building: it notices.
- **titan-chase and lose-interest:**
  - Chasing shrinks the distance.
  - After hiding for the lose-interest time, it returns to wander.
- **titan-grab / titan-dodge:**
  - Hovering still in reach: grabbed after the wind-up.
  - Boosting away during the wind-up: never grabbed.
- **grab-escape / grab-timeout:**
  - Mashing Space frees Levi within the hold time.
  - Not mashing releases him at max hold, minus the gas penalty.
  - Either way the run continues and the re-grab grace holds.
- **hook-titan:**
  - A hook fired at the walking Titan attaches to a body part.
  - Its anchor tracks the part over several seconds of walking, within a small error of the pose function.
- **nape-kill / nape-slow / body-slash / dull-blades:**
  - A policy swings behind the Titan and slashes at the kill speed: kill, collapse, respawn later.
  - The same approach below the kill speed: no kill.
  - A fast slash on an arm: flinch only.
  - Blades at zero: no kill.
- **supply:**
  - Landing on a crate with low gas and blades refills both within the refill time.
  - Leaving early stops the refill.
- **Determinism:** every new scenario, run twice, gives bit-identical telemetry.
- **Regression:** every M1 scenario still passes.

**Browser:**
- smoke with a Titan in view, zero console errors
- perf flight with a Titan in view and walking: the same 60 average, 45 low, 100 ms limits
- replays: `nape-kill`, `grab-escape`, `hook-titan`
- **features:**
  - the slash and grabbed poses
  - the blade meter
  - hit and kill markers
  - the grab warning with escape progress
  - the kill count
  - the crosshair valid on the Titan
  - supply refill shown on the meters
  - a live-play controls check that E slashes

**Assets:**
- titan.glb contract: nodes, the nape marker, triangle budget, determinism
- the updated district contract: supply crates and titan-spawn markers exist, and crates stand on roofs

**Prior art:** the M1 scenario suite, browser runner, features runner and asset contracts. Extend them; don't fork them.

## Out of Scope

- Titan art, several Titan types, abnormal Titans, and more than one Titan at a time (Milestone 5).
- Levi's real model, cloak and blades art (Milestone 4).
- The environment art pass, the shot list and the image critic (Milestone 3).
- Death, health, fail states, story, missions and menus beyond the pause card.
- Titans climbing buildings or destroying them, and limb severing.
- Inheriting a moving Titan's velocity when landing on it.
- Changing any M1 feel value without Jake's approval.

## Further Notes

- **Carried over from M1:** `autoPull` = 8 m/s² (Jake asked for it after M1).
- **Controls are the risk.** Jake said M1 is "hard to control". M2 adds a moving target, so the handoff must say honestly whether hitting the nape is fun or frustrating. It should propose specific assist values (aim-assist cone, a blade reach bonus near the nape, notice range), but not apply them.
- **Performance** must be measured when the laptop is quiet (a load average under about 10), and recorded with the load average, as in M1.
