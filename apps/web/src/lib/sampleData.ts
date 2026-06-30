import type { DesignMode, SceneElement } from "@flowcad/shared";

export type TableRow = Record<string, string | number>;

// ----------------------------------------------------------------------------
// PIPE input schema (unchanged): assembly order + connectivity + key dimensions.
// The backend AssemblyResolver computes position/orientation from connectivity.
// ----------------------------------------------------------------------------
export const ASSEMBLY_COLUMNS = [
  "seq", "system_type", "part_type", "spec",
  "size_a", "size_b", "length", "angle", "bend_to",
  "offset_direction", "rotation",
  "W", "H", "D", "L", "R",
  "toW", "toH", "toD",
  "branchW", "branchH", "branchD",
  "offset", "X", "NL", "gores",
  "connect_to_seq", "connect_port", "note",
];

export const PIPE_COLUMNS = ASSEMBLY_COLUMNS;

// ----------------------------------------------------------------------------
// DUCT input schema (v2: duct_3d_sheet_v2 / Duct3D_Input). Absolute centerline
// geometry per element row, an element-id topology graph, and standard codes.
// The curated base columns are always editable; any extra columns present in an
// uploaded sheet are appended so the full 107-column sheet round-trips losslessly.
// ----------------------------------------------------------------------------
export const V2_DUCT_BASE_COLUMNS = [
  "row_type", "seq", "line_id", "system_id", "service",
  "element_id", "from_element_id", "to_element_id", "branch_to_element_id",
  "element_type", "family_code", "shape_code", "material_code", "spec_code",
  "origin_x", "origin_y", "origin_z", "end_x", "end_y", "end_z",
  "dir_x", "dir_y", "dir_z", "orientation_code",
  "width", "height", "diameter", "branch_width", "branch_height", "branch_diameter",
  "fitting_type", "angle_deg", "part_subtype",
  "bom_item_no", "part_name_ko", "part_name_en", "note",
];

/** Duct columns to render: curated base + any extra keys present in the rows. */
export function v2DuctColumns(rows: TableRow[]): string[] {
  const seen = new Set(V2_DUCT_BASE_COLUMNS);
  const extras: string[] = [];
  for (const r of rows) {
    for (const k of Object.keys(r)) {
      if (!seen.has(k)) {
        seen.add(k);
        extras.push(k);
      }
    }
  }
  return [...V2_DUCT_BASE_COLUMNS, ...extras];
}

export const ELBOW_DIRECTIONS: { value: string; label: string }[] = [
  { value: "", label: "기본(수평)" },
  { value: "up", label: "상(+Z)" },
  { value: "down", label: "하(-Z)" },
  { value: "n", label: "북(+Y)" },
  { value: "s", label: "남(-Y)" },
  { value: "e", label: "동(+X)" },
  { value: "w", label: "서(-X)" },
];

export const SAMPLE_PIPE_ROWS: TableRow[] = [
  { seq: 1, system_type: "pipe", part_type: "straight", spec: "SCH40", size_a: 100, size_b: "", length: 3000, angle: "", connect_to_seq: "", connect_port: "start", note: "시작 배관" },
  { seq: 2, system_type: "pipe", part_type: "elbow", spec: "SCH40", size_a: "", size_b: "", length: "", angle: 90, connect_to_seq: 1, connect_port: "end", note: "90도 전환" },
  { seq: 3, system_type: "pipe", part_type: "straight", spec: "SCH40", size_a: 100, size_b: "", length: 2000, angle: "", connect_to_seq: 2, connect_port: "out", note: "연장" },
  { seq: 4, system_type: "pipe", part_type: "tee", spec: "SCH40", size_a: 100, size_b: "", length: "", angle: "", connect_to_seq: 3, connect_port: "end", note: "분기" },
  { seq: 5, system_type: "pipe", part_type: "straight", spec: "SCH40", size_a: 100, size_b: "", length: 1500, angle: "", connect_to_seq: 4, connect_port: "out", note: "본관 연장" },
  { seq: 6, system_type: "pipe", part_type: "straight", spec: "SCH40", size_a: 100, size_b: "", length: 1000, angle: "", connect_to_seq: 4, connect_port: "branch", note: "분기관" },
];

