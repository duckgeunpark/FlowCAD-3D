"use client";

import { useMemo } from "react";
import {
  BufferGeometry,
  CatmullRomCurve3,
  DoubleSide,
  Float32BufferAttribute,
  Quaternion,
  Vector3,
} from "three";
import type { Side } from "three";
import type { SceneElement } from "@flowcad/shared";
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

/** Position + orientation for a tube/box spanning start -> end. */
function useSpan(start: [number, number, number], end: [number, number, number]) {
  return useMemo(() => {
    const a = toThree(start);
    const b = toThree(end);
    const dir = new Vector3().subVectors(b, a);
    const length = dir.length();
    const mid = new Vector3().addVectors(a, b).multiplyScalar(0.5);
    const quat = new Quaternion().setFromUnitVectors(
      UP,
      dir.clone().normalize(),
    );
    return { length, mid, quat };
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
      return element.params.width != null || element.params.height != null ? (
        <DuctElbow {...props} />
      ) : (
        <PipeElbow {...props} />
      );
    case "tee":
      return <TeeFitting {...props} />;
    case "transition":
      return <TransitionFitting {...props} />;
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
      quaternion={span.quat}
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

function TeeFitting(p: ElementVisualProps) {
  const { params } = p.element;
  const pos = useMemo(() => toThree(params.position!), [params.position]);
  const radius = params.radius ?? 30;
  const runLength = params.runLength ?? radius * 5;
  const branchLength = params.branchLength ?? radius * 4;
  const main = useMemo(
    () => toThreeDirection(params.mainDirection ?? params.direction ?? [1, 0, 0]),
    [params.mainDirection, params.direction],
  );
  const branch = useMemo(
    () => toThreeDirection(params.branchDirection ?? [0, 1, 0]),
    [params.branchDirection],
  );
  return (
    <group position={pos} {...interactionHandlers(p)} userData={p.element.userData}>
      <LocalCylinder
        p={p}
        start={main.clone().multiplyScalar(-runLength / 2)}
        end={main.clone().multiplyScalar(runLength / 2)}
        radius={radius}
      />
      <LocalCylinder
        p={p}
        start={new Vector3(0, 0, 0)}
        end={branch.clone().multiplyScalar(branchLength)}
        radius={radius * 0.82}
      />
    </group>
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
  const quat = useMemo(() => new Quaternion().setFromUnitVectors(UP, dir), [dir]);
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
      {StandardMaterial(p, 0.25, 0.56)}
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

function buildTransitionGeometry(element: SceneElement): BufferGeometry {
  const p = element.params;
  const start = toThree(p.start!);
  const end = toThree(p.end!);
  const axis = new Vector3().subVectors(end, start).normalize();
  const center = new Vector3().addVectors(start, end).multiplyScalar(0.5);
  const right = perpendicularTo(axis);
  const up = new Vector3().crossVectors(right, axis).normalize();
  const count = 24;
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

  for (const [ring, t] of [[from, -0.5], [to, 0.5]] as const) {
    for (const [x, y] of ring) {
      const point = center.clone()
        .add(axis.clone().multiplyScalar(start.distanceTo(end) * t))
        .add(right.clone().multiplyScalar(x))
        .add(up.clone().multiplyScalar(y));
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

function sectionRing(shape: "rectangular" | "round", width: number, height: number, radius: number, count: number): [number, number][] {
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

function toThreeDirection(value: [number, number, number]): Vector3 {
  return toThree(value).normalize();
}

function perpendicularTo(axis: Vector3): Vector3 {
  const ref = Math.abs(axis.dot(Z_AXIS)) > 0.9 ? X_AXIS : Z_AXIS;
  return new Vector3().crossVectors(axis, ref).normalize();
}

function rotateAroundAxis(vector: Vector3, axis: Vector3, degrees: number): Vector3 {
  return vector.clone().applyAxisAngle(axis.clone().normalize(), (degrees * Math.PI) / 180).normalize();
}
