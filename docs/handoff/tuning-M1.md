# Milestone 1 tuning values

Every feel constant at the Milestone 1 handoff (from `src/sim/tuning.ts`). Nothing has been tuned yet; these are the starting values.

| Group | Constant | Value | Unit |
|---|---|---|---|
| World | Simulation rate (`simRate`) | 120 | Hz |
| World | Gravity (chosen within spec range 9.81 to 20) (`gravity`) | 16 | m/s² |
| World | Air drag (`airDrag`) | 0.02 | 1/s |
| World | Soft top speed (`softTopSpeed`) | 35 | m/s |
| World | Drag above soft top speed (`overSpeedDrag`) | 0.8 | 1/s |
| World | Hard speed cap (`hardCap`) | 50 | m/s |
| Body | Levi height (`bodyHeight`) | 1.6 | m |
| Body | Collision radius (`bodyRadius`) | 0.35 | m |
| Hooks | Hook range (`hookRange`) | 60 | m |
| Hooks | Hook travel speed (`hookSpeed`) | 150 | m/s |
| Hooks | Aim-assist cone (`aimAssistCone`) | 3 | deg |
| Hooks | Hook retract speed (`hookRetractSpeed`) | 200 | m/s |
| Hooks | Winder slack take-up (`windRate`) | 30 | m/s |
| Hooks | Minimum cable length (`minRope`) | 2 | m |
| Reel | Reel-in speed (`reelSpeed`) | 18 | m/s |
| Reel | Reel pull toward anchor (`reelAccel`) | 28 | m/s² |
| Reel | Reel gas use (`reelGasRate`) | 0.5 | gas/s |
| Gas | Gas capacity (`gasCapacity`) | 40 | s of boost |
| Gas | Infinite gas (0 off, 1 on) (`infiniteGas`) | 0 | toggle |
| Gas | Boost thrust (`boostAccel`) | 24 | m/s² |
| Gas | Boost burst on press (`boostBurst`) | 5 | m/s |
| Gas | Boost burst gas cost (`boostBurstGas`) | 0.5 | gas |
| Gas | Boost gas use (`boostGasRate`) | 1 | gas/s |
| Ground | Run speed (`runSpeed`) | 9 | m/s |
| Ground | Run acceleration (`groundAccel`) | 60 | m/s² |
| Ground | Ground braking (`groundFriction`) | 40 | m/s² |
| Ground | Jump speed (`jumpSpeed`) | 7 | m/s |
| Air | Air control (`airAccel`) | 9 | m/s² |
| Landing | Hard-landing impact speed (`stumbleSpeed`) | 15 | m/s |
| Landing | Horizontal speed that turns a stumble into a roll (`rollMinSpeed`) | 8 | m/s |
| Landing | Stumble recovery (`stumbleTime`) | 1.1 | s |
| Landing | Roll recovery (`rollTime`) | 0.7 | s |
| Landing | Speed kept through a roll (`rollKeep`) | 0.75 | fraction |
| Wall | Impact speed to stick (`wallStickMinSpeed`) | 8 | m/s |
| Wall | Stick time (`wallStickTime`) | 0.9 | s |
| Wall | Gravity while stuck (`wallSlideGravity`) | 0.15 | fraction |
| Wall | Push-off away from wall (`pushOffOut`) | 9 | m/s |
| Wall | Push-off upward (`pushOffUp`) | 7 | m/s |
| Wall | Re-stick cooldown (`wallCooldown`) | 0.35 | s |
| Assists | Keep speed when cable goes taut (`assistMomentum`) | 1 | strength 0 to 1 |
| Assists | First-arc minimum speed (`assistFirstArc`) | 1 | strength 0 to 1 |
| Assists | First-arc speed floor (`firstArcMinSpeed`) | 12 | m/s |
| Assists | Ground clearance (`assistClearance`) | 1 | strength 0 to 1 |
| Assists | Clearance above floor (`clearanceHeight`) | 2.5 | m |
| Assists | Clearance cable shortening rate (`clearanceRate`) | 30 | m/s |
| Assists | Wall avoidance (`assistWallAvoid`) | 1 | strength 0 to 1 |
| Assists | Wall avoidance steering (`wallAvoidAccel`) | 30 | m/s² |
| Assists | Wall avoidance look-ahead (`wallAvoidLook`) | 0.35 | s |
| Assists | Release boost (`assistRelease`) | 1 | strength 0 to 1 |
| Assists | Release boost forward (`releaseForward`) | 3 | m/s |
| Assists | Release boost upward (`releaseUp`) | 5 | m/s |
| Assists | Swing time before release boost (`releaseMinTaut`) | 0.2 | s |
| Assists | Chain window (`chainWindow`) | 1.5 | s |
| Assists | Top speed bonus per chained swing (`chainBonus`) | 2 | m/s |
| Assists | Maximum chain count (`chainMax`) | 4 | count |
| Camera | Boom distance (`camDistance`) | 3.6 | m |
| Camera | Boom height (`camHeight`) | 0.8 | m |
| Camera | Shoulder offset (`camShoulder`) | 0.7 | m |
| Camera | Follow stiffness (`camFollow`) | 14 | 1/s |
| Camera | FOV at low speed (`fovMin`) | 60 | deg |
| Camera | FOV at high speed (`fovMax`) | 75 | deg |
| Camera | Speed for minimum FOV (`fovSpeedLow`) | 10 | m/s |
| Camera | Speed for maximum FOV (`fovSpeedHigh`) | 40 | m/s |
| Camera | Swing lean (`camLean`) | 7 | deg |
| Camera | Impact shake (`shakeImpact`) | 0.35 | strength |
| Controls | Mouse sensitivity (`mouseSensitivity`) | 0.0022 | rad/px |
| Controls | Invert Y (0 off, 1 on) (`invertY`) | 0 | toggle |
| Render | Minimum render scale (`renderScaleMin`) | 0.75 | fraction |
| Render | Maximum render scale (`renderScaleMax`) | 1 | fraction |
