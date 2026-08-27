# Oil Timer: two selectable models

`Immiscible (VOF)` is the startup model. `Legacy` keeps the v0.3.5 concentration
and relative-settling implementation available for comparison. Switching model
resets the oil and rotation, but retains the vessel shape and parameter values.
Reloading starts in VOF. Reset retains whichever model is selected.

Oil color is picked once on each page load from eight bright colors. The last
color name is remembered in this tab's session storage and excluded on the next
load, so consecutive reloads do not repeat it. If browser storage is unavailable,
the page still picks a random color, but cannot guarantee avoiding repeats.
Playback, Pause, Reset, Invert, vessel changes, and model changes retain the
current color. Only the rendered RGB channels change: oil coverage, opacity,
solver state, and physical parameters are unaffected. The canvas accessible
label also includes the color name.

Surface tension can be set from 0 to 200 in increments of 0.01 using either
the slider or the number field in both models. Its startup value remains 20.
Higher values can require more VOF substeps and slow playback; the existing
velocity and transport limits still apply. These are model units, not N/m.

`Oil contact angle (°)` is available in VOF, from 15° to 165° in 1° increments.
The angle is measured **through oil**. Below 90° favors oil spreading on the
wall; above 90° favors a compact drop that wets less of the wall. The startup
value is **140°**, an assumed comparison condition, not a measurement of the
pictured timer or a material identification. Changing it does not reset or
add/remove oil. Legacy disables this control, retains its value for a return
to VOF, and keeps its original wall treatment.

## Vessel shapes and paddle wheel

The original **Rounded, Straight, Wide, Stairs** remain available. Four more
choices work in both models; selecting a shape resets the oil and returns the
vessel upright, while retaining all parameter values. Rounded is still the
startup choice.

| Choice | Geometry |
| --- | --- |
| Capsule | Round ends and a center partition with a narrow opening |
| Twin neck | Three bulbs joined by two constrictions |
| Pegboard | End reservoirs and four staggered rows of glass pins |
| Paddle wheel | Offset reservoir outlets and a central wheel with six paddles |

Internal partitions, pins, and the wheel axle share the wall mask and the
render clip. The fine-grid lookup resolves centers on a coarse wall edge
consistently, avoiding a floating-point-dependent choice of neighboring cell.
For multi-chamber shapes, completion counts oil in the destination reservoir,
not oil still traveling through the middle. Pin trapping and capillary retention
remain possible; these are not guarantees of full drainage.

The wheel has no motor or prescribed spin. It exchanges drag impulses with
nearby fluid velocities, then the solver projects the fluid velocity before
transporting oil. The equal and opposite torque changes the wheel's angular
speed; bearing damping slows it. Pause stops fluid, wheel, and vessel together.
Reset and model/shape changes reset the wheel. Invert also applies the support's
angular acceleration to the wheel in the vessel frame.

The six radial paddles are **permeable drag strips on a fixed grid**, not sealed
moving solid walls. There is no solid-cell replacement, discarded oil, or hidden
mass correction when they turn. Oil can pass through a paddle; moving blade
displacement, blade contact angles, and exact no-slip coupling are not modeled.
Legacy also retains its empirical relative settling, which is not constrained
by these drag strips. This is a visual fluid/rotor coupling demonstration, not
a calibrated turbine or rigid-body fluid solver.

In model units the radius is 22, hub radius 4, strip support half-width 1.4,
moment of inertia `0.08 * radius^4`, drag relaxation rate 16, and bearing decay
rate 0.025. Each velocity degree of freedom has mass `m = gridSpacing^2`.
For its lever arm `l`, velocity `v`, and wheel speed `w`, the implicit impulse is
`J = -(v - l*w) / (1/m + l*l/I + 1/(k*dt))`. The updates `v += J/m` and
`w -= l*J/I` conserve angular momentum and dissipate slip energy for that pair.
Forward/backward half sweeps reduce ordering bias. Pressure, static wall forces,
bearing friction, and the existing velocity caps mean this pairwise property
is not a claim of angular-momentum conservation for the entire closed vessel.

## Immiscible (VOF)

- Grid: 216×243, square cells, 2.25 times as many cells as Legacy (144×162).
  Both sample the same vessel profile and internal glass. The static wall mask
  is an approximation to the vector outline; the rendering uses the exact clip.
- A cell value is the fraction of its area occupied by oil. Within that cell,
  a PLIC line separates pure oil from pure water. Intermediate values do not
  mean molecular mixing. Reconstruction uses a Youngs-style weighted normal
  and an analytic area-to-line-intercept inversion.
- Oil flux is the geometric intersection of the reconstructed oil polygon
  with the slab crossing a face. Alternating directional sweeps share a frozen
  step function for the Weymouth–Yue divergence correction. There is no scalar
  diffusion, algebraic interface compression, empirical settling, or rounding
  of the transported fractions to 0/1. The geometric CFL is at most 0.45.
- Velocity is stored on staggered faces. A closed-wall, five-point pressure
  Poisson matrix is factored by banded Cholesky when the shape changes. Each
  step solves the matrix and projects the face velocities to zero divergence.
- The illustrative momentum update combines semi-Lagrangian advection, a
  phase-weighted Laplacian viscosity, buoyancy, surface tension, and rotating
  frame inertia. This is a Boussinesq approximation, **not a calibrated,
  variable-density, full two-fluid Navier–Stokes implementation**. In
  particular, density affects buoyancy rather than the pressure matrix and
  inertia, and the viscosity update is not the complete variable-viscosity
  stress tensor. Small density contrasts are the intended regime.
