"use client";

import { useMemo } from "react";
import {
  BufferGeometry,
  CatmullRomCurve3,
  DoubleSide,
  Float32BufferAttribute,
  Matrix4,
  Quaternion,
  Vector3,
} from "three";
import type { Side } from "three";
import type { BranchSpec, ElementParams, SceneElement } from "@flowcad/shared";
import { toThree } from "./coords";

export interface ElementVisualProps {
  element: SceneElement;
  opacity: number;
  selected: boolean;
  hovered: boolean;
  onSelect: (id: string) => void;
  onHover: (id: string | null) => void;
}

const UP = new Vector3(0, 1, 0);
const X_AXIS = new Vector3(1, 0, 0);
const Z_AXIS = new Vector3(0, 0, 1);
const OFFSET_PART_TYPES = new Set([
  "rect_straight_offset",
  "rect_radius_offset",
  "round_mitered_offset",
  "round_radius_offset",
]);

function partType(element: SceneElement): string {
  return String(element.userData.partType ?? "").toLowerCase();
}

function isOffsetElement(element: SceneElement): boolean {
  return OFFSET_PART_TYPES.has(partType(element));
}

/**
 * Orientation for a rectangular section whose local axes are X=width, Y=length,
 * Z=height. Unlike ``setFromUnitVectors`` (which leaves the roll about the run
 * axis unpinned, so width/height appear swapped depending on heading), this pins
 * **height to vertical (world up) and width to horizontal**, so a W×H duct reads
 * the same — and stays continuous through elbows — regardless of run direction.
 */
function rectQuaternion(dir: Vector3): Quaternion {
  const length = dir.clone().normalize();
  let height: Vector3;
  if (Math.abs(length.dot(UP)) > 0.99) {
    // Vertical run: height can't be world-up; fall back to a horizontal axis.
    height = new Vector3(0, 0, 1);
  } else {
    height = UP.clone().sub(length.clone().multiplyScalar(UP.dot(length))).normalize();
  }
  const width = new Vector3().crossVectors(length, height).normalize();
  // Re-orthogonalize height so (width, length, height) is a right-handed basis.
  height = new Vector3().crossVectors(width, length).normalize();
  return new Quaternion().setFromRotationMatrix(
    new Matrix4().makeBasis(width, length, height),
  );
}

/** Position + orientation for a tube/box spanning start -> end. */
function useSpan(start: [number, number, number], end: [number, number, number]) {
  return useMemo(() => {
    const a = toThree(start);
    const b = toThree(end);
    const dir = new Vector3().subVectors(b, a);
    const length = dir.length();
    const mid = new Vector3().addVectors(a, b).multiplyScalar(0.5);
    const unit = dir.clone().normalize();
    const quat = new Quaternion().setFromUnitVectors(UP, unit);
    // Rectangular sections need a roll-pinned frame (height up, width level).
    const rectQuat = rectQuaternion(dir);
    return { length, mid, quat, rectQuat };
  }, [start, end]);
}

/**
 * Frontend half of the Factory pattern. Mirrors the backend GeometryFactory:
 * one branch per ComponentKind, driven entirely by the Scene Document contract.
 */
export function ElementMesh(props: ElementVisualProps) {
  const { element } = props;
  switch (element.kind) {
    case "pipe_segment":
      return <TubeSegment {...props} />;
    case "duct_segment":
      return element.params.width != null ? (
        <RectDuctSegment {...props} />
      ) : (
        <TubeSegment {...props} />
      );
    case "elbow":
      return partType(element) === "round_elbow" ? (
        <GoredRoundElbow {...props} />
      ) : element.params.width != null || element.params.height != null ? (
        <DuctElbow {...props} />
      ) : (
        <PipeElbow {...props} />
      );
    case "tee":
    case "wye":
    case "cross":
    case "tap":
    case "splitter":
      return <BranchFitting {...props} />;
    case "cap":
      return element.params.width != null ? (
        <RectDuctSegment {...props} />
      ) : (
        <TubeSegment {...props} />
      );
    case "transition":
      return isOffsetElement(element) ? <OffsetFitting {...props} /> : <TransitionFitting {...props} />;
    case "valve":
      return <ValveFitting {...props} />;
    case "damper":
      return <DamperFitting {...props} />;
    case "error_marker":
      return <ErrorMarkerMesh {...props} />;
    default:
      return null;
  }
}

