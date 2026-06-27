# Deep Interview Spec: normal-fitting-geometry-db

## Metadata
- Profile: autopilot quick crystallization from explicit user requirements
- Context: brownfield FlowCAD 3D app
- Context snapshot: .omx/context/normal-fitting-geometry-db-20260627T030758Z.md
- Final ambiguity: 0.18 / threshold 0.20
- Interview-complete rationale: User supplied concrete desired behavior and current repo already exposes the architecture seams (SpecRepository + backend GeometryFactory + frontend GeometryFactory). Remaining catalog exactness can be represented as seed data and extension points without blocking MVP implementation.

## Intent
Make pipe/duct fittings look like recognizable mechanical/HVAC components instead of generic sphere/box placeholders, while preserving a backend-driven standard sizing contract.

## Desired Outcome
- Pipe mode uses nominal size/schedule DB to size straight pipe, elbows, tees, and valves with OD and bend radius/branch dimensions.
- Duct mode supports rectangular and round duct sections, damper visual fitting, elbow-like duct bend, and rectangular↔round transition/hopper geometry.
- Scene Document remains the shared contract: backend computes physical parameters; frontend builds Three.js geometry.

## In Scope
1. Extend backend fitting params with directions, OD/radius/width/height, bend radius, leg lengths, valve/damper body dimensions, and transition endpoint sections.
2. Keep the spec repository as the pipe standard DB; derive pipe fitting defaults from `PipeSpec`, and keep duct section/fitting sizing defaults in parser/geometry code until a dedicated duct catalogue exists.
3. Update frontend geometry factory to render:
   - pipe elbow as a torus/curved fitting instead of a sphere,
   - pipe tee as main run + branch cylinders,
   - valve as body + flanges/handle,
   - duct transition as a tapered rectangular/round hopper mesh,
   - damper as a short duct body with blade/shaft.
4. Add backend regression tests for generated fitting parameters and shape transition detection.
5. Build/typecheck verification.

## Out of Scope / Non-goals
- Full manufacturer catalogue import, pressure class validation, or exact fabrication standards beyond seed defaults.
- Exact boolean-union CAD solids for every fitting/export format in this pass.
- New dependencies.
- Reworking the entire routing engine.

## Decision Boundaries
- The agent may choose parametric visual approximations when exact manufacturer geometry is unavailable.
- The agent may keep export primitives approximate as long as web Scene geometry improves and tests cover the Scene contract.
- The agent may add columns only if required, but should prefer backward-compatible parsing from existing fields.

## Constraints
- Keep `apps/api/app/domain/scene.py` and `packages/shared/src/scene.ts` synchronized, including widening param value types for flat string/number/vector fields.
- Keep current sample/template workflow functional.
- No new dependencies.
- Existing tests/build should pass.

## Acceptance Criteria
- Backend pipe elbows include `bendRadius` derived from pipe DB and direction vectors from adjacent segments.
- Backend pipe tees/valves include recognizable sizing params rather than only `position/radius`.
- Duct rows with changing `shape`/section across consecutive rows generate a `transition` element with `from*`/`to*` section params.
- Frontend no longer renders `elbow`, `tee`, `transition`, `valve`, `damper` as only generic sphere/box placeholders.
- `npm run build:web` passes.
- `pytest` backend tests pass.

## Brownfield Evidence
- `apps/api/app/specs/repository.py` has `PipeSpec` and `_DEFAULT_PIPE_SPECS` for OD/wall.
- `apps/api/app/engine/geometry_factory.py` currently returns simple fitting params.
- `apps/web/src/three/GeometryFactory.tsx` currently maps `elbow|tee|transition` to `SphereFitting` and `valve|damper` to `BoxFitting`.

## Revision 1 Notes
- Scene params will use a flat wire schema only: numbers, strings, and `[x,y,z]` vectors.
- Backend computes direction vectors and sizing. Frontend builds meshes from those params.
- Pipe DB remains the source for OD/wall/bend radius; duct dimensions come from rows and backend inference, with future catalogue support explicitly deferred.