// v2 duct sample: a 500x300 main run (straight → 90° elbow → tee) with a 300x200
// branch that reduces (rect→round) to a Ø300 round duct.
export const SAMPLE_DUCT_ROWS: TableRow[] = [
  {
    row_type: "DATA", seq: 10, line_id: "L-001", system_id: "SA-01", service: "SA",
    element_id: "E0001", to_element_id: "E0002", element_type: "STRAIGHT",
    family_code: "STRAIGHT_RECT", shape_code: "RECT", material_code: "GI", spec_code: "STD-A",
    origin_x: 0, origin_y: 0, origin_z: 3000, end_x: 2000, end_y: 0, end_z: 3000,
    dir_x: 1, dir_y: 0, dir_z: 0, orientation_code: "XP_XP",
    width: 500, height: 300, fitting_type: "NONE",
    bom_item_no: "001", part_name_ko: "직관", part_name_en: "Straight Duct", note: "시작 덕트",
  },
  {
    row_type: "DATA", seq: 20, line_id: "L-001", system_id: "SA-01", service: "SA",
    element_id: "E0002", from_element_id: "E0001", to_element_id: "E0003", element_type: "FITTING",
    family_code: "ELBOW_RECT_90", shape_code: "RECT", material_code: "GI", spec_code: "STD-A",
    origin_x: 2000, origin_y: 0, origin_z: 3000, dir_x: 0, dir_y: 1, dir_z: 0,
    orientation_code: "XP_YP", width: 500, height: 300, fitting_type: "ELBOW", angle_deg: 90,
    bom_item_no: "002", part_name_ko: "엘보 90", part_name_en: "Elbow 90", note: "90도 전환",
  },
  {
    row_type: "DATA", seq: 30, line_id: "L-001", system_id: "SA-01", service: "SA",
    element_id: "E0003", from_element_id: "E0002", to_element_id: "E0004",
    branch_to_element_id: "E0010", element_type: "FITTING",
    family_code: "TEE_RECT_BRANCH", shape_code: "RECT", material_code: "GI", spec_code: "STD-A",
    origin_x: 2000, origin_y: 1125, origin_z: 3000, dir_x: 0, dir_y: 1, dir_z: 0,
    orientation_code: "YP_YP_BRANCH_XP", width: 500, height: 300,
    branch_width: 300, branch_height: 200, fitting_type: "TEE",
    bom_item_no: "003", part_name_ko: "티", part_name_en: "Tee", note: "분기",
  },
  {
    row_type: "DATA", seq: 40, line_id: "L-001", system_id: "SA-01", service: "SA",
    element_id: "E0004", from_element_id: "E0003", element_type: "STRAIGHT",
    family_code: "STRAIGHT_RECT", shape_code: "RECT", material_code: "GI", spec_code: "STD-A",
    origin_x: 2000, origin_y: 1125, origin_z: 3000, end_x: 2000, end_y: 3500, end_z: 3000,
    dir_x: 0, dir_y: 1, dir_z: 0, orientation_code: "YP_YP",
    width: 500, height: 300, fitting_type: "NONE",
    bom_item_no: "004", part_name_ko: "직관", part_name_en: "Straight Duct", note: "본관 연장",
  },
  {
    row_type: "DATA", seq: 50, line_id: "L-002", system_id: "SA-01", service: "SA",
    element_id: "E0010", from_element_id: "E0003", to_element_id: "E0011", element_type: "STRAIGHT",
    family_code: "STRAIGHT_RECT", shape_code: "RECT", material_code: "GI", spec_code: "STD-A",
    origin_x: 2000, origin_y: 1125, origin_z: 3000, end_x: 3500, end_y: 1125, end_z: 3000,
    dir_x: 1, dir_y: 0, dir_z: 0, orientation_code: "XP_XP",
    width: 300, height: 200, fitting_type: "NONE",
    bom_item_no: "005", part_name_ko: "분기 직관", part_name_en: "Branch Duct", note: "분기관",
  },
  {
    row_type: "DATA", seq: 60, line_id: "L-002", system_id: "SA-01", service: "SA",
    element_id: "E0011", from_element_id: "E0010", to_element_id: "E0012", element_type: "FITTING",
    family_code: "TRANSITION_RECT_ROUND", shape_code: "RECT", material_code: "GI", spec_code: "STD-A",
    origin_x: 3500, origin_y: 1125, origin_z: 3000, end_x: 3900, end_y: 1125, end_z: 3000,
    dir_x: 1, dir_y: 0, dir_z: 0, orientation_code: "XP_XP",
    width: 300, height: 200, outlet_diameter: 300, fitting_type: "TRANSITION",
    bom_item_no: "006", part_name_ko: "각원 변환", part_name_en: "Rect-Round Transition", note: "원형 변환",
  },
  {
    row_type: "DATA", seq: 70, line_id: "L-002", system_id: "SA-01", service: "SA",
    element_id: "E0012", from_element_id: "E0011", element_type: "STRAIGHT",
    family_code: "STRAIGHT_ROUND", shape_code: "ROUND", material_code: "GI", spec_code: "STD-A",
    origin_x: 3900, origin_y: 1125, origin_z: 3000, end_x: 5400, end_y: 1125, end_z: 3000,
    dir_x: 1, dir_y: 0, dir_z: 0, orientation_code: "XP_XP",
    diameter: 300, fitting_type: "NONE",
    bom_item_no: "007", part_name_ko: "원형 직관", part_name_en: "Round Duct", note: "원형 직관",
  },
];

export function sampleRowsFor(mode: DesignMode): TableRow[] {
  return mode === "pipe"
    ? structuredClone(SAMPLE_PIPE_ROWS)
    : structuredClone(SAMPLE_DUCT_ROWS);
}

export function columnsFor(mode: DesignMode, rows: TableRow[] = []): string[] {
  return mode === "pipe" ? PIPE_COLUMNS : v2DuctColumns(rows);
}

// ----------------------------------------------------------------------------
// Element identity helpers. A scene element's id is `A{seq}` in PIPE (assembly)
// mode and the `element_id` value in DUCT (v2) mode — centralized here so the
// table, viewer store and detail panel all map rows ↔ elements consistently.
// ----------------------------------------------------------------------------
export function rowElementId(row: TableRow, mode: DesignMode): string {
  if (mode === "pipe") {
    const seq = String(row.seq ?? "").trim();
    return seq ? `A${seq}` : "";
  }
  return String(row.element_id ?? "").trim();
}

/** Key used to match diagnostics (Diagnostic.seq) to a table row. */
export function rowDiagKey(row: TableRow, mode: DesignMode): string {
  return mode === "pipe"
    ? String(row.seq ?? "").trim()
    : String(row.element_id ?? "").trim();
}

/** Find the row index backing a given scene element, or -1. */
export function rowIndexForElement(
  rows: TableRow[],
  element: Pick<SceneElement, "id">,
  mode: DesignMode,
): number {
  return rows.findIndex((r) => rowElementId(r, mode) === element.id);
}
