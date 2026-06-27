import { create } from "zustand";
import type {
  BomRow,
  ComponentKind,
  DesignMode,
  ElementParams,
  JointPort,
  SceneDocument,
  SceneElement,
} from "@flowcad/shared";

export type ViewMode = "true_scale" | "iso";
export type LabelMode = "auto" | "all" | "joints" | "none";
export type AddFromJointKind = "straight" | "elbow" | "tee" | "valve" | "damper" | "reducer";
type Vec3 = [number, number, number];

interface ViewerState {
  mode: DesignMode;
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
  setScene: (scene: SceneDocument | null) => void;
  select: (id: string | null) => void;
  selectJoint: (id: string | null) => void;
  hover: (id: string | null) => void;
  hoverJoint: (id: string | null) => void;
  addFromJoint: (kind: AddFromJointKind) => void;
  rotateFitting: (id: string, deltaDeg: number) => void;
  setSearch: (term: string) => void;
  setViewMode: (vm: ViewMode) => void;
  setLabelMode: (mode: LabelMode) => void;
  setError: (msg: string | null) => void;
  setLoading: (v: boolean) => void;
}

export const useViewerStore = create<ViewerState>((set, get) => ({
  mode: "pipe",
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
  setScene: (scene) => set({ scene, selectedId: null, selectedJointId: null, hoveredId: null, hoveredJointId: null }),
  select: (selectedId) => set({ selectedId, selectedJointId: null }),
  selectJoint: (selectedJointId) => set({ selectedJointId, selectedId: null }),
  hover: (hoveredId) => set({ hoveredId }),
  hoverJoint: (hoveredJointId) => set({ hoveredJointId }),
  addFromJoint: (kind) => {
    const { scene, selectedJointId, mode } = get();
    if (!scene || !selectedJointId) return;
    const source = findJoint(scene, selectedJointId);
    if (!source || !source.joint.open) return;

    const created = createElementFromJoint(scene, source.element, source.joint, kind, mode);
    const elements = scene.elements.map((element) => ({
      ...element,
      joints: element.joints.map((joint) =>
        joint.id === source.joint.id ? { ...joint, open: false } : joint,
      ),
    }));
    const bom = [...scene.bom, bomRowFor(created)];
    set({
      scene: { ...scene, elements: [...elements, created], bom },
      selectedId: created.id,
      selectedJointId: null,
    });
  },
  rotateFitting: (id, deltaDeg) => {
    const { scene } = get();
    if (!scene) return;
    const elements = scene.elements.map((element) =>
      element.id === id ? rotateElementFitting(element, deltaDeg) : element,
    );
    set({ scene: { ...scene, elements } });
  },
  setSearch: (searchTerm) => set({ searchTerm }),
  setViewMode: (viewMode) => set({ viewMode }),
  setLabelMode: (labelMode) => set({ labelMode }),
  setError: (error) => set({ error }),
  setLoading: (loading) => set({ loading }),
}));

