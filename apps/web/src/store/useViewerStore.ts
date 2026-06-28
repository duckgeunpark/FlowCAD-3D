import { create } from "zustand";
import type {
  DesignMode,
  Diagnostic,
  DiagnosticLevel,
  JointPort,
  SceneDocument,
  SceneElement,
} from "@flowcad/shared";
import { generateScene } from "@/lib/api";
import { sampleRowsFor, type TableRow } from "@/lib/sampleData";

export type ViewMode = "true_scale" | "iso";
export type LabelMode = "auto" | "all" | "joints" | "none";
export type AddFromJointKind = "straight" | "elbow" | "tee" | "valve" | "damper" | "reducer";
/** Extra parameters for a part added from a 3D joint (e.g. a chosen elbow angle). */
export interface AddFromJointOptions {
  angle?: number;
}

interface ViewerState {
  mode: DesignMode;
  rows: TableRow[];
  scene: SceneDocument | null;
  selectedId: string | null;
  selectedJointId: string | null;
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
  addFromJoint: (kind: AddFromJointKind, opts?: AddFromJointOptions) => void;
  rotateFitting: (id: string, deltaDeg: number) => void;
  setSearch: (term: string) => void;
  setViewMode: (vm: ViewMode) => void;
  setLabelMode: (mode: LabelMode) => void;
  setError: (msg: string | null) => void;
  setLoading: (v: boolean) => void;
}

// part_type written into a new table row when adding from a 3D joint.
const PART_TYPE_FOR: Record<AddFromJointKind, string> = {
  straight: "straight",
  elbow: "elbow",
  tee: "tee",
  valve: "valve",
  damper: "damper",
  reducer: "reducer",
};

export const useViewerStore = create<ViewerState>((set, get) => ({
  mode: "pipe",
  rows: sampleRowsFor("pipe"),
  scene: null,
  selectedId: null,
  selectedJointId: null,
  hoveredId: null,
  hoveredJointId: null,
  searchTerm: "",
  viewMode: "true_scale",
  labelMode: "auto",
  error: null,
  loading: false,

  setMode: (mode) => set({ mode }),
  setRows: (rows) => set({ rows }),

  // Single generation path: the table is the source of truth, the backend
  // computes every position. 3D edits (add/rotate) mutate ``rows`` then call
  // this, so connected parts re-propagate automatically. Selection is preserved
  // (element ids are stable ``A{seq}``) so an open DetailPanel stays put.
  regenerate: async () => {
    const { mode, rows } = get();
    set({ loading: true, error: null });
    try {
      const scene = await generateScene(mode, rows as Record<string, unknown>[]);
      set({ scene, loading: false });
    } catch (e) {
      set({
        error: e instanceof Error ? e.message : "알 수 없는 오류",
        scene: null,
        loading: false,
      });
    }
  },

  setScene: (scene) => set({ scene, selectedId: null, selectedJointId: null, hoveredId: null, hoveredJointId: null }),
  select: (selectedId) => set({ selectedId, selectedJointId: null }),
  selectJoint: (selectedJointId) => set({ selectedJointId, selectedId: null }),
  hover: (hoveredId) => set({ hoveredId }),
  hoverJoint: (hoveredJointId) => set({ hoveredJointId }),

  addFromJoint: (kind, opts) => {
    const { scene, selectedJointId, rows, mode } = get();
    if (!scene || !selectedJointId) return;
    const source = findJoint(scene, selectedJointId);
    if (!source || !source.joint.open) return;

    const parentSeq = seqOf(source.element);
    if (parentSeq == null) return;
    const newSeq = nextSeq(rows);

    const elbowAngle = opts?.angle ?? 90;
    const row: TableRow = {
      seq: newSeq,
      system_type: mode,
      part_type: PART_TYPE_FOR[kind],
      spec: "", // blank -> inherits the connected part's spec/section
      size_a: "",
      size_b: "",
      length: kind === "straight" ? 1000 : kind === "reducer" ? 300 : "",
      angle: kind === "elbow" ? elbowAngle : "",
      connect_to_seq: parentSeq,
      connect_port: source.joint.role,
      note: "3D에서 추가",
    };

    set({ rows: [...rows, row], selectedJointId: null });
    void get()
      .regenerate()
      .then(() => set({ selectedId: `A${newSeq}` }));
  },

  rotateFitting: (id, deltaDeg) => {
    const { scene, rows } = get();
    const element = scene?.elements.find((e) => e.id === id);
    const seq = seqFromElementId(id);
    if (!element || seq == null) return;
    const idx = rows.findIndex((r) => String(r.seq) === seq);
    if (idx < 0) return;

    // Rectangular fittings snap to 90° (matches the backend roll quantisation).
    const rectangular = element.params.width != null || element.params.height != null;
    const current = Number(rows[idx].rotation ?? 0) || 0;
    let next = current + deltaDeg;
    if (rectangular) next = Math.round(next / 90) * 90;
    next = ((next % 360) + 360) % 360;

    const nextRows = rows.map((r, i) => (i === idx ? { ...r, rotation: next } : r));
    set({ rows: nextRows });
    void get().regenerate();
  },

  setSearch: (searchTerm) => set({ searchTerm }),
  setViewMode: (viewMode) => set({ viewMode }),
  setLabelMode: (labelMode) => set({ labelMode }),
  setError: (error) => set({ error }),
  setLoading: (loading) => set({ loading }),
}));

/**
 * Visibility/emphasis rule for an element given the current search term.
 * Implements plan §3.2: non-matching elements fade to 20% opacity.
 */
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

/** Group a scene's diagnostics by the input row (`seq`) they refer to. */
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

/** The highest-severity level among a list of diagnostics (null if empty). */
export function worstLevel(diags: Diagnostic[]): DiagnosticLevel | null {
  let worst: DiagnosticLevel | null = null;
  for (const d of diags) {
    if (worst === null || _LEVEL_RANK[d.level] > _LEVEL_RANK[worst]) worst = d.level;
  }
  return worst;
}

function findJoint(scene: SceneDocument, jointId: string): { element: SceneElement; joint: JointPort } | null {
  for (const element of scene.elements) {
    const joint = element.joints.find((candidate) => candidate.id === jointId);
    if (joint) return { element, joint };
  }
  return null;
}

/** Recover the input-row seq from a backend element id (``A{seq}``). */
function seqFromElementId(id: string): string | null {
  const match = /^A(.+)$/.exec(id);
  return match ? match[1] : null;
}

/** The seq an element was generated from (its id, falling back to userData). */
function seqOf(element: SceneElement): string | number | null {
  return seqFromElementId(element.id) ?? element.userData.seq ?? null;
}

/** Next free numeric seq for a new row. */
function nextSeq(rows: TableRow[]): number {
  let max = 0;
  for (const r of rows) {
    const n = Number(r.seq);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max + 1;
}
