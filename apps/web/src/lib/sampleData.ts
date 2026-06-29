import type { DesignMode } from "@flowcad/shared";

export type TableRow = Record<string, string | number>;

// User input schema: assembly order + connectivity + key dimensions.
// The backend computes position/orientation from connection and direction data.
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

export const ELBOW_DIRECTIONS: { value: string; label: string }[] = [
  { value: "", label: "기본(수평)" },
  { value: "up", label: "상(+Z)" },
  { value: "down", label: "하(-Z)" },
  { value: "n", label: "북(+Y)" },
  { value: "s", label: "남(-Y)" },
  { value: "e", label: "동(+X)" },
  { value: "w", label: "서(-X)" },
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
  { seq: 1, system_type: "duct", part_type: "rect_straight", spec: "GI", W: 500, H: 300, L: 1500, length: 1500, connect_to_seq: "", connect_port: "start", note: "시작 덕트" },
  { seq: 2, system_type: "duct", part_type: "rect_elbow", spec: "GI", W: 500, H: 300, angle: 90, R: 500, connect_to_seq: 1, connect_port: "end", note: "90도 전환" },
  { seq: 3, system_type: "duct", part_type: "rect_straight", spec: "GI", W: 500, H: 300, L: 1200, length: 1200, connect_to_seq: 2, connect_port: "out", note: "연장" },
  { seq: 4, system_type: "duct", part_type: "rect_to_round", spec: "GI", W: 500, H: 300, toD: 350, L: 500, length: 500, connect_to_seq: 3, connect_port: "end", note: "원형 변환" },
  { seq: 5, system_type: "duct", part_type: "round_straight", spec: "GI", D: 350, L: 1800, length: 1800, connect_to_seq: 4, connect_port: "end", note: "원형 직관" },
];

export function sampleRowsFor(mode: DesignMode): TableRow[] {
  return mode === "pipe"
    ? structuredClone(SAMPLE_PIPE_ROWS)
    : structuredClone(SAMPLE_DUCT_ROWS);
}

export function columnsFor(mode: DesignMode): string[] {
  return mode === "pipe" ? PIPE_COLUMNS : DUCT_COLUMNS;
}
