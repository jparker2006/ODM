# Milestone 2 tuning table

Every constant in `src/sim/tuning.ts` at the end of Milestone 2, generated with `tuningTable` (the F4 panel's "Export all" gives the same table). Before and after are equal: nothing was tuned after the first build. The M2 rows are the Titan, Grab and Blades groups and the five new Camera rows; everything else is unchanged from Milestone 1, including `autoPull` = 8.

| Group | Constant | Before | After | Unit |
|---|---|---|---|---|
| World | Simulation rate (`simRate`) | 120 | 120 | Hz |
| World | Gravity (chosen within spec range 9.81 to 20) (`gravity`) | 16 | 16 | m/s² |
| World | Air drag (`airDrag`) | 0.02 | 0.02 | 1/s |
| World | Soft top speed (`softTopSpeed`) | 35 | 35 | m/s |
| World | Drag above soft top speed (`overSpeedDrag`) | 0.8 | 0.8 | 1/s |
| World | Hard speed cap (`hardCap`) | 50 | 50 | m/s |
| Body | Levi height (`bodyHeight`) | 1.6 | 1.6 | m |
| Body | Collision radius (`bodyRadius`) | 0.35 | 0.35 | m |
| Hooks | Hook range (`hookRange`) | 60 | 60 | m |
| Hooks | Hook travel speed (`hookSpeed`) | 150 | 150 | m/s |
| Hooks | Aim-assist cone (`aimAssistCone`) | 3 | 3 | deg |
| Hooks | Hook retract speed (`hookRetractSpeed`) | 200 | 200 | m/s |
| Hooks | Winder slack take-up (`windRate`) | 30 | 30 | m/s |
| Hooks | Minimum cable length (`minRope`) | 2 | 2 | m |
| Reel | Reel-in speed (`reelSpeed`) | 18 | 18 | m/s |
| Reel | Reel pull toward anchor (`reelAccel`) | 28 | 28 | m/s² |
| Reel | Reel gas use (`reelGasRate`) | 0.5 | 0.5 | gas/s |
| Reel | Auto-pull toward anchor while hooked (no gas, off while reeling) (`autoPull`) | 8 | 8 | m/s² |
| Gas | Gas capacity (`gasCapacity`) | 40 | 40 | s of boost |
| Gas | Infinite gas (0 off, 1 on) (`infiniteGas`) | 0 | 0 | toggle |
| Gas | Boost thrust (`boostAccel`) | 24 | 24 | m/s² |
| Gas | Boost burst on press (`boostBurst`) | 5 | 5 | m/s |
| Gas | Boost burst gas cost (`boostBurstGas`) | 0.5 | 0.5 | gas |
| Gas | Boost gas use (`boostGasRate`) | 1 | 1 | gas/s |
| Ground | Run speed (`runSpeed`) | 9 | 9 | m/s |
| Ground | Run acceleration (`groundAccel`) | 60 | 60 | m/s² |
| Ground | Ground braking (`groundFriction`) | 40 | 40 | m/s² |
| Ground | Jump speed (`jumpSpeed`) | 7 | 7 | m/s |
| Air | Air control (`airAccel`) | 9 | 9 | m/s² |
| Landing | Hard-landing impact speed (`stumbleSpeed`) | 15 | 15 | m/s |
| Landing | Horizontal speed that turns a stumble into a roll (`rollMinSpeed`) | 8 | 8 | m/s |
| Landing | Stumble recovery (`stumbleTime`) | 1.1 | 1.1 | s |
| Landing | Roll recovery (`rollTime`) | 0.7 | 0.7 | s |
| Landing | Speed kept through a roll (`rollKeep`) | 0.75 | 0.75 | fraction |
| Wall | Impact speed to stick (`wallStickMinSpeed`) | 8 | 8 | m/s |
| Wall | Stick time (`wallStickTime`) | 0.9 | 0.9 | s |
| Wall | Gravity while stuck (`wallSlideGravity`) | 0.15 | 0.15 | fraction |
| Wall | Push-off away from wall (`pushOffOut`) | 9 | 9 | m/s |
| Wall | Push-off upward (`pushOffUp`) | 7 | 7 | m/s |
| Wall | Re-stick cooldown (`wallCooldown`) | 0.35 | 0.35 | s |
| Assists | Keep speed when cable goes taut (`assistMomentum`) | 1 | 1 | strength 0 to 1 |
| Assists | First-arc minimum speed (`assistFirstArc`) | 1 | 1 | strength 0 to 1 |
| Assists | First-arc speed floor (`firstArcMinSpeed`) | 12 | 12 | m/s |
| Assists | Ground clearance (`assistClearance`) | 1 | 1 | strength 0 to 1 |
| Assists | Clearance above floor (`clearanceHeight`) | 2.5 | 2.5 | m |
| Assists | Clearance cable shortening rate (`clearanceRate`) | 30 | 30 | m/s |
| Assists | Wall avoidance (`assistWallAvoid`) | 1 | 1 | strength 0 to 1 |
| Assists | Wall avoidance steering (`wallAvoidAccel`) | 30 | 30 | m/s² |
| Assists | Wall avoidance look-ahead (`wallAvoidLook`) | 0.35 | 0.35 | s |
| Assists | Release boost (`assistRelease`) | 1 | 1 | strength 0 to 1 |
| Assists | Release boost forward (`releaseForward`) | 3 | 3 | m/s |
| Assists | Release boost upward (`releaseUp`) | 5 | 5 | m/s |
| Assists | Swing time before release boost (`releaseMinTaut`) | 0.2 | 0.2 | s |
| Assists | Chain window (`chainWindow`) | 1.5 | 1.5 | s |
| Assists | Top speed bonus per chained swing (`chainBonus`) | 2 | 2 | m/s |
| Assists | Maximum chain count (`chainMax`) | 4 | 4 | count |
| Titan | First Titan height (`titanHeight`) | 12 | 12 | m |
| Titan | Respawn height, lowest (`titanHeightMin`) | 7 | 7 | m |
| Titan | Respawn height, highest (also sizes the walkable grid) (`titanHeightMax`) | 15 | 15 | m |
| Titan | Wander speed (`wanderSpeed`) | 2.5 | 2.5 | m/s |
| Titan | Chase speed (`chaseSpeed`) | 6.5 | 6.5 | m/s |
| Titan | Turn rate (`titanTurnRate`) | 70 | 70 | deg/s |
| Titan | Wander target radius (spec: about 150) (`wanderRadius`) | 150 | 150 | m |
| Titan | Pause between wander legs, up to (chosen) (`wanderPause`) | 3 | 3 | s |
| Titan | Chase re-path interval (chosen) (`chaseRepath`) | 0.3 | 0.3 | s |
| Titan | Notice range (`noticeRange`) | 70 | 70 | m |
| Titan | Notice field of view (`noticeFov`) | 130 | 130 | deg |
| Titan | Gas noise range (`noiseRange`) | 35 | 35 | m |
| Titan | Turn toward the player on noticing (chosen) (`noticeTime`) | 0.6 | 0.6 | s |
| Titan | Lose interest after (`loseInterest`) | 8 | 8 | s |
| Titan | Flinch duration (chosen) (`flinchTime`) | 0.8 | 0.8 | s |
| Titan | Collapse duration (chosen) (`collapseTime`) | 2.5 | 2.5 | s |
| Titan | Respawn delay (`respawnDelay`) | 12 | 12 | s |
| Titan | Respawn at least this far from the player (goal: 150) (`respawnMinDistance`) | 150 | 150 | m |
| Grab | Grab reach (from the shoulder) (`grabReach`) | 0.6 | 0.6 | x height |
| Grab | Grab only within this angle of facing (chosen) (`grabFacing`) | 60 | 60 | deg |
| Grab | Grab wind-up (`grabWindup`) | 0.7 | 0.7 | s |
| Grab | Hand closing after a missed grab (chosen) (`grabClose`) | 0.25 | 0.25 | s |
| Grab | Arm return after a grab (chosen) (`grabRecover`) | 0.6 | 0.6 | s |
| Grab | Grab cooldown (from the strike) (`grabCooldown`) | 2.5 | 2.5 | s |
| Grab | Max hold (`maxHold`) | 3 | 3 | s |
| Grab | Escape presses (`escapePresses`) | 8 | 8 | presses |
| Grab | Escape press decay (chosen) (`escapeDecay`) | 1.5 | 1.5 | presses/s |
| Grab | Gas lost on a failed escape (`escapePenalty`) | 0.25 | 0.25 | of capacity |
| Grab | Throw speed (`throwSpeed`) | 12 | 12 | m/s |
| Grab | Re-grab grace (`regrabGrace`) | 2 | 2 | s |
| Blades | Slash active window (`slashActive`) | 0.25 | 0.25 | s |
| Blades | Slash cooldown (`slashCooldown`) | 0.45 | 0.45 | s |
| Blades | Blade reach (`bladeReach`) | 2.2 | 2.2 | m |
| Blades | Nape kill speed (relative) (`napeKillSpeed`) | 15 | 15 | m/s |
| Blades | Blade wear per hit (`bladeWear`) | 0.08 | 0.08 | of full |
| Blades | Supply radius (`supplyRadius`) | 3 | 3 | m |
| Blades | Supply refill time (`supplyRefill`) | 1.5 | 1.5 | s |
| Camera | Boom distance (`camDistance`) | 3.6 | 3.6 | m |
| Camera | Boom height (`camHeight`) | 0.8 | 0.8 | m |
| Camera | Shoulder offset (`camShoulder`) | 0.7 | 0.7 | m |
| Camera | Follow stiffness (`camFollow`) | 14 | 14 | 1/s |
| Camera | FOV at low speed (`fovMin`) | 60 | 60 | deg |
| Camera | FOV at high speed (`fovMax`) | 75 | 75 | deg |
| Camera | Speed for minimum FOV (`fovSpeedLow`) | 10 | 10 | m/s |
| Camera | Speed for maximum FOV (`fovSpeedHigh`) | 40 | 40 | m/s |
| Camera | Swing lean (`camLean`) | 7 | 7 | deg |
| Camera | Impact shake (`shakeImpact`) | 0.35 | 0.35 | strength |
| Camera | Titan footstep shake at 20 m (`stepShake`) | 0.25 | 0.25 | strength |
| Camera | Titan footsteps felt out to (chosen) (`stepShakeRange`) | 90 | 90 | m |
| Camera | Shake while grabbed (chosen) (`grabShake`) | 0.5 | 0.5 | strength |
| Camera | Zoom in while grabbed (chosen) (`grabZoom`) | 8 | 8 | deg |
| Camera | Nape-kill impact kick (chosen) (`killKick`) | 0.8 | 0.8 | strength |
| Controls | Mouse sensitivity (`mouseSensitivity`) | 0.0022 | 0.0022 | rad/px |
| Controls | Invert Y (0 off, 1 on) (`invertY`) | 0 | 0 | toggle |
| Render | Minimum render scale (`renderScaleMin`) | 0.75 | 0.75 | fraction |
| Render | Maximum render scale (`renderScaleMax`) | 1 | 1 | fraction |