function ErrorMarkerMesh(p: ElementVisualProps) {
  const { params } = p.element;
  const pos = useMemo(() => toThree(params.position ?? [0, 0, 0]), [params.position]);
  return (
    <group position={pos} {...interactionHandlers(p)} userData={p.element.userData}>
      {/* 붉은색 점멸 느낌표 형상 기둥 */}
      <mesh position={[0, 150, 0]}>
        <cylinderGeometry args={[25, 10, 200, 16]} />
        <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.6} roughness={0.3} />
      </mesh>
      {/* ❗ 느낌표 하단 점 */}
      <mesh position={[0, 20, 0]}>
        <sphereGeometry args={[22, 16, 16]} />
        <meshStandardMaterial color="#ef4444" emissive="#ef4444" emissiveIntensity={0.6} roughness={0.3} />
      </mesh>
      {/* 반투명 붉은색 경고 박스 영역 */}
      <mesh>
        <boxGeometry args={[300, 300, 300]} />
        <meshStandardMaterial color="#ef4444" transparent opacity={0.3} wireframe />
      </mesh>
    </group>
  );
}

function useMaterialColor(p: ElementVisualProps): {
  color: string;
  emissive: string;
  emissiveIntensity: number;
} {
  const { element, selected, hovered } = p;
  if (selected)
    return { color: "#ffd24a", emissive: "#ffd24a", emissiveIntensity: 0.5 };
  if (hovered)
    return { color: element.color, emissive: "#ffffff", emissiveIntensity: 0.25 };
  return { color: element.color, emissive: "#000000", emissiveIntensity: 0 };
}

function interactionHandlers(p: ElementVisualProps) {
  return {
    onClick: (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      p.onSelect(p.element.id);
    },
    onPointerOver: (e: { stopPropagation: () => void }) => {
      e.stopPropagation();
      p.onHover(p.element.id);
    },
    onPointerOut: () => p.onHover(null),
  };
}

function StandardMaterial(
  p: ElementVisualProps,
  metalness = 0.4,
  roughness = 0.5,
  side?: Side,
) {
  const mat = useMaterialColor(p);
  // Only enable alpha blending when actually translucent. Leaving `transparent`
  // on for fully-opaque meshes makes three.js skip/disorder depth writes, which
  // causes faces to flicker and drop out while orbiting.
  const isTransparent = p.opacity < 1;
  return (
    <meshStandardMaterial
      color={mat.color}
      emissive={mat.emissive}
      emissiveIntensity={mat.emissiveIntensity}
      transparent={isTransparent}
      opacity={p.opacity}
      depthWrite={!isTransparent}
      metalness={metalness}
      roughness={roughness}
      side={side}
    />
  );
}

function TubeSegment(p: ElementVisualProps) {
  const { params } = p.element;
  const span = useSpan(params.start!, params.end!);
  const radius = params.radius ?? 25;
  return (
    <mesh
      position={span.mid}
      quaternion={span.quat}
      {...interactionHandlers(p)}
      userData={p.element.userData}
    >
      <cylinderGeometry args={[radius, radius, span.length, 24]} />
      {StandardMaterial(p, 0.4, 0.5)}
    </mesh>
  );
}

function RectDuctSegment(p: ElementVisualProps) {
  const { params } = p.element;
  const span = useSpan(params.start!, params.end!);
  return (
    <mesh
      position={span.mid}
      quaternion={span.rectQuat}
      {...interactionHandlers(p)}
      userData={p.element.userData}
    >
      <boxGeometry args={[params.width ?? 200, span.length, params.height ?? 200]} />
      {StandardMaterial(p, 0.2, 0.6)}
    </mesh>
  );
}

function PipeElbow(p: ElementVisualProps) {
  const { params } = p.element;
  const pos = useMemo(() => toThree(params.position!), [params.position]);
  const radius = params.radius ?? 25;
  const bendRadius = params.bendRadius ?? radius * 3;
  const curve = useMemo(() => {
    const inDir = toThreeDirection(params.inDirection ?? [-1, 0, 0]);
    const outDir = toThreeDirection(params.outDirection ?? [0, 0, 1]);
    return new CatmullRomCurve3([
      inDir.clone().multiplyScalar(-bendRadius),
      new Vector3(0, 0, 0),
      outDir.clone().multiplyScalar(bendRadius),
    ]);
  }, [params.inDirection, params.outDirection, bendRadius]);
  return (
    <mesh position={pos} {...interactionHandlers(p)} userData={p.element.userData}>
      <tubeGeometry args={[curve, 32, radius, 18, false]} />
      {StandardMaterial(p, 0.45, 0.42)}
    </mesh>
  );
}

