/**
 * The Scene Document contract — the single source of truth shared between the
 * FastAPI backend and the Three.js frontend. These types MUST stay in sync with
 * `apps/api/app/domain/scene.py` and the kinds in `app/domain/enums.py`.
 */

export type DesignMode = "pipe" | "duct";

export type ExportFormat = "dxf" | "pdf" | "ifc" | "step";

/** Map of format -> whether its backend library is installed on the server. */
export type ExportAvailability = Record<ExportFormat, boolean>;

export type ComponentKind =
  | "pipe_segment"
  | "elbow"
  | "tee"
  | "valve"
  | "duct_segment"
  | "transition"
  | "damper"
  | "error_marker"
  // v2 duct schema additions
  | "wye"
  | "cross"
  | "cap"
  | "tap"
  | "splitter";

/** One branch arm of a multi-port fitting (tee/wye/cross/splitter). */
export interface BranchSpec {
  direction: [number, number, number];
  length: number;
  /** Rectangular branch dimensions (mm); omit for round branches. */
  width?: number;
  height?: number;
  /** Round branch radius (mm); omit for rectangular branches. */
  radius?: number;
  role?: string;
}

/** Kind-specific geometry parameters (see backend GeometryFactory). */
export interface ElementParams {
  start?: [number, number, number];
  end?: [number, number, number];
  position?: [number, number, number];
  direction?: [number, number, number];
  inDirection?: [number, number, number];
  outDirection?: [number, number, number];
  mainDirection?: [number, number, number];
  branchDirection?: [number, number, number];
  radius?: number;
  bendRadius?: number;
  elbowStyle?: string;
  gores?: number;
  width?: number;
  height?: number;
  offset?: number;
  offsetDirection?: [number, number, number];
  offsetLength?: number;
  offsetStyle?: string;
  straightStub?: number;
  runLength?: number;
  branchLength?: number;
  bodyLength?: number;
  flangeRadius?: number;
  flangeThickness?: number;
  handleRadius?: number;
  bladeThickness?: number;
  rollDeg?: number;
  fromShape?: "rectangular" | "round" | "oval" | "flat_oval";
  toShape?: "rectangular" | "round" | "oval" | "flat_oval";
  fromWidth?: number;
  fromHeight?: number;
  fromRadius?: number;
  toWidth?: number;
  toHeight?: number;
  toRadius?: number;
  // v2 duct additions
  shape?: "rectangular" | "round" | "oval" | "flat_oval";
  majorAxis?: number;
  minorAxis?: number;
  /** Multi-branch fittings (tee/wye/cross/splitter) emit their arms here. */
  branches?: BranchSpec[];
  branchAngleDeg?: number;
}

export interface JointPort {
  id: string;
  no: string;
  position: [number, number, number];
  direction: [number, number, number];
  role: string;
  open: boolean;
}

export interface SceneElement {
  id: string;
  kind: ComponentKind;
  params: ElementParams;
  color: string;
  userData: Record<string, string>;
  itemNo: string;
  joints: JointPort[];
}

export interface BomRow {
  elementId: string;
  itemNo: string;
  jointNo: string;
  jointNos: string;
  fittingNo: string;
  drawingNo: string;
  description: string;
  spec: string;
  lengthMm: number;
}

export interface Vec3DTO {
  x: number;
  y: number;
  z: number;
}

export type DiagnosticLevel = "error" | "warning" | "info";

/**
 * A structured validation message tied to an input row (`seq`). Lets the table
 * highlight the offending row and the UI list the reason + recommended fix —
 * distinct from the 3D `error_marker` element which only the viewer renders.
 */
export interface Diagnostic {
  level: DiagnosticLevel;
  code: string;
  seq: string;
  message: string;
  suggestion: string;
  position: [number, number, number] | null;
}

export interface SceneDocument {
  units: string;
  boundsMin: Vec3DTO;
  boundsMax: Vec3DTO;
  elements: SceneElement[];
  bom: BomRow[];
  diagnostics: Diagnostic[];
}

export interface GenerateRequest {
  mode: DesignMode;
  rows: Record<string, unknown>[];
}
