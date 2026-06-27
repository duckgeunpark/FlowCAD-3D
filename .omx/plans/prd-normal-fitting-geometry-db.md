# PRD / Consensus Plan: Normal Fitting Geometry + Standard DB

## Requirements Summary
Implement a backward-compatible parametric fitting system where backend spec/geometry code emits richer physical parameters and the Three.js frontend renders recognizable fittings for pipes and ducts.

## RALPLAN-DR Summary
### Principles
1. Backend owns physical sizing and topology context; frontend owns mesh construction.
2. Scene Document changes must be additive/backward-compatible where possible.
3. Fittings should be recognizable at 1:1 scale even when exact catalogue geometry is unavailable.
4. Preserve no-new-dependency constraint.

### Decision Drivers
1. Visual correctness for user-facing 3D viewer.
2. Contract stability between FastAPI and React Three Fiber.
3. Testable backend sizing behavior from standard DB defaults.

### Viable Options
- Option A: Parametric Scene params + frontend meshes (chosen). Pros: minimal dependencies, fits architecture, testable. Cons: not manufacturer-exact solids.
- Option B: Generate detailed CAD mesh vertices on backend. Pros: exact mesh control. Cons: larger contract, more code, export/frontend coupling.
- Option C: Import manufacturer fitting catalog assets. Pros: high fidelity. Cons: unavailable data, licensing, scope creep.

## ADR
### Decision
Use additive parametric Scene params computed by backend and build recognizable fitting meshes in the existing frontend `GeometryFactory`.

### Drivers
Visual quality, current architecture fit, testability, no dependency additions.

### Alternatives Considered
Backend mesh generation and external catalog assets rejected for MVP scope/cost.

### Consequences
Web viewer improves immediately; CAD exporters may remain approximated unless separately enhanced. Scene contract gains optional fields.

### Follow-ups
Future work can replace seed defaults with RDB/manufacturer catalogue and improve exporters for curved fittings.

## Implementation Steps
1. Extend domain `CrossSection`/`Run` parsing to support per-node duct sections so rectangular↔round transitions are detectable without new required columns.
2. Keep `SpecRepository` pipe-only for nominal/schedule OD, wall thickness, and bend-radius lookup; derive pipe fitting defaults from `PipeSpec` in backend geometry code and keep duct sizing/defaults in `DuctInputParser`/`GeometryFactory`.
3. Update backend `GeometryFactory` to compute fitting params using adjacent node directions and section dimensions.
4. Update compiler to pass previous/next nodes to fitting factory and insert duct transition elements between changed adjacent sections.
5. Update shared TS `ElementParams` contract.
6. Replace frontend placeholder fitting renderers with parametric components.
7. Add/adjust backend tests and run build/tests.

## Acceptance Criteria
- Tests prove pipe elbow bend radius and directional params.
- Tests prove duct rectangular↔round transition generation.
- Viewer build passes with typed Scene params.
- No new dependency added.

## Verification Steps
- `apps/api/.venv/Scripts/python -m pytest apps/api/tests`
- `npm run build:web`
- Inspect changed files for Scene contract consistency.

## Risks and Mitigations
- Risk: Direction math fails for first/last fittings. Mitigation: fallback to available segment direction and defaults.
- Risk: Duct per-node sections break existing same-section rows. Mitigation: default row section inherited from first row where values are absent.
- Risk: Frontend orientation errors. Mitigation: isolate orientation helpers and compile TypeScript.

## Available-Agent-Types Roster / Staffing
- executor: implementation across backend/frontend.
- architect: review Scene contract and boundary.
- critic: testability/quality gate.
- code-reviewer: final code review.
- verifier/test-engineer: build/test verification.

## Team / Ultragoal Guidance
Single-lane implementation is sufficient; team mode not needed unless later catalog import or exporter geometry work expands scope.

## Revision 1: Contract Lock and Ownership Rules

### Exact SceneElement.params additive schema
All new fields remain flat primitives or `number[3]` lists to keep the Python/TypeScript wire contract simple.

Common:
- `position: [x,y,z]`
- `radius: number` for round OD/2 or visual nominal radius
- `direction?: [x,y,z]` primary normalized segment direction when one segment is enough
- `inDirection?: [x,y,z]` normalized vector from previous node into fitting
- `outDirection?: [x,y,z]` normalized vector from fitting to next node

Pipe elbow:
- `radius`: pipe OD/2
- `bendRadius`: centerline bend radius from `PipeSpec.bend_radius`
- `inDirection`, `outDirection`

Pipe tee:
- `radius`: pipe OD/2
- `mainDirection`: normalized primary run direction
- `branchDirection`: normalized branch/visual branch direction
- `runLength`: visual main-cylinder length
- `branchLength`: visual branch-cylinder length

Valve:
- `radius`: pipe OD/2
- `direction`: normalized pipe axis
- `bodyLength`, `flangeRadius`, `flangeThickness`, `handleRadius`

Duct damper:
- `width`, `height` for rectangular body or `radius` for round body
- `direction`, `bodyLength`, `bladeThickness`

Duct transition:
- `start`, `end`
- `fromShape`, `toShape`: "rectangular" | "round"
- `fromWidth`, `fromHeight`, `fromRadius`
- `toWidth`, `toHeight`, `toRadius`

### Ownership boundary
- Backend owns spec lookup, normalized directions, section-change detection, and all numeric sizing defaults.
- Frontend owns conversion from engineering coordinates to Three coordinates and mesh construction/orientation from backend-provided directions.
- Exporters may keep approximate primitive fallback in this pass; web Scene fidelity is the MVP acceptance target.

### Spec repository boundary
- `SpecRepository` remains pipe-size lookup oriented.
- Pipe fitting defaults are derived from `PipeSpec` or small constants in geometry factory.
- Duct section inference/defaults stay in `DuctInputParser`/`GeometryFactory`, not in pipe `SpecRepository`, until a true duct catalogue is added.

### Plan changelog
- Applied Architect feedback: exact flat params schema added, backend/frontend ownership stated, duct defaults separated from pipe spec DB.


## Revision 2: Conflict Removal
- Removed the earlier contradictory instruction to put duct damper defaults into `SpecRepository`.
- Locked `SpecRepository` as pipe-only for this pass.
- Added explicit requirement to widen both backend and shared TS Scene param types for flat string/number/vector values.
