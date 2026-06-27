import type { DesignMode } from "@flowcad/shared";

export type TableRow = Record<string, string | number>;

export const PIPE_COLUMNS = [
  "run_id", "seq", "x", "y", "z", "nominal", "schedule",
  "fitting", "drawing_no", "fitting_no", "joint_no",
];

export const DUCT_COLUMNS = [
  "run_id", "seq", "x", "y", "z", "shape", "width", "height", "diameter",
  "fitting", "drawing_no", "fitting_no", "joint_no",
];

export const SAMPLE_PIPE_ROWS: TableRow[] = [
  { run_id: "R1", seq: 1, x: 0, y: 0, z: 0, nominal: "100A", schedule: "Sch40", fitting: "", drawing_no: "DWG-01", fitting_no: "", joint_no: "JNT-001" },
  { run_id: "R1", seq: 2, x: 2000, y: 0, z: 0, nominal: "100A", schedule: "Sch40", fitting: "elbow", drawing_no: "DWG-01", fitting_no: "FIT-01", joint_no: "JNT-002" },
  { run_id: "R1", seq: 3, x: 2000, y: 0, z: 1500, nominal: "100A", schedule: "Sch40", fitting: "valve", drawing_no: "DWG-01", fitting_no: "FIT-02", joint_no: "JNT-003" },
  { run_id: "R1", seq: 4, x: 2000, y: 2500, z: 1500, nominal: "100A", schedule: "Sch40", fitting: "elbow", drawing_no: "DWG-01", fitting_no: "FIT-03", joint_no: "JNT-004" },
  { run_id: "R1", seq: 5, x: 4500, y: 2500, z: 1500, nominal: "100A", schedule: "Sch40", fitting: "tee", drawing_no: "DWG-01", fitting_no: "FIT-04", joint_no: "JNT-005" },
];

export const SAMPLE_DUCT_ROWS: TableRow[] = [
  { run_id: "D1", seq: 1, x: 0, y: 0, z: 2500, shape: "rectangular", width: 400, height: 300, diameter: "", fitting: "", drawing_no: "DWG-D1", fitting_no: "", joint_no: "DJ-001" },
  { run_id: "D1", seq: 2, x: 3000, y: 0, z: 2500, shape: "rectangular", width: 400, height: 300, diameter: "", fitting: "damper", drawing_no: "DWG-D1", fitting_no: "VD-01", joint_no: "DJ-002" },
  { run_id: "D1", seq: 3, x: 3000, y: 1800, z: 2500, shape: "round", width: "", height: "", diameter: 350, fitting: "", drawing_no: "DWG-D1", fitting_no: "", joint_no: "DJ-003" },
  { run_id: "D1", seq: 4, x: 3000, y: 3400, z: 2500, shape: "round", width: "", height: "", diameter: 350, fitting: "elbow", drawing_no: "DWG-D1", fitting_no: "", joint_no: "DJ-004" },
];

export function sampleRowsFor(mode: DesignMode): TableRow[] {
  return mode === "pipe"
    ? structuredClone(SAMPLE_PIPE_ROWS)
    : structuredClone(SAMPLE_DUCT_ROWS);
}

export function columnsFor(mode: DesignMode): string[] {
  return mode === "pipe" ? PIPE_COLUMNS : DUCT_COLUMNS;
}