function GoredRoundElbow(p: ElementVisualProps) {
  const pos = useMemo(() => toThree(p.element.params.position!), [p.element.params.position]);
  const geometry = useMemo(() => buildGoredRoundElbowGeometry(p.element), [p.element]);
  return (
    <mesh position={pos} geometry={geometry} {...interactionHandlers(p)} userData={p.element.userData}>
      {StandardMaterial(p, 0.45, 0.42, DoubleSide)}
    </mesh>
  );
}

/**
 * General multi-port fitting renderer driven by the v2 ``params.branches[]``
 * contract. Serves tee/wye (a through-run + branch arms) and tap/cross/splitter
 * (an inlet stub + branch arms), with each arm rendered in its own cross-section
 * (rectangular box or round tube). Falls back to the legacy single
 * ``branchDirection`` when no ``branches[]`` array is present.
 */
function BranchFitting(p: ElementVisualProps) {
  const { params, kind } = p.element;
  const pos = useMemo(() => toThree(params.position ?? [0, 0, 0]), [params.position]);
  const main = useMemo(
    () => toThreeDirection(params.mainDirection ?? params.direction ?? [1, 0, 0]),
    [params.mainDirection, params.direction],
  );
  const inDir = useMemo(
    () => toThreeDirection(params.inDirection ?? params.mainDirection ?? params.direction ?? [1, 0, 0]),
    [params.inDirection, params.mainDirection, params.direction],
  );
  const radius = params.radius ?? 150;
  const runLength = params.runLength ?? radius * 5;
  const branchLength = params.branchLength ?? radius * 4;
  const round = params.shape === "round" || (params.width == null && params.height == null);
  const through = params.through ?? (kind === "tee" || kind === "wye");
  const branches = params.branches ?? legacyBranches(params, branchLength);

  return (
    <group position={pos} {...interactionHandlers(p)} userData={p.element.userData}>
      {through ? (
        <LocalDuct
          p={p}
          start={main.clone().multiplyScalar(-runLength / 2)}
          end={main.clone().multiplyScalar(runLength / 2)}
          round={round}
          radius={radius}
          width={params.width}
          height={params.height}
        />
      ) : (
        <LocalDuct
          p={p}
          start={inDir.clone().multiplyScalar(-branchLength / 2)}
          end={new Vector3(0, 0, 0)}
          round={round}
          radius={radius}
          width={params.width}
          height={params.height}
        />
      )}
      {branches.map((b, i) => {
        const dir = toThreeDirection(b.direction);
        const bRound = b.radius != null;
        return (
          <LocalDuct
            key={i}
            p={p}
            start={new Vector3(0, 0, 0)}
            end={dir.clone().multiplyScalar(b.length ?? branchLength)}
            round={bRound}
            radius={b.radius ?? radius * 0.82}
            width={b.width ?? params.width}
            height={b.height ?? params.height}
          />
        );
      })}
    </group>
  );
}

function legacyBranches(params: ElementParams, branchLength: number): BranchSpec[] {
  if (!params.branchDirection) return [];
  // The legacy round-tee path emits only `{radius}` (no `shape`/`width`), so gate
  // the branch on the same round test the main run uses — otherwise a round tee's
  // arm would drop its radius and fall back to a rectangular box.
  const round = params.shape === "round" || (params.width == null && params.height == null);
  return [
    {
      direction: params.branchDirection,
      length: branchLength,
      width: params.width,
      height: params.height,
      radius: round ? params.radius : undefined,
    },
  ];
}