- All coefficients use model units. One length unit is 1/144 of the canvas
  width. The effective kinematic viscosity is `0.001 + 0.035 * viscosity`;
  effective surface tension is `0.01 * surfaceTension / waterDensity`.
  Gravity gain is 4.8. Buoyancy multiplies the density contrast by `1 + buoyancy`.
  The resulting contrast is capped to ±8, and face velocities are uniformly
  bounded to 6, preserving their zero divergence. Timestep subdivision observes
  velocity, viscosity, and capillary restrictions. These conversions are
  visualization choices, not measured oil properties.
- Curvature uses a smoothed force stencil. **The oil fractions themselves are
  not smoothed.** The static contact-angle condition uses an outward oil normal
  `n` and a wall normal `w` directed into the fluid, with `n·w = cos(theta)`.
  At wall contact cells, PLIC orientation changes while its intercept is solved
  again for exactly the same occupied area. Curvature uses geometric ghost-cell
  continuation and a face-normal boundary condition; ghost values are used
  only for forces, never to inject oil into the transport domain. The tangential
  direction is retained, and a uniform wall film is not assigned an arbitrary
  contact line. Surface tension drives the relaxation; there is no added
  empirical wall-repulsion velocity or mandatory drainage correction.
- Walls are the existing grid-aligned mask. Corners use an averaged wall normal
  for reconstruction and individual solid faces for curvature. A curved visual
  vessel therefore does not have an exact smooth-wall contact angle at each
  pixel. The model is not calibrated for wetting, dynamic contact angles,
  advancing/receding hysteresis, or moving-contact-line slip. Parasitic currents,
  grid pinning, and unresolved thin films or tiny droplets remain. Neither 0°
  nor 180° complete wetting limits are implemented.
- Rendering integrates the PLIC polygon over each display pixel, including
  pixels spanning several cells. This avoids a 50% display threshold, missing
  small oil areas, or antialiasing seams at internal grid edges.
- Flow and drop timing differ from Legacy. Capillary blockage or wall films
  can prevent complete transfer; the solver does not force the last oil out.
  Existing Legacy drip presets are not a physical calibration of this model.

`Phase separation` remains visible but is disabled in VOF. Its value is retained
for Legacy, where it still controls the previous interface-compression model.

## Legacy

The original pressure projection, conservative concentration update, interface
compression, empirical relative settling and concentration-contour rendering
remain in `index.html`. The default parameter values remain Rounded, surface
tension 20, phase separation 16, viscosities 2/0.4, densities 1.1/1, buoyancy 0,
and playback speed 0.5. The same values initialize VOF, but their effects differ
because the model is different.

## Verification

The tests in `scripts/oil-timer.test.cjs` run the actual page code with a DOM
stub. Existing physics fixtures select Legacy explicitly; startup tests select
the real VOF default. New tests cover PLIC areas/face slabs, translation of a
round interface, pressure projection, a flat equilibrium interface, pixel-area
rendering, model switching, all vessel shapes, and animated inversion.
Contact-angle tests check oil-side sign on all wall directions, preservation
of occupied area, the absence of a wall effect on a detached drop, and sessile
drops at 60°, 90°, and 140°. The zero-gravity circular-cap comparison checks both
wall footprint and height with explicit grid-scale tolerances; it is not an
exact contact-line or grid-convergence validation. The 140° startup wall delays
the first drop relative to the prior neutral treatment.
Wheel tests check opposite-side falling drops, fluid back-reaction, pairwise
angular momentum and energy, no spontaneous spin at rest, connected masks,
shared wall clips, parameter retention, pause/reset, and both models. The VOF
inversion and view-fit tests cover all eight shapes. The diagnostic
`test-results/oil-timer-wheel-check.cjs --record` runs the actual default page
for 2400 frames and records mass, projection, and wheel motion; it does not
establish full drainage.

```powershell
node --test --test-name-pattern='VOF|paddle|new vessels|model selector|requested page defaults initialize' scripts/oil-timer.test.cjs
node --test scripts/oil-timer.test.cjs
```

The complete suite includes long Legacy drainage runs. Passing interface and
mass tests does not establish agreement with a real oil timer.

## Method references

- [Basilisk geometric VOF advection](https://basilisk.fr/src/vof.h)
- [Basilisk interface reconstruction and volume fractions](https://basilisk.fr/src/fractions.h)
- [Basilisk immiscible two-phase interface definition](https://basilisk.fr/src/two-phase.h)
- [Basilisk contact-angle boundary conditions](https://basilisk.fr/src/contact.h)
- [Basilisk sessile-drop benchmark](https://basilisk.fr/src/test/sessile.c)
- [OpenFOAM interface-normal contact-angle condition](https://cpp.openfoam.org/v12/interfaceProperties_8C_source.html)
- [Peskin: The immersed boundary method](https://www.cambridge.org/core/journals/acta-numerica/article/immersed-boundary-method/95ECDAC5D1824285563270D6DD70DA9A) — background on fluid/structure force coupling; the wheel here uses the simpler drag-strip approximation described above, not the full method.

These describe the numerical method. This JavaScript implementation does not
embed Basilisk or implement all of its fluid, curvature, or boundary solvers.
