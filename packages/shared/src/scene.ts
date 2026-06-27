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
  | "damper";

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
  width?: number;
  height?: number;
  runLength?: number;
  branchLength?: number;
  bodyLength?: number;
  flangeRadius?: number;
  flangeThickness?: number;
  handleRadius?: number;
  bladeThickness?: number;
  rollDeg?: number;
  fromShape?: "rectangular" | "round";
  toShape?: "rectangular" | "round";
  fromWidth?: number;
  fromHeight?: number;
  fromRadius?: number;
  toWidth?: number;
  toHeight?: number;
  toRadius?: number;
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

export interface SceneDocument {
  units: string;
  boundsMin: Vec3DTO;
  boundsMax: Vec3DTO;
  elements: SceneElement[];
  bom: BomRow[];
}

export interface GenerateRequest {
  mode: DesignMode;
  rows: Record<string, unknown>[];
}