/** A single rectangular (box) or round (cylinder) duct run between two local points. */
function LocalDuct({
  p,
  start,
  end,
  round,
  radius,
  width,
  height,
}: {
  p: ElementVisualProps;
  start: Vector3;
  end: Vector3;
  round: boolean;
  radius: number;
  width?: number;
  height?: number;
}) {
  const { length, mid, quat, rectQuat } = useMemo(() => {
    const dir = new Vector3().subVectors(end, start);
    return {
      length: Math.max(dir.length(), 1),
      mid: new Vector3().addVectors(start, end).multiplyScalar(0.5),
      quat: new Quaternion().setFromUnitVectors(UP, dir.clone().normalize()),
      rectQuat: rectQuaternion(dir),
    };
  }, [start, end]);
  if (round) {
    return (
      <mesh position={mid} quaternion={quat}>
        <cylinderGeometry args={[radius, radius, length, 24]} />
        {StandardMaterial(p, 0.3, 0.55)}
      </mesh>
    );
  }
  return (
    <mesh position={mid} quaternion={rectQuat}>
      <boxGeometry args={[width ?? 200, length, height ?? 200]} />
      {StandardMaterial(p, 0.2, 0.6)}
    </mesh>
  );
}

function ValveFitting(p: ElementVisualProps) {
  const { params } = p.element;
  const pos = useMemo(() => toThree(params.position!), [params.position]);
  const dir = useMemo(() => toThreeDirection(params.direction ?? [1, 0, 0]), [params.direction]);
  const radius = params.radius ?? 30;
  const bodyLength = params.bodyLength ?? radius * 4;
  const flangeRadius = params.flangeRadius ?? radius * 1.25;
  const flangeThickness = params.flangeThickness ?? radius * 0.28;
  const handleRadius = params.handleRadius ?? radius * 1.35;
  const side = useMemo(() => perpendicularTo(dir), [dir]);
  const rolledSide = useMemo(
    () => rotateAroundAxis(side, dir, params.rollDeg ?? 0),
    [side, dir, params.rollDeg],
  );
  return (
    <group position={pos} {...interactionHandlers(p)} userData={p.element.userData}>
      <LocalCylinder
        p={p}
        start={dir.clone().multiplyScalar(-bodyLength / 2)}
        end={dir.clone().multiplyScalar(bodyLength / 2)}
        radius={radius * 1.05}
      />
      <LocalCylinder
        p={p}
        start={dir.clone().multiplyScalar(-bodyLength / 2 - flangeThickness / 2)}
        end={dir.clone().multiplyScalar(-bodyLength / 2 + flangeThickness / 2)}
        radius={flangeRadius}
      />
      <LocalCylinder
        p={p}
        start={dir.clone().multiplyScalar(bodyLength / 2 - flangeThickness / 2)}
        end={dir.clone().multiplyScalar(bodyLength / 2 + flangeThickness / 2)}
        radius={flangeRadius}
      />
      <LocalCylinder
        p={p}
        start={new Vector3(0, radius * 0.9, 0)}
        end={new Vector3(0, radius * 2.4, 0)}
        radius={Math.max(radius * 0.12, 8)}
      />
      <LocalCylinder
        p={p}
        start={rolledSide.clone().multiplyScalar(-handleRadius).add(new Vector3(0, radius * 2.4, 0))}
        end={rolledSide.clone().multiplyScalar(handleRadius).add(new Vector3(0, radius * 2.4, 0))}
        radius={Math.max(radius * 0.10, 7)}
      />
    </group>
  );
}

function DamperFitting(p: ElementVisualProps) {
  const { params } = p.element;
  const pos = useMemo(() => toThree(params.position!), [params.position]);
  const dir = useMemo(() => toThreeDirection(params.direction ?? [1, 0, 0]), [params.direction]);
  const bodyLength = params.bodyLength ?? 300;
  const bladeThickness = params.bladeThickness ?? 12;
  const isRound = params.width == null || params.height == null;
  const radius = params.radius ?? 100;
  const width = params.width ?? radius * 2;
  const height = params.height ?? radius * 2;
  // Rectangular dampers need the roll-pinned frame (height up) so W×H reads
  // consistently; round bodies are symmetric so the simple heading is fine.
  const quat = useMemo(
    () => (isRound ? new Quaternion().setFromUnitVectors(UP, dir) : rectQuaternion(dir)),
    [dir, isRound],
  );
  const rollRad = ((params.rollDeg ?? 0) * Math.PI) / 180;
  return (
    <group position={pos} quaternion={quat} {...interactionHandlers(p)} userData={p.element.userData}>
      {isRound ? (
        <mesh>
          <cylinderGeometry args={[radius, radius, bodyLength, 32]} />
          {StandardMaterial(p, 0.25, 0.6)}
        </mesh>
      ) : (
        <mesh>
          <boxGeometry args={[width, bodyLength, height]} />
          {StandardMaterial(p, 0.25, 0.6)}
        </mesh>
      )}
      <group rotation={[0, rollRad, 0]}>
        <mesh>
          <boxGeometry args={[width * 0.92, bladeThickness, Math.max(height * 0.08, 12)]} />
          <meshStandardMaterial color="#2f3742" metalness={0.35} roughness={0.5} />
        </mesh>
        <mesh rotation={[0, 0, Math.PI / 2]}>
          <cylinderGeometry args={[Math.max(height * 0.035, 8), Math.max(height * 0.035, 8), width * 1.15, 16]} />
          <meshStandardMaterial color="#202833" metalness={0.5} roughness={0.45} />
        </mesh>
      </group>
    </group>
  );
}

