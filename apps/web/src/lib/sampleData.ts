import type { DesignMode } from "@flowcad/shared";

export type TableRow = Record<string, string | number>;

// Plan_v2 `user_input` schema: the user supplies only assembly order +
// connectivity + key dimensions. The backend assembly engine computes every
// position/orientation from `connect_to_seq` / `connect_port` + `angle`.
export const ASSEMBLY_COLUMNS = [
  "seq", "system_type", "part_type", "spec",
  "size_a", "size_b", "length", "angle",
  "connect_to_seq", "connect_port", "note",
];

export const PIPE_COLUMNS = ASSEMBLY_COLUMNS;
export const DUCT_COLUMNS = ASSEMBLY_COLUMNS;

export const SAMPLE_PIPE_ROWS: TableRow[] = [
  { seq: 1, system_type: "pipe", part_type: "straight", spec: "SCH40", size_a: 100, size_b: "", length: 3000, angle: "", connect_to_seq: "", connect_port: "start", note: "시작 배관" },
  { seq: 2, system_type: "pipe", part_type: "elbow", spec: "SCH40", size_a: "", size_b: "", length: "", angle: 90, connect_to_seq: 1, connect_port: "end", note: "90도 전환" },
  { seq: 3, system_type: "pipe", part_type: "straight", spec: "SCH40", size_a: 100, size_b: "", length: 2000, angle: "", connect_to_seq: 2, connect_port: "out", note: "연장" },
  { seq: 4, system_type: "pipe", part_type: "tee", spec: "SCH40", size_a: 100, size_b: "", length: "", angle: "", connect_to_seq: 3, connect_port: "end", note: "분기" },
  { seq: 5, system_type: "pipe", part_type: "straight", spec: "SCH40", size_a: 100, size_b: "", length: 1500, angle: "", connect_to_seq: 4, connect_port: "out", note: "본관 연장" },
  { seq: 6, system_type: "pipe", part_type: "straight", spec: "SCH40", size_a: 100, size_b: "", length: 1000, angle: "", connect_to_seq: 4, connect_port: "branch", note: "분기관" },
];

export const SAMPLE_DUCT_ROWS: TableRow[] = [
  { seq: 1, system_type: "duct", part_type: "straight", spec: "GI", size_a: 500, size_b: 300, length: 1500, angle: "", connect_to_seq: "", connect_port: "start", note: "시작 덕트" },
  { seq: 2, system_type: "duct", part_type: "elbow", spec: "GI", size_a: "", size_b: "", length: "", angle: 90, connect_to_seq: 1, connect_port: "end", note: "90도 전환" },
  { seq: 3, system_type: "duct", part_type: "straight", spec: "GI", size_a: 500, size_b: 300, length: 1200, angle: "", connect_to_seq: 2, connect_port: "out", note: "연장" },
  { seq: 4, system_type: "duct", part_type: "transition", spec: "GI", size_a: 350, size_b: "", length: 500, angle: "", connect_to_seq: 3, connect_port: "end", note: "원형 변환관" },
  { seq: 5, system_type: "duct", part_type: "straight", spec: "GI", size_a: 350, size_b: "", length: 1800, angle: "", connect_to_seq: 4, connect_port: "end", note: "원형 직관" },
];

export function sampleRowsFor(mode: DesignMode): TableRow[] {
  return mode === "pipe"
    ? structuredClone(SAMPLE_PIPE_ROWS)
    : structuredClone(SAMPLE_DUCT_ROWS);
}

export function columnsFor(mode: DesignMode): string[] {
  return mode === "pipe" ? PIPE_COLUMNS : DUCT_COLUMNS;
}
