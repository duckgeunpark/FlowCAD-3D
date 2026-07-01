"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Bounds,
  Grid,
  Html,
  OrbitControls,
  OrthographicCamera,
  PerspectiveCamera,
} from "@react-three/drei";
import { useEffect, useMemo, useRef } from "react";
import type { MutableRefObject, RefObject } from "react";
import { Vector3 } from "three";
import type { JointPort } from "@flowcad/shared";
import { ElementMesh } from "@/three/GeometryFactory";
import { toThree } from "@/three/coords";
import { matchesSearch, useViewerStore } from "@/store/useViewerStore";

export function Viewer() {
  const { scene, viewMode } = useViewerStore();
  const needleRef = useRef<HTMLDivElement>(null);
  const resetNorthRef = useRef<() => void>(() => {});

  return (
    <div className="relative w-full h-full">
    <Canvas shadows dpr={[1, 2]} className="bg-[#0b0e13]">
      {viewMode === "true_scale" ? (
        // near=0.1 with far=500000 gives a ~5,000,000:1 depth ratio, which
        // destroys depth-buffer precision and makes adjacent faces z-fight /
        // flicker while orbiting. Scene units are mm, so a 50mm near plane is
        // safe and restores precision.
        <PerspectiveCamera makeDefault position={[4000, 3500, 5000]} fov={45} near={50} far={500000} />
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
          <div className="text-gray-400 text-lg whitespace-nowrap text-center">데이터를 생성하면 3D 모델이 표시됩니다.</div>
        </Html>
      )}

      <CompassTracker needleRef={needleRef} resetRef={resetNorthRef} />
    </Canvas>
    <NorthCompass needleRef={needleRef} onReset={() => resetNorthRef.current()} />
    </div>
  );
}

function sceneKey(scene: { elements: { id: string }[] }): string {
  return scene.elements.map((e) => e.id).join("|");
}

/**
 * Reads the camera heading every frame and rotates the on-screen compass needle
 * so it always points at world North (engineering +Y = three +Z). Writes the CSS
 * transform directly on the DOM node, avoiding a React re-render per frame.
 */
function CompassTracker({
  needleRef,
  resetRef,
}: {
  needleRef: RefObject<HTMLDivElement | null>;
  resetRef: MutableRefObject<() => void>;
}) {
  const camera = useThree((s) => s.camera);
  const forward = useRef(new Vector3()).current;
  const headingRef = useRef(0);
  // Which heading currently counts as "North". Double-clicking the compass sets
  // this to the current heading, recalibrating North to the present view without
  // moving the camera.
  const northOffsetRef = useRef(0);

  useFrame(() => {
    camera.getWorldDirection(forward);
    // Heading from the forward direction projected onto the ground (X-Z) plane.
    if (Math.hypot(forward.x, forward.z) < 1e-4) return; // looking straight down
    const headingDeg = Math.atan2(forward.x, forward.z) * (180 / Math.PI);
    headingRef.current = headingDeg;
    const node = needleRef.current;
    // CSS rotate is clockwise-positive; rotate relative to the calibrated North.
    if (node) {
      node.style.transform = `rotate(${headingDeg - northOffsetRef.current}deg)`;
    }
  });

  useEffect(() => {
    resetRef.current = () => {
      northOffsetRef.current = headingRef.current;
    };
  }, [resetRef]);

  return null;
}

/** Corner compass badge; needle rotated each frame; double-click resets to N-up. */
function NorthCompass({
  needleRef,
  onReset,
}: {
  needleRef: RefObject<HTMLDivElement | null>;
  onReset: () => void;
}) {
  return (
    <button
      type="button"
      onDoubleClick={onReset}
      title="Double-click to set current view as north"
      className="absolute top-3 left-3 w-14 h-14 rounded-full bg-panel/80 border border-panelLight backdrop-blur shadow-lg flex items-center justify-center select-none cursor-pointer hover:border-accent"
    >
      <div ref={needleRef} className="relative w-full h-full will-change-transform pointer-events-none">
        <div className="absolute left-1/2 top-1 -translate-x-1/2 flex flex-col items-center">
          <div className="w-0 h-0 border-l-[5px] border-r-[5px] border-b-[11px] border-l-transparent border-r-transparent border-b-red-500" />
          <span className="text-[10px] font-bold text-red-400 leading-none mt-0.5">N</span>
        </div>
        <div className="absolute left-1/2 bottom-1 -translate-x-1/2 text-[9px] text-gray-500 leading-none">S</div>
      </div>
    </button>
  );
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
  const { scene, selectedJointId, hoveredJointId, selectJoint, hoverJoint, labelMode } = useViewerStore();
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
                  {element.itemNo} · {joint.no}{joint.open ? " (열린 조인트)" : ""}
                </button>
              </Html>
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



