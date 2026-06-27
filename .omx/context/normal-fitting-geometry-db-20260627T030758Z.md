# Autopilot Context: normal-fitting-geometry-db

- activation prompt / task seed: $autopilot implement normal-looking pipe/duct fitting geometry and standard DB-backed sizing.
- original task status: activation-prompt
- desired outcome: Replace placeholder sphere/box fittings with more realistic pipe elbows, tees, valves, dampers, and duct rectangular/round transition/hopper geometry. Add or extend standard DB for pipe OD/schedule and duct/fitting sizing rules.
- known facts/evidence: pps/web/src/three/GeometryFactory.tsx currently renders elbow/tee/transition as spheres and valve/damper as boxes. Backend pps/api/app/specs/repository.py already has an in-memory pipe spec list for OD/wall thickness. Backend geometry_factory.py returns simplified params.
- constraints: No new dependencies unless necessary. Keep Scene Document contract explicit and frontend/backend synchronized. Preserve existing export/build behavior where feasible.
- unknowns/open questions: Exact Korean/industry catalogue dimensions are not supplied, so use existing DB plus common parametric defaults and keep extension points explicit.
- likely codebase touchpoints: pps/api/app/specs/repository.py, pps/api/app/engine/geometry_factory.py, pps/api/app/parsing/*, packages/shared/src/scene.ts, pps/web/src/three/GeometryFactory.tsx, tests.
- scope note: This is the Autopilot activation prompt plus current repo evidence, not a guaranteed full prior conversation transcript.
