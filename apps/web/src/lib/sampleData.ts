import type { DesignMode } from "@flowcad/shared";

export type TableRow = Record<string, string | number>;

export const PIPE_COLUMNS = [
  "seq", "item_no", "item_type", "connect_to_seq", "connect_port", "joint_nos", "direction", "length",
  "nominal", "schedule", "material", "rotation", "drawing_no", "fitting_no",
];

export const DUCT_COLUMNS = [
  "seq", "item_no", "item_type", "connect_to_seq", "connect_port", "joint_nos", "direction", "length",
  "shape", "width", "height", "diameter", "material", "rotation", "drawing_no", "fitting_no",
];

export const SAMPLE_PIPE_ROWS: TableRow[] = [
  { seq: 1, item_no: "item 1", item_type: "pipe", connect_to_seq: "", connect_port: "start", joint_nos: "sw001, sw002", direction: "E", length: 2000, nominal: "100A", schedule: "Sch40", material: "Carbon Steel", rotation: 0, drawing_no: "DWG-01", fitting_no: "" },
  { seq: 2, item_no: "item 2", item_type: "elbow", connect_to_seq: 1, connect_port: "end", joint_nos: "sw002, sw003", direction: "N", length: "", nominal: "", schedule: "", material: "", rotation: 0, drawing_no: "DWG-01", fitting_no: "FIT-01" },
  { seq: 3, item_no: "item 3", item_type: "pipe", connect_to_seq: 2, connect_port: "out", joint_nos: "sw003, sw004", direction: "N", length: 1500, nominal: "", schedule: "", material: "", rotation: 0, drawing_no: "DWG-01", fitting_no: "" },
  { seq: 4, item_no: "item 4", item_type: "valve", connect_to_seq: 3, connect_port: "end", joint_nos: "sw004, sw005", direction: "N", length: "", nominal: "", schedule: "", material: "", rotation: 45, drawing_no: "DWG-01", fitting_no: "FIT-02" },
  { seq: 5, item_no: "item 5", item_type: "pipe", connect_to_seq: 4, connect_port: "out", joint_nos: "sw005, sw006", direction: "N", length: 1000, nominal: "", schedule: "", material: "", rotation: 0, drawing_no: "DWG-01", fitting_no: "" },
  { seq: 6, item_no: "item 6", item_type: "tee", connect_to_seq: 5, connect_port: "end", joint_nos: "sw006, sw007, sw008", direction: "E", length: "", nominal: "", schedule: "", material: "", rotation: 90, drawing_no: "DWG-01", fitting_no: "FIT-04" },
];

export const SAMPLE_DUCT_ROWS: TableRow[] = [
  { seq: 1, item_no: "item 1", item_type: "duct", connect_to_seq: "", connect_port: "start", joint_nos: "sw001, sw002", direction: "E", length: 2000, shape: "rectangular", width: 400, height: 300, diameter: "", material: "Galvanized", rotation: 0, drawing_no: "DWG-D1", fitting_no: "" },
  { seq: 2, item_no: "item 2", item_type: "damper", connect_to_seq: 1, connect_port: "end", joint_nos: "sw002, sw003", direction: "E", length: "", shape: "", width: "", height: "", diameter: "", material: "", rotation: 90, drawing_no: "DWG-D1", fitting_no: "VD-01" },
  { seq: 3, item_no: "item 3", item_type: "duct", connect_to_seq: 2, connect_port: "out", joint_nos: "sw003, sw004", direction: "E", length: 1000, shape: "", width: "", height: "", diameter: "", material: "", rotation: 0, drawing_no: "DWG-D1", fitting_no: "" },
  { seq: 4, item_no: "item 4", item_type: "transition", connect_to_seq: 3, connect_port: "end", joint_nos: "sw004, sw005", direction: "E", length: 500, shape: "rectangular", width: 400, height: 300, diameter: 350, material: "", rotation: 0, drawing_no: "DWG-D1", fitting_no: "TR-01" },
  { seq: 5, item_no: "item 5", item_type: "duct", connect_to_seq: 4, connect_port: "out", joint_nos: "sw005, sw006", direction: "E", length: 1800, shape: "round", width: "", height: "", diameter: 350, material: "", rotation: 0, drawing_no: "DWG-D1", fitting_no: "" },
  { seq: 6, item_no: "item 6", item_type: "elbow", connect_to_seq: 5, connect_port: "end", joint_nos: "sw006, sw007", direction: "N", length: "", shape: "", width: "", height: "", diameter: "", material: "", rotation: 0, drawing_no: "DWG-D1", fitting_no: "" },
];

export function sampleRowsFor(mode: DesignMode): TableRow[] {
  return mode === "pipe"
    ? structuredClone(SAMPLE_PIPE_ROWS)
    : structuredClone(SAMPLE_DUCT_ROWS);
}

export function columnsFor(mode: DesignMode): string[] {
  return mode === "pipe" ? PIPE_COLUMNS : DUCT_COLUMNS;
}