/**
 * Visibility/emphasis rule for an element given the current search term.
 * Implements plan 짠3.2: non-matching elements fade to 20% opacity.
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

function findJoint(scene: SceneDocument, jointId: string): { element: SceneElement; joint: JointPort } | null {
  for (const element of scene.elements) {
    const joint = element.joints.find((candidate) => candidate.id === jointId);
    if (joint) return { element, joint };
  }
  return null;
}

function createElementFromJoint(
  scene: SceneDocument,
  sourceElement: SceneElement,
  sourceJoint: JointPort,
  addKind: AddFromJointKind,
  mode: DesignMode,
): SceneElement {
  const localNo = nextLocalNumber(scene);
  const id = `LOCAL-${localNo.toString().padStart(3, "0")}`;
  const itemNo = id;
  const dir = normalize(sourceJoint.direction);
  const start = sourceJoint.position;
  const radius = sourceElement.params.radius ?? 57.15;
  const width = sourceElement.params.width ?? radius * 2;
  const height = sourceElement.params.height ?? radius * 2;
  const baseUserData = {
    seq: (scene.elements.length + 1).toString(),
    itemNo,
    connect_to_seq: sourceElement.userData.seq ?? sourceElement.userData.itemNo ?? "",
    connect_port: sourceJoint.role ?? "out",
    jointNo: sourceJoint.no,
    fittingNo: "",
    drawingNo: sourceElement.userData.drawingNo ?? "",
    spec: sourceElement.userData.spec ?? "LOCAL",
  };

  if (addKind === "straight") {
    const end = add(start, scale(dir, 1000));
    const kind: ComponentKind = mode === "duct" || sourceElement.kind === "duct_segment" ? "duct_segment" : "pipe_segment";
    const params: ElementParams = kind === "duct_segment" && sourceElement.params.width != null
      ? { start, end, width, height, direction: dir }
      : { start, end, radius, direction: dir };
    const joints = [
      connectedJoint(id, sourceJoint, "start", start, dir),
      openJoint(id, `sw-local-${localNo.toString().padStart(3, "0")}`, "end", end, dir),
    ];
    return makeElement(id, itemNo, kind, params, colorFor(kind), { ...baseUserData, length_mm: "1000" }, joints);
  }

  if (addKind === "elbow") {
    const bendRadius = Math.max(sourceElement.params.bendRadius ?? radius * 3, radius * 2);
    const out = perpendicular(dir);
    const center = add(start, scale(dir, bendRadius));
    const outPoint = add(center, scale(out, bendRadius));
    const params: ElementParams = sourceElement.params.width != null
      ? { position: center, radius, width, height, inDirection: dir, outDirection: out, bendRadius, direction: out, rollDeg: 0 }
      : { position: center, radius, inDirection: dir, outDirection: out, bendRadius, direction: out, rollDeg: 0 };
    const joints = [
      connectedJoint(id, sourceJoint, "in", start, scale(dir, -1)),
      openJoint(id, `sw-local-${localNo.toString().padStart(3, "0")}`, "out", outPoint, out),
    ];
    return makeElement(id, itemNo, "elbow", params, colorFor("elbow"), baseUserData, joints);
  }

  if (addKind === "tee") {
    const runLength = Math.max(radius * 5, 400);
    const branchLength = Math.max(radius * 4, 300);
    const branch = perpendicular(dir);
    const center = add(start, scale(dir, runLength / 2));
    const outPoint = add(center, scale(dir, runLength / 2));
    const branchPoint = add(center, scale(branch, branchLength));
    const params: ElementParams = sourceElement.params.width != null
      ? { position: center, radius, width, height, direction: dir, mainDirection: dir, branchDirection: branch, runLength, branchLength, rollDeg: 0 }
      : { position: center, radius, direction: dir, mainDirection: dir, branchDirection: branch, runLength, branchLength, rollDeg: 0 };
    const joints = [
      connectedJoint(id, sourceJoint, "in", start, scale(dir, -1)),
      openJoint(id, `sw-local-${localNo.toString().padStart(3, "0")}`, "out", outPoint, dir),
      openJoint(id, `sw-local-${localNo.toString().padStart(3, "0")}b`, "branch", branchPoint, branch),
    ];
    return makeElement(id, itemNo, "tee", params, colorFor("tee"), baseUserData, joints);
  }

  if (addKind === "reducer") {
    const length = Math.max(radius * 2, 150);
    const end = add(start, scale(dir, length));
    const isRound = sourceElement.params.width == null;
    const params: ElementParams = isRound
      ? { start, end, direction: dir, fromShape: "round", fromRadius: radius, toShape: "round", toRadius: radius * 0.75 }
      : { start, end, direction: dir, fromShape: "rectangular", fromWidth: width, fromHeight: height, toShape: "rectangular", toWidth: width * 0.75, toHeight: height * 0.75 };
    const joints = [
      connectedJoint(id, sourceJoint, "in", start, scale(dir, -1)),
      openJoint(id, `sw-local-${localNo.toString().padStart(3, "0")}`, "out", end, dir),
    ];
    return makeElement(id, itemNo, "transition", params, colorFor("transition"), baseUserData, joints);
  }

  const isDamper = addKind === "damper";
  const bodyLength = isDamper ? Math.max(radius * 3, 300) : Math.max(radius * 4, 250);
  const flangeThickness = Math.max(radius * 0.28, 18);
  const half = isDamper ? bodyLength / 2 : bodyLength / 2 + flangeThickness / 2;
  const center = add(start, scale(dir, half));
  const end = add(center, scale(dir, half));
  const kind: ComponentKind = isDamper ? "damper" : "valve";
  const params: ElementParams = isDamper
    ? { position: center, radius, width, height, direction: dir, bodyLength, bladeThickness: Math.max(Math.min(radius * 0.08, 30), 8), rollDeg: 0 }
    : { position: center, radius, direction: dir, bodyLength, flangeRadius: radius * 1.25, flangeThickness, handleRadius: radius * 1.35, rollDeg: 0 };
  const joints = [
    connectedJoint(id, sourceJoint, "in", start, scale(dir, -1)),
    openJoint(id, `sw-local-${localNo.toString().padStart(3, "0")}`, "out", end, dir),
  ];
  return makeElement(id, itemNo, kind, params, colorFor(kind), baseUserData, joints);
}

function makeElement(
  id: string,
  itemNo: string,
  kind: ComponentKind,
  params: ElementParams,
  color: string,
  userData: Record<string, string>,
  joints: JointPort[],
): SceneElement {
  return { id, itemNo, kind, params, color, userData, joints };
}

function connectedJoint(id: string, source: JointPort, role: string, position: Vec3, direction: Vec3): JointPort {
  return { id: `${id}-${role}`, no: source.no, role, position, direction: normalize(direction), open: false };
}

function openJoint(id: string, no: string, role: string, position: Vec3, direction: Vec3): JointPort {
  return { id: `${id}-${role}`, no, role, position, direction: normalize(direction), open: true };
}

function bomRowFor(element: SceneElement): BomRow {
  return {
    elementId: element.id,
    itemNo: element.itemNo,
    jointNo: element.userData.jointNo ?? "",
    jointNos: element.joints.map((joint) => joint.no).join(", "),
    fittingNo: element.userData.fittingNo ?? "",
    drawingNo: element.userData.drawingNo ?? "",
    description: descriptionFor(element.kind),
    spec: element.userData.spec ?? "",
    lengthMm: Number(element.userData.length_mm ?? 0),
  };
}

function rotateElementFitting(element: SceneElement, deltaDeg: number): SceneElement {
  if (!["elbow", "tee", "valve", "damper"].includes(element.kind)) return element;

  const snap = element.params.width != null || element.params.height != null;
  const delta = snap ? Math.sign(deltaDeg || 1) * 90 : deltaDeg;
  const nextRoll = normalizeAngle((element.params.rollDeg ?? 0) + delta, snap);
  const params: ElementParams = { ...element.params, rollDeg: nextRoll };
  let joints = element.joints;

  if (element.kind === "tee") {
    const axis = normalize(params.mainDirection ?? params.direction ?? [1, 0, 0]);
    const currentBranch = normalize(params.branchDirection ?? perpendicular(axis));
    const branch = rotateAroundAxis(currentBranch, axis, delta);
    params.branchDirection = branch;
    joints = element.joints.map((joint) =>
      joint.role === "branch" && params.position
        ? {
            ...joint,
            position: add(params.position, scale(branch, params.branchLength ?? Math.max((params.radius ?? 50) * 4, 300))),
            direction: branch,
          }
        : joint,
    );
  } else if (element.kind === "elbow") {
    const axis = normalize(params.inDirection ?? params.direction ?? [1, 0, 0]);
    const out = rotateAroundAxis(normalize(params.outDirection ?? perpendicular(axis)), axis, delta);
    params.outDirection = out;
    params.direction = out;
    joints = element.joints.map((joint) =>
      joint.role === "out" && params.position
        ? {
            ...joint,
            position: add(params.position, scale(out, params.bendRadius ?? (params.radius ?? 50) * 3)),
            direction: out,
          }
        : joint,
    );
  }

  return { ...element, params, joints };
}

function normalizeAngle(degrees: number, snap: boolean): number {
  const value = snap ? Math.round(degrees / 90) * 90 : degrees;
  return ((value % 360) + 360) % 360;
}

function nextLocalNumber(scene: SceneDocument): number {
  const nums = scene.elements
    .map((element) => /^LOCAL-(\d+)$/.exec(element.id)?.[1])
    .filter((value): value is string => value != null)
    .map(Number);
  return (nums.length ? Math.max(...nums) : 0) + 1;
}

function colorFor(kind: ComponentKind): string {
  return {
    pipe_segment: "#9aa7b4",
    duct_segment: "#c9b377",
    elbow: "#6c8cd5",
    tee: "#5cb88a",
    valve: "#d56c6c",
    transition: "#b07cd5",
    damper: "#d59a4f",
    error_marker: "#ef4444",
  }[kind];
}

function descriptionFor(kind: ComponentKind): string {
  return {
    pipe_segment: "Pipe (straight)",
    duct_segment: "Duct (straight)",
    elbow: "Elbow",
    tee: "Tee",
    valve: "Valve",
    transition: "Transition",
    damper: "Damper",
    error_marker: "Error Marker",
  }[kind];
}

function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function scale(a: Vec3, n: number): Vec3 {
  return [a[0] * n, a[1] * n, a[2] * n];
}

function normalize(a: Vec3): Vec3 {
  const length = Math.hypot(a[0], a[1], a[2]);
  if (length <= 1e-9) return [1, 0, 0];
  return [a[0] / length, a[1] / length, a[2] / length];
}

function perpendicular(dir: Vec3): Vec3 {
  const candidate: Vec3 = Math.abs(dir[1]) < 0.9 ? [-dir[2], 0, dir[0]] : [1, 0, 0];
  return normalize(candidate);
}

function rotateAroundAxis(vector: Vec3, axis: Vec3, degrees: number): Vec3 {
  const k = normalize(axis);
  const theta = (degrees * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const cross: Vec3 = [
    k[1] * vector[2] - k[2] * vector[1],
    k[2] * vector[0] - k[0] * vector[2],
    k[0] * vector[1] - k[1] * vector[0],
  ];
  const dot = k[0] * vector[0] + k[1] * vector[1] + k[2] * vector[2];
  return normalize([
    vector[0] * cos + cross[0] * sin + k[0] * dot * (1 - cos),
    vector[1] * cos + cross[1] * sin + k[1] * dot * (1 - cos),
    vector[2] * cos + cross[2] * sin + k[2] * dot * (1 - cos),
  ]);
}