function DuctElbow(p: ElementVisualProps) {
  const pos = useMemo(() => toThree(p.element.params.position!), [p.element.params.position]);
  const geometry = useMemo(() => buildDuctElbowGeometry(p.element), [p.element]);
  return (
    <mesh position={pos} geometry={geometry} {...interactionHandlers(p)} userData={p.element.userData}>
      {StandardMaterial(p, 0.22, 0.58, DoubleSide)}
    </mesh>
  );
}

function TransitionFitting(p: ElementVisualProps) {
  const geometry = useMemo(() => buildTransitionGeometry(p.element), [p.element]);
  return (
    <mesh geometry={geometry} {...interactionHandlers(p)} userData={p.element.userData}>
      {StandardMaterial(p, 0.25, 0.56, DoubleSide)}
    </mesh>
  );
}

function OffsetFitting(p: ElementVisualProps) {
  const geometry = useMemo(() => buildOffsetGeometry(p.element), [p.element]);
  return (
    <mesh geometry={geometry} {...interactionHandlers(p)} userData={p.element.userData}>
      {StandardMaterial(p, 0.25, 0.56, DoubleSide)}
    </mesh>
  );
}

function LocalCylinder({ p, start, end, radius }: { p: ElementVisualProps; start: Vector3; end: Vector3; radius: number }) {
  const { length, mid, quat } = useMemo(() => {
    const dir = new Vector3().subVectors(end, start);
    return {
      length: Math.max(dir.length(), 1),
      mid: new Vector3().addVectors(start, end).multiplyScalar(0.5),
      quat: new Quaternion().setFromUnitVectors(UP, dir.normalize()),
    };
  }, [start, end]);
  return (
    <mesh position={mid} quaternion={quat}>
      <cylinderGeometry args={[radius, radius, length, 24]} />
      {StandardMaterial(p, 0.4, 0.48)}
    </mesh>
  );
}

/**
 * Sweep a rectangular cross-section (width x height) along a list of rings,
 * each ring carrying its own center + in-plane / out-of-plane axes. Produces a
 * single watertight solid — no overlapping coplanar faces, so it does not
 * z-fight or drop faces while orbiting.
 */
