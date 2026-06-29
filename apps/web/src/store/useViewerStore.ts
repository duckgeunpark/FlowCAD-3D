import { create } from "zustand";
import {
  getFitting,
  type DesignMode,
  type Diagnostic,
  type DiagnosticLevel,
  type ElementParams,
  type JointPort,
  type SceneDocument,
  type SceneElement,
} from "@flowcad/shared";
import { generateScene } from "@/lib/api";
import {
  rowElementId,
  rowIndexForElement,
  sampleRowsFor,
  type TableRow,
} from "@/lib/sampleData";

export type ViewMode = "true_scale" | "iso";
export type LabelMode = "auto" | "all" | "joints" | "none";

export interface SelectedJointContext {
  jointId: string;
  jointNo: string;
  role: string;
  parentSeq: string | number;
  /** Stable id of the element owning the selected joint (element_id or A{seq}). */
  parentId: string;
  elementId: string;
  position: [number, number, number];
  direction: [number, number, number];
  dimensions: Record<string, number>;
}

interface ViewerState {
  mode: DesignMode;
  rows: TableRow[];
  scene: SceneDocument | null;
  selectedId: string | null;
  selectedJointId: string | null;
  selectedJointContext: SelectedJointContext | null;
  hoveredId: string | null;
  hoveredJointId: string | null;
  searchTerm: string;
  viewMode: ViewMode;
  labelMode: LabelMode;
  error: string | null;
  loading: boolean;

  setMode: (mode: DesignMode) => void;
  setRows: (rows: TableRow[]) => void;
  regenerate: () => Promise<void>;
  setScene: (scene: SceneDocument | null) => void;
  select: (id: string | null) => void;
  selectJoint: (id: string | null) => void;
  hover: (id: string | null) => void;
  hoverJoint: (id: string | null) => void;
  addCatalogFitting: (
    fittingId: string,
    values: Record<string, number | string>,
    opts?: { connectToSeq?: string | number; connectPort?: string },
  ) => void;
  rotateFitting: (id: string, deltaDeg: number) => void;
  setSearch: (term: string) => void;
  setViewMode: (vm: ViewMode) => void;
  setLabelMode: (mode: LabelMode) => void;
  setError: (msg: string | null) => void;
  setLoading: (v: boolean) => void;
}

export const useViewerStore = create<ViewerState>((set, get) => ({
  mode: "pipe",
  rows: sampleRowsFor("pipe"),
  scene: null,
  selectedId: null,
  selectedJointId: null,
  selectedJointContext: null,
  hoveredId: null,
  hoveredJointId: null,
  searchTerm: "",
  viewMode: "true_scale",
  labelMode: "auto",
  error: null,
  loading: false,

  setMode: (mode) => set({ mode }),
  setRows: (rows) => set({ rows }),

  regenerate: async () => {
    const { mode, rows } = get();
    set({ loading: true, error: null });
    try {
      const scene = await generateScene(mode, rows as Record<string, unknown>[]);
      set({ scene, loading: false });
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : "3D 생성 실패",
        scene: null,
        loading: false,
      });
    }
  },

  setScene: (scene) => set({
    scene,
    selectedId: null,
    selectedJointId: null,
    selectedJointContext: null,
    hoveredId: null,
    hoveredJointId: null,
  }),
  select: (selectedId) => set({
    selectedId,
    selectedJointId: null,
    selectedJointContext: null,
  }),
  selectJoint: (selectedJointId) => {
    const { scene, mode } = get();
    const context = selectedJointId ? selectedJointContextFor(scene, selectedJointId, mode) : null;
    set({ selectedJointId, selectedJointContext: context, selectedId: null });
  },
  hover: (hoveredId) => set({ hoveredId }),
  hoverJoint: (hoveredJointId) => set({ hoveredJointId }),

  addCatalogFitting: (fittingId, values, opts) => {
    const { rows, mode, selectedJointContext } = get();
    const context = opts ? null : selectedJointContext;

    const row =
      mode === "pipe"
        ? buildAssemblyRow(fittingId, values, rows, context, opts)
        : buildV2Row(fittingId, values, rows, context);

    // v2 chaining: also point the parent element at the new one so the engine
    // shares their joint and trims the parent back to the new fitting's face.
    let nextRows = [...rows, row];
    if (mode !== "pipe" && context) {
      nextRows = nextRows.map((r) =>
        rowElementId(r, mode) === context.parentId
          ? linkParentToChild(r, context.role, String(row.element_id))
          : r,
      );
    }

    const newId = rowElementId(row, mode);
    set({
      mode,
      rows: nextRows,
      selectedJointId: null,
      selectedJointContext: null,
      error: null,
    });
    void get()
      .regenerate()
      .then(() => set({ selectedId: newId }));
  },

  rotateFitting: (id, deltaDeg) => {
    const { scene, rows, mode } = get();
    const element = scene?.elements.find((e) => e.id === id);
    if (!element) return;
    const idx = rowIndexForElement(rows, element, mode);
    if (idx < 0) return;

    const rectangular = element.params.width != null || element.params.height != null;
    const column = mode === "pipe" ? "rotation" : "rotation_deg";
    const current = Number(rows[idx][column] ?? 0) || 0;
    let next = current + deltaDeg;
    if (rectangular) next = Math.round(next / 90) * 90;
    next = ((next % 360) + 360) % 360;

    const nextRows = rows.map((r, i) => (i === idx ? { ...r, [column]: next } : r));
    set({ rows: nextRows });
    void get().regenerate();
  },

  setSearch: (searchTerm) => set({ searchTerm }),
  setViewMode: (viewMode) => set({ viewMode }),
  setLabelMode: (labelMode) => set({ labelMode }),
  setError: (error) => set({ error }),
  setLoading: (loading) => set({ loading }),
}));

