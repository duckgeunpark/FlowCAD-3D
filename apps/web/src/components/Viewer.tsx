"use client";

import { Canvas } from "@react-three/fiber";
import {
  Bounds,
  Grid,
  Html,
  OrbitControls,
  OrthographicCamera,
  PerspectiveCamera,
} from "@react-three/drei";
import { useMemo } from "react";
import type { JointPort } from "@flowcad/shared";
import { ElementMesh } from "@/three/GeometryFactory";
import { toThree } from "@/three/coords";
import { matchesSearch, useViewerStore } from "@/store/useViewerStore";
import type { AddFromJointKind } from "@/store/useViewerStore";

export function Viewer() {
  const { scene, viewMode } = useViewerStore();

  return (
    <Canvas shadows dpr={[1, 2]} className="bg-[#0b0e13]">
      {viewMode === "true_scale" ? (
        <PerspectiveCamera makeDefault position={[4000, 3500, 5000]} fov={45} far={500000} />
      ) : (
        <OrthographicCamera makeDefault position={[6000, 6000, 6000]} zoom={0.08} far={500000} />
      )}
      <OrbitControls makeDefault enableDamping />

      <ambientLight intensity={0.6} />
      <directionalLight position={[3000, 6000, 4000]} intensity={1.1} castShadow />
      <directionalLight position={[-4000, 2000, -3000]} intensity={0.4} />

      <Grid
        // With infiniteGrid, drei multiplies plane vertices by fadeDistance.
        // A 20,000 mm base plane becomes hundreds of millions of units wide,
        // which makes the shader grid shimmer/wave while rotating. Keep the
        // base plane tiny and let fadeDistance define the visible footprint.
        args={[2, 2]}
        cellSize={500}
        sectionSize={2500}
        infiniteGrid
        fadeDistance={30000}
        cellColor="#1c2530"
        sectionColor="#2c3a4a"
        position={[0, -5, 0]}
      />

      {scene && scene.elements.length > 0 ? (
        <Bounds key={sceneKey(scene)} fit clip observe margin={1.2}>
          <SceneContent />
        </Bounds>
      ) : (
        <Html center>
          <div className="text-gray-400 text-sm">데이터를 생성하면 3D 모델이 표시됩니다.</div>
        </Html>
      )}
    </Canvas>
  );
}

function sceneKey(scene: { elements: { id: string }[] }): string {
  return scene.elements.map((e) => e.id).join("|");
}

function SceneContent() {
  const {
    scene,
    selectedId,
    hoveredId,
    searchTerm,
    labelMode,
    select,
    selectJoint,
    hover,
  } = useViewerStore();

  const selectedLabel = useMemo(() => {
    const el = scene?.elements.find((e) => e.id === selectedId);
    const pos = el?.params.position ?? el?.params.start;
    if (!el || !pos) return null;
    return { pos: toThree(pos), text: `${el.itemNo || el.id} · ${el.userData.jointNo || el.id}` };
  }, [scene, selectedId]);

  if (!scene) return null;

  return (
    <group onPointerMissed={() => { select(null); selectJoint(null); }}>
      {scene.elements.map((element) => {
        const visible = matchesSearch(element.userData, searchTerm);
        return (
          <ElementMesh
            key={element.id}
            element={element}
            opacity={visible ? 1 : 0.2}
            selected={element.id === selectedId}
            hovered={element.id === hoveredId}
            onSelect={select}
            onHover={hover}
          />
        );
      })}

      <JointMarkers />

      {selectedLabel && labelMode !== "none" && labelMode !== "joints" && (
        <Html position={selectedLabel.pos} center distanceFactor={8000}>
          <div className="px-2 py-1 rounded bg-accent text-white text-xs whitespace-nowrap shadow-lg">
            {selectedLabel.text}
          </div>
        </Html>
      )}
    </group>
  );
}

function JointMarkers() {
  const { scene, selectedJointId, hoveredJointId, selectJoint, hoverJoint, mode, labelMode } = useViewerStore();
  if (!scene) return null;

  return (
    <>
      {scene.elements.flatMap((element) =>
        element.joints.map((joint) => (
          <group key={joint.id} position={toThree(joint.position)}>
            <mesh
              onClick={(e) => {
                e.stopPropagation();
                if (joint.open) selectJoint(joint.id);
              }}
              onPointerOver={(e) => {
                e.stopPropagation();
                hoverJoint(joint.id);
              }}
              onPointerOut={() => hoverJoint(null)}
            >
              <sphereGeometry args={[joint.open ? 42 : 24, 16, 16]} />
              <meshStandardMaterial
                color={joint.open ? "#35d07f" : "#64748b"}
                emissive={selectedJointId === joint.id ? "#ffd24a" : "#000000"}
                emissiveIntensity={selectedJointId === joint.id ? 0.7 : 0.05}
                transparent
                opacity={joint.open ? 0.95 : 0.55}
              />
            </mesh>
            {shouldShowJointLabel(labelMode, joint.id, selectedJointId, hoveredJointId) && (
              <Html center distanceFactor={9000} position={[0, 72, 0]}>
                <button
                  className={`px-1.5 py-0.5 rounded text-[10px] whitespace-nowrap border ${
                    joint.open
                      ? "bg-emerald-600/90 border-emerald-300 text-white"
                      : "bg-slate-800/80 border-slate-500 text-slate-200"
                  }`}
                  onClick={(event) => {
                    event.stopPropagation();
                    if (joint.open) selectJoint(joint.id);
                  }}
                  title={`${element.itemNo} ${joint.role}`}
                >
                  {element.itemNo} · {joint.no}{joint.open ? " (빈 조인트)" : ""}
                </button>
              </Html>
            )}
            {selectedJointId === joint.id && joint.open && (
              <JointAddMenu joint={joint} showDamper={mode === "duct" || element.kind === "duct_segment"} />
            )}
          </group>
        )),
      )}
    </>
  );
}

function shouldShowJointLabel(
  labelMode: "auto" | "all" | "joints" | "none",
  jointId: string,
  selectedJointId: string | null,
  hoveredJointId: string | null,
): boolean {
  if (labelMode === "none") return false;
  if (labelMode === "all" || labelMode === "joints") return true;
  return jointId === selectedJointId || jointId === hoveredJointId;
}

function JointAddMenu({ joint, showDamper }: { joint: JointPort; showDamper: boolean }) {
  const { addFromJoint, mode } = useViewerStore();
  const buttons: { key: AddFromJointKind; label: string }[] = [
    { key: "straight", label: "직관" },
    { key: "elbow", label: "엘보" },
    { key: "tee", label: "티" },
    { key: "valve", label: "밸브" },
    { key: "reducer", label: mode === "pipe" ? "레듀샤" : "레듀샤/트랜지션" },
  ];
  if (showDamper) buttons.push({ key: "damper", label: "댐퍼" });

  return (
    <Html center distanceFactor={7000} position={[0, 160, 0]}>
      <div className="rounded-lg border border-emerald-300 bg-panel/95 shadow-xl p-2 min-w-44">
        <div className="text-[11px] text-emerald-200 mb-1 font-mono">{joint.no}</div>
        <div className="grid grid-cols-2 gap-1">
          {buttons.map((button) => (
            <button
              key={button.key}
              className="px-2 py-1 rounded bg-accent text-white text-xs hover:bg-blue-500 truncate"
              onClick={(event) => {
                event.stopPropagation();
                addFromJoint(button.key);
              }}
            >
              {button.label}
            </button>
          ))}
        </div>
      </div>
    </Html>
  );
}
