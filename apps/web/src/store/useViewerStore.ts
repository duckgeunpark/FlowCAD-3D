import { create } from "zustand";
import type {
  DesignMode,
  Diagnostic,
  DiagnosticLevel,
  ElementParams,
  JointPort,
  SceneDocument,
  SceneElement,
} from "@flowcad/shared";
import { generateScene } from "@/lib/api";
import { sampleRowsFor, type TableRow } from "@/lib/sampleData";

export type ViewMode = "true_scale" | "iso";
export type LabelMode = "auto" | "all" | "joints" | "none";

export interface SelectedJointContext {
  jointId: string;
  jointNo: string;
  role: string;
  parentSeq: string | number;
  elementId: string;
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
    const context = selectedJointId ? selectedJointContextFor(get().scene, selectedJointId) : null;
    set({ selectedJointId, selectedJointContext: context, selectedId: null });
  },
  hover: (hoveredId) => set({ hoveredId }),
  hoverJoint: (hoveredJointId) => set({ hoveredJointId }),

  addCatalogFitting: (fittingId, values, opts) => {
    const { rows, selectedJointContext } = get();
    const context = opts ? null : selectedJointContext;

    const newSeq = nextSeq(rows);
    const row: TableRow = {
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

    set({
      mode: "duct",
      rows: [...rows, row],
      selectedJointId: null,
      selectedJointContext: null,
      error: null,
    });
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

function selectedJointContextFor(
  scene: SceneDocument | null,
  jointId: string,
): SelectedJointContext | null {
  if (!scene) return null;
  const source = findJoint(scene, jointId);
  if (!source || !source.joint.open) return null;
  const parentSeq = seqOf(source.element);
  if (parentSeq == null) return null;
  return {
    jointId,
    jointNo: source.joint.no,
    role: source.joint.role,
    parentSeq,
    elementId: source.element.id,
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

function seqFromElementId(id: string): string | null {
  const match = /^A(.+)$/.exec(id);
  return match ? match[1] : null;
}

function seqOf(element: SceneElement): string | number | null {
  return seqFromElementId(element.id) ?? element.userData.seq ?? null;
}

function nextSeq(rows: TableRow[]): number {
  let max = 0;
  for (const r of rows) {
    const n = Number(r.seq);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max + 1;
}