export function matchesSearch(
  userData: Record<string, string>,
  term: string,
): boolean {
  if (!term.trim()) return true;
  const needle = term.trim().toLowerCase();
  return Object.values(userData).some((v) =>
    v.toLowerCase().includes(needle),
  );
}

const _LEVEL_RANK: Record<DiagnosticLevel, number> = { info: 0, warning: 1, error: 2 };

export function diagnosticsBySeq(
  scene: SceneDocument | null,
): Map<string, Diagnostic[]> {
  const map = new Map<string, Diagnostic[]>();
  if (!scene?.diagnostics) return map;
  for (const d of scene.diagnostics) {
    if (!d.seq) continue;
    const list = map.get(d.seq);
    if (list) list.push(d);
    else map.set(d.seq, [d]);
  }
  return map;
}

export function worstLevel(diags: Diagnostic[]): DiagnosticLevel | null {
  let worst: DiagnosticLevel | null = null;
  for (const d of diags) {
    if (worst === null || _LEVEL_RANK[d.level] > _LEVEL_RANK[worst]) worst = d.level;
  }
  return worst;
}

// ----------------------------------------------------------------------------
// Joint context
// ----------------------------------------------------------------------------
function selectedJointContextFor(
  scene: SceneDocument | null,
  jointId: string,
  mode: DesignMode,
): SelectedJointContext | null {
  if (!scene) return null;
  const source = findJoint(scene, jointId);
  if (!source || !source.joint.open) return null;
  const parentId = source.element.id;
  const parentSeq = mode === "pipe"
    ? parentId.replace(/^A/, "")
    : source.element.userData.elementId ?? parentId;
  return {
    jointId,
    jointNo: source.joint.no,
    role: source.joint.role,
    parentSeq,
    parentId,
    elementId: source.element.id,
    position: source.joint.position,
    direction: source.joint.direction,
    dimensions: dimensionsForJoint(source.element, source.joint),
  };
}

function findJoint(scene: SceneDocument, jointId: string): { element: SceneElement; joint: JointPort } | null {
  for (const element of scene.elements) {
    const joint = element.joints.find((candidate) => candidate.id === jointId);
    if (joint) return { element, joint };
  }
  return null;
}

function dimensionsForJoint(element: SceneElement, joint: JointPort): Record<string, number> {
  const p = element.params;
  const transitionDims = transitionDimensionsForRole(p, joint.role);
  if (transitionDims) return transitionDims;
  if (p.width != null && p.height != null) {
    return { W: Math.round(p.width), H: Math.round(p.height) };
  }
  if (p.radius != null) {
    return { D: Math.round(p.radius * 2) };
  }
  return {};
}

function transitionDimensionsForRole(
  p: ElementParams,
  role: string,
): Record<string, number> | null {
  if (p.fromShape == null && p.toShape == null) return null;
  const inlet = role === "in" || role === "start";
  const shape = inlet ? p.fromShape : p.toShape;
  const width = inlet ? p.fromWidth : p.toWidth;
  const height = inlet ? p.fromHeight : p.toHeight;
  const radius = inlet ? p.fromRadius : p.toRadius;
  if (shape === "rectangular" && width != null && height != null) {
    return { W: Math.round(width), H: Math.round(height) };
  }
  if (shape === "round" && radius != null) {
    return { D: Math.round(radius * 2) };
  }
  return null;
}

// ----------------------------------------------------------------------------
// Catalog-fitting row builders
// ----------------------------------------------------------------------------
function buildAssemblyRow(
  fittingId: string,
  values: Record<string, number | string>,
  rows: TableRow[],
  context: SelectedJointContext | null,
  opts?: { connectToSeq?: string | number; connectPort?: string },
): TableRow {
  const newSeq = nextSeq(rows);
  return {
    seq: newSeq,
    system_type: "duct",
    part_type: fittingId,
    spec: "",
    connect_to_seq: opts?.connectToSeq ?? context?.parentSeq ?? "",
    connect_port: opts?.connectPort ?? context?.role ?? "start",
    note: context ? "표준피팅" : "표준피팅 시작",
    ...(context?.dimensions ?? {}),
    ...values,
  };
}