function buildSweptRect(
  rings: { center: Vector3; inPlane: Vector3; outOfPlane: Vector3 }[],
  halfW: number,
  halfH: number,
): BufferGeometry {
  const vertices: number[] = [];
  const indices: number[] = [];
  for (const r of rings) {
    const corners = [
      r.center.clone().addScaledVector(r.inPlane, halfW).addScaledVector(r.outOfPlane, halfH),
      r.center.clone().addScaledVector(r.inPlane, -halfW).addScaledVector(r.outOfPlane, halfH),
      r.center.clone().addScaledVector(r.inPlane, -halfW).addScaledVector(r.outOfPlane, -halfH),
      r.center.clone().addScaledVector(r.inPlane, halfW).addScaledVector(r.outOfPlane, -halfH),
    ];
    for (const c of corners) vertices.push(c.x, c.y, c.z);
  }
  const n = rings.length;
  for (let i = 0; i < n - 1; i++) {
    const a = i * 4;
    const b = (i + 1) * 4;
    for (let k = 0; k < 4; k++) {
      const kk = (k + 1) % 4;
      indices.push(a + k, b + k, a + kk);
      indices.push(a + kk, b + k, b + kk);
    }
  }
  // End caps.
  indices.push(0, 1, 2, 0, 2, 3);
  const last = (n - 1) * 4;
  indices.push(last, last + 2, last + 1, last, last + 3, last + 2);

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function buildSweptRound(
  rings: { center: Vector3; tangent: Vector3 }[],
  radius: number,
  radialSegments = 24,
): BufferGeometry {
  const vertices: number[] = [];
  const indices: number[] = [];
  for (const r of rings) {
    const frame = sectionFrameForDirection(r.tangent);
    for (let i = 0; i < radialSegments; i++) {
      const angle = (i / radialSegments) * Math.PI * 2;
      const point = r.center.clone()
        .addScaledVector(frame.right, Math.cos(angle) * radius)
        .addScaledVector(frame.up, Math.sin(angle) * radius);
      vertices.push(point.x, point.y, point.z);
    }
  }

  for (let i = 0; i < rings.length - 1; i++) {
    const a = i * radialSegments;
    const b = (i + 1) * radialSegments;
    for (let k = 0; k < radialSegments; k++) {
      const kk = (k + 1) % radialSegments;
      indices.push(a + k, b + k, a + kk);
      indices.push(a + kk, b + k, b + kk);
    }
  }

  const startCenter = vertices.length / 3;
  vertices.push(rings[0].center.x, rings[0].center.y, rings[0].center.z);
  for (let k = 0; k < radialSegments; k++) {
    indices.push(startCenter, (k + 1) % radialSegments, k);
  }

  const endCenter = vertices.length / 3;
  const last = (rings.length - 1) * radialSegments;
  const lastCenter = rings[rings.length - 1].center;
  vertices.push(lastCenter.x, lastCenter.y, lastCenter.z);
  for (let k = 0; k < radialSegments; k++) {
    indices.push(endCenter, last + k, last + ((k + 1) % radialSegments));
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function buildGoredRoundElbowGeometry(element: SceneElement): BufferGeometry {
  const p = element.params;
  const inDir = toThreeDirection(p.inDirection ?? [-1, 0, 0]);
  const outDir = toThreeDirection(p.outDirection ?? [0, 1, 0]);
  const radius = p.radius ?? 25;
  const bendRadius = p.bendRadius ?? radius * 3;
  const gores = clampInt(p.gores ?? 5, 2, 12);
  const start = inDir.clone().multiplyScalar(-bendRadius);
  const corner = new Vector3(0, 0, 0);
  const end = outDir.clone().multiplyScalar(bendRadius);
  const centers: Vector3[] = [];

  for (let i = 0; i <= gores; i++) {
    centers.push(quadraticPoint(start, corner, end, i / gores));
  }

  const rings = centers.map((center, i) => {
    let tangent: Vector3;
    if (i === 0) {
      tangent = inDir.clone();
    } else if (i === centers.length - 1) {
      tangent = outDir.clone();
    } else {
      tangent = new Vector3().subVectors(centers[i + 1], centers[i - 1]);
    }
    return { center, tangent: tangent.normalize() };
  });
  return buildSweptRound(rings, radius, 24);
}

/**
 * A true radius (swept) rectangular duct elbow — the rectangular section is
 * swept along a circular arc tangent to both legs, matching the radius elbow
 * drawn in the standard PDF rather than mitred boxes.
 */
function buildDuctElbowGeometry(element: SceneElement): BufferGeometry {
  const params = element.params;
  // inDirection points INTO the elbow (toward the corner), matching the pipe
  // elbow convention, so the incoming straight sits on the -inDirection side.
  // Negate it to get the outward direction of the incoming leg.
  const u = toThreeDirection(params.inDirection ?? [-1, 0, 0]).negate(); // outward along incoming leg
  const v = toThreeDirection(params.outDirection ?? [1, 0, 0]); // outward along outgoing leg
  const width = params.width ?? 300;
  const height = params.height ?? 300;
  const halfW = width / 2;
  const halfH = height / 2;
  // Tangent length = distance from the theoretical corner to where the backend
  // trims the adjoining straights, so the elbow meets them exactly.
  const tangent = params.bendRadius ?? Math.max(width, height);

  const clamp = (x: number) => Math.max(-1, Math.min(1, x));
  const phi = Math.acos(clamp(u.dot(v))); // angle between the outward legs
  const half = phi / 2;
  const bendCheck = new Vector3().crossVectors(u, v);

  // Degenerate (collinear legs): fall back to a straight box through the corner.
  if (bendCheck.length() < 1e-6 || Math.sin(half) < 1e-3) {
    const a = u.clone().multiplyScalar(tangent);
    const b = v.clone().multiplyScalar(tangent);
    const dir = new Vector3().subVectors(b, a).normalize();
    const inPlane = perpendicularTo(dir);
    const outOfPlane = new Vector3().crossVectors(dir, inPlane).normalize();
    return buildSweptRect(
      [{ center: a, inPlane, outOfPlane }, { center: b, inPlane, outOfPlane }],
      halfW,
      halfH,
    );
  }

  // Centerline bend radius from the tangent length and turn angle.
  const radius = tangent * Math.tan(half);
  const bisector = u.clone().add(v).normalize();
  const center = bisector.clone().multiplyScalar(radius / Math.sin(half));
  const r1 = u.clone().multiplyScalar(tangent).sub(center);
  const r2 = v.clone().multiplyScalar(tangent).sub(center);
  const axis = new Vector3().crossVectors(r1, r2).normalize(); // out-of-plane bend normal
  const sweep = Math.acos(clamp(r1.clone().normalize().dot(r2.clone().normalize())));

  const segments = 20;
  const rings: { center: Vector3; inPlane: Vector3; outOfPlane: Vector3 }[] = [];
  for (let i = 0; i <= segments; i++) {
    const radial = r1.clone().applyAxisAngle(axis, (sweep * i) / segments);
    rings.push({
      center: center.clone().add(radial),
      inPlane: radial.clone().normalize(),
      outOfPlane: axis,
    });
  }
  return buildSweptRect(rings, halfW, halfH);
}

function buildOffsetGeometry(element: SceneElement): BufferGeometry {
  const p = element.params;
  const start = toThree(p.start!);
  const end = toThree(p.end!);
  const main = toThreeDirection(p.direction ?? [1, 0, 0]);
  const delta = new Vector3().subVectors(end, start);
  const mainDistance = Math.max(delta.dot(main), 0);
  const offsetVector = delta.clone().addScaledVector(main, -mainDistance);
  const style = p.offsetStyle ?? partType(element);
  const centers = style.includes("radius")
    ? smoothOffsetCenters(start, main, offsetVector, mainDistance)
    : miteredOffsetCenters(start, end, main, mainDistance, p.straightStub ?? 75);

  if (p.fromShape === "round") {
    const radius = p.fromRadius ?? p.radius ?? p.toRadius ?? 100;
    return buildSweptRound(offsetRings(centers, main), radius, 24);
  }

  const halfW = (p.fromWidth ?? p.width ?? p.toWidth ?? 200) / 2;
  const halfH = (p.fromHeight ?? p.height ?? p.toHeight ?? 200) / 2;
  const rings = offsetRings(centers, main).map((r) => {
    const frame = sectionFrameForDirection(r.tangent);
    return { center: r.center, inPlane: frame.right, outOfPlane: frame.up };
  });
  return buildSweptRect(rings, halfW, halfH);
}

function buildTransitionGeometry(element: SceneElement): BufferGeometry {
  const p = element.params;
  const start = toThree(p.start!);
  const end = toThree(p.end!);
  const dir = new Vector3().subVectors(end, start);
  if (dir.length() < 1e-6) dir.copy(X_AXIS);
  dir.normalize();
  // Use the same height-up section frame as the straight ducts (right = level,
  // up = world-up) so the rectangular end aligns with the adjoining rect duct
  // instead of being rolled to an arbitrary perpendicular.
  const { right, up } = sectionFrameForDirection(dir);
  const count = 32;
  const vertices: number[] = [];
  const indices: number[] = [];

  const from = sectionRing(
    p.fromShape ?? "rectangular",
    p.fromWidth ?? 0,
    p.fromHeight ?? 0,
    p.fromRadius ?? 0,
    count,
  );
  const to = sectionRing(
    p.toShape ?? "round",
    p.toWidth ?? 0,
    p.toHeight ?? 0,
    p.toRadius ?? 0,
    count,
  );

  // Both rings are sampled CCW from +right, so index-matched lofting keeps the
  // rect↔round walls from twisting across the body.
  for (const [ring, base] of [[from, start], [to, end]] as const) {
    for (const [x, y] of ring) {
      const point = base.clone()
        .addScaledVector(right, x)
        .addScaledVector(up, y);
      vertices.push(point.x, point.y, point.z);
    }
  }

  for (let i = 0; i < count; i++) {
    const j = (i + 1) % count;
    indices.push(i, j, count + i, j, count + j, count + i);
  }
  for (let i = 1; i < count - 1; i++) {
    indices.push(0, i, i + 1);
    indices.push(count, count + i + 1, count + i);
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

function sectionRing(shape: "rectangular" | "round" | "oval" | "flat_oval", width: number, height: number, radius: number, count: number): [number, number][] {
  const points: [number, number][] = [];
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    if (shape === "round") {
      const r = radius || Math.max(width, height) / 2 || 100;
      points.push([c * r, s * r]);
    } else {
      const hw = (width || radius * 2 || 200) / 2;
      const hh = (height || radius * 2 || 200) / 2;
      const scale = Math.min(
        Math.abs(c) < 1e-6 ? Number.POSITIVE_INFINITY : hw / Math.abs(c),
        Math.abs(s) < 1e-6 ? Number.POSITIVE_INFINITY : hh / Math.abs(s),
      );
      points.push([c * scale, s * scale]);
    }
  }
  return points;
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function quadraticPoint(a: Vector3, b: Vector3, c: Vector3, t: number): Vector3 {
  const s = 1 - t;
  return a.clone().multiplyScalar(s * s)
    .add(b.clone().multiplyScalar(2 * s * t))
    .add(c.clone().multiplyScalar(t * t));
}

function smoothOffsetCenters(
  start: Vector3,
  main: Vector3,
  offsetVector: Vector3,
  mainDistance: number,
): Vector3[] {
  const centers: Vector3[] = [];
  const segments = 16;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const eased = t * t * (3 - 2 * t);
    centers.push(start.clone()
      .addScaledVector(main, mainDistance * t)
      .addScaledVector(offsetVector, eased));
  }
  return centers;
}

function miteredOffsetCenters(
  start: Vector3,
  end: Vector3,
  main: Vector3,
  mainDistance: number,
  straightStub: number,
): Vector3[] {
  const stub = Math.min(Math.max(straightStub, 0), mainDistance / 3);
  if (stub <= 1e-6) return [start, end];
  const firstMiter = start.clone().addScaledVector(main, stub);
  const lastMiter = end.clone().addScaledVector(main, -stub);
  if (firstMiter.distanceTo(lastMiter) <= 1e-6) return [start, end];
  return [start, firstMiter, lastMiter, end];
}

function offsetRings(
  centers: Vector3[],
  main: Vector3,
): { center: Vector3; tangent: Vector3 }[] {
  return centers.map((center, i) => {
    let tangent: Vector3;
    if (i === 0 || i === centers.length - 1) {
      tangent = main.clone();
    } else {
      tangent = new Vector3().subVectors(centers[i + 1], centers[i - 1]);
    }
    if (tangent.length() <= 1e-6) tangent = main.clone();
    return { center, tangent: tangent.normalize() };
  });
}

function toThreeDirection(value: [number, number, number]): Vector3 {
  return toThree(value).normalize();
}

function sectionFrameForDirection(direction: Vector3): { right: Vector3; up: Vector3 } {
  const length = direction.length() > 1e-6 ? direction.clone().normalize() : X_AXIS.clone();
  let up: Vector3;
  if (Math.abs(length.dot(UP)) > 0.99) {
    up = Z_AXIS.clone();
  } else {
    up = UP.clone().addScaledVector(length, -UP.dot(length)).normalize();
  }
  const right = new Vector3().crossVectors(length, up).normalize();
  up = new Vector3().crossVectors(right, length).normalize();
  return { right, up };
}

function perpendicularTo(axis: Vector3): Vector3 {
  const ref = Math.abs(axis.dot(Z_AXIS)) > 0.9 ? X_AXIS : Z_AXIS;
  return new Vector3().crossVectors(axis, ref).normalize();
}

function rotateAroundAxis(vector: Vector3, axis: Vector3, degrees: number): Vector3 {
  return vector.clone().applyAxisAngle(axis.clone().normalize(), (degrees * Math.PI) / 180).normalize();
}