const _CATEGORY_FITTING_TYPE: Record<string, string> = {
  straight: "NONE",
  elbow: "ELBOW",
  tee: "TEE",
  wye: "WYE",
  lateral: "WYE",
  transition: "TRANSITION",
  offset: "OFFSET",
  cap: "CAP",
  accessory: "CAP",
};

const _DIR_TO_AXIS: Record<string, string> = {
  e: "XP", w: "XN", n: "YP", s: "YN", up: "ZP", down: "ZN",
};

function buildV2Row(
  fittingId: string,
  values: Record<string, number | string>,
  rows: TableRow[],
  context: SelectedJointContext | null,
): TableRow {
  const fitting = getFitting(fittingId);
  const category = fitting?.category ?? "straight";
  const shape = (fitting?.inlet ?? "rect") === "round" ? "ROUND" : "RECT";
  const fittingType = _CATEGORY_FITTING_TYPE[category] ?? "NONE";
  const elementType = category === "straight" ? "STRAIGHT" : "FITTING";

  const newId = nextElementId(rows);
  const origin = context?.position ?? [0, 0, 3000];
  const dir = context?.direction ?? [1, 0, 0];
  const inAxis = axisToken(dir);
  const bendTo = String(values.bend_to ?? "");
  const outAxis = _DIR_TO_AXIS[bendTo] ?? perpAxis(inAxis);

  const orientation =
    category === "elbow"
      ? `${inAxis}_${outAxis}`
      : fittingType === "TEE" || fittingType === "WYE"
        ? `${inAxis}_${inAxis}_BRANCH_${perpAxis(inAxis)}`
        : `${inAxis}_${inAxis}`;

  const length = Number(values.L ?? 1000) || 1000;
  const row: TableRow = {
    row_type: "DATA",
    seq: nextSeq(rows) * 10,
    element_id: newId,
    from_element_id: context?.elementId ? String(context.elementId) : "",
    element_type: elementType,
    family_code: fittingId.toUpperCase(),
    shape_code: shape,
    material_code: "GI",
    origin_x: origin[0],
    origin_y: origin[1],
    origin_z: origin[2],
    dir_x: dir[0],
    dir_y: dir[1],
    dir_z: dir[2],
    orientation_code: orientation,
    fitting_type: fittingType,
    part_name_en: fitting?.nameEn ?? fittingId,
    part_name_ko: fitting?.nameKo ?? "",
    note: context ? "표준피팅" : "표준피팅 시작",
  };
  if (elementType === "STRAIGHT") {
    row.end_x = origin[0] + dir[0] * length;
    row.end_y = origin[1] + dir[1] * length;
    row.end_z = origin[2] + dir[2] * length;
    row.centerline_length = length;
  }
  // Map catalog dims (W/H/D/branch*) to v2 columns.
  const dims = { ...(context?.dimensions ?? {}), ...values };
  if (dims.W != null) row.width = dims.W;
  if (dims.H != null) row.height = dims.H;
  if (dims.D != null) row.diameter = dims.D;
  if (dims.toD != null) row.outlet_diameter = dims.toD;
  if (dims.branchW != null) row.branch_width = dims.branchW;
  if (dims.branchH != null) row.branch_height = dims.branchH;
  if (dims.branchD != null) row.branch_diameter = dims.branchD;
  if (dims.angle != null) row.angle_deg = dims.angle;
  return row;
}

function linkParentToChild(parent: TableRow, role: string, childId: string): TableRow {
  const key = role === "branch" || role.startsWith("branch")
    ? "branch_to_element_id"
    : "to_element_id";
  return { ...parent, [key]: childId };
}

function axisToken(dir: [number, number, number]): string {
  const [x, y, z] = dir;
  const ax = Math.abs(x), ay = Math.abs(y), az = Math.abs(z);
  if (ax >= ay && ax >= az) return x >= 0 ? "XP" : "XN";
  if (ay >= az) return y >= 0 ? "YP" : "YN";
  return z >= 0 ? "ZP" : "ZN";
}

function perpAxis(axis: string): string {
  // A sensible in-plan perpendicular for a branch/elbow default.
  if (axis === "XP") return "YP";
  if (axis === "XN") return "YN";
  if (axis === "YP") return "XN";
  if (axis === "YN") return "XP";
  return "XP"; // vertical run -> branch east
}

function nextElementId(rows: TableRow[]): string {
  let max = 0;
  for (const r of rows) {
    const m = /^E(\d+)$/.exec(String(r.element_id ?? ""));
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `E${String(max + 1).padStart(4, "0")}`;
}

function nextSeq(rows: TableRow[]): number {
  let max = 0;
  for (const r of rows) {
    const n = Number(r.seq);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max + 1;
}
