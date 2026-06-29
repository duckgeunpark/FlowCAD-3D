"use client";

import { useEffect, useState } from "react";
import type { KeyboardEvent } from "react";
import type { SceneElement } from "@flowcad/shared";
import { getFitting } from "@flowcad/shared";
import { useViewerStore } from "@/store/useViewerStore";

const LABELS: Record<string, string> = {
  drawingNo: "도면번호",
  fittingNo: "피팅번호",
  jointNo: "대표 조인트",
  jointNos: "조인트 No",
  itemNo: "아이템번호",
  spec: "스펙",
  material: "자재 재질",
  sheetGauge: "강판 두께",
  stiffenerSpec: "보강 앵글 규격",
  maxSpacing: "최대 보강 간격",
  materialSpec: "공인 자재 규격",
  error: "경고 메시지",
  length_mm: "길이(mm)",
};

/** Right-side detail panel shown when a 3D element is selected. */
export function DetailPanel() {
  const { scene, selectedId, select, rotateFitting } = useViewerStore();
  const element = scene?.elements.find((e) => e.id === selectedId);
  if (!element) return null;
  const canRotate = ["elbow", "tee", "valve", "damper"].includes(element.kind);
  const rectangular = element.params.width != null || element.params.height != null;
  const rotateStep = rectangular ? 90 : 15;
  const isError = element.kind === "error_marker";

  return (
    <div className={`absolute top-3 right-3 w-72 bg-panel/95 backdrop-blur border ${isError ? 'border-red-500/80 shadow-red-900/50' : 'border-panelLight'} rounded-lg shadow-xl`}>
      <div className={`flex items-center justify-between px-3 py-2 border-b ${isError ? 'border-red-500/50 bg-red-500/20' : 'border-panelLight'}`}>
        <span className={`text-sm font-medium ${isError ? 'text-red-300 font-bold' : ''}`}>
          {isError ? "❗ 조인트 연결 경고" : "아이템 상세"}
        </span>
        <button onClick={() => select(null)} className="text-gray-500 hover:text-white">×</button>
      </div>
      <div className="p-3 space-y-1.5 text-xs">
        {!isError && <Row label="아이템번호" value={element.itemNo || "-"} />}
        <Row label="종류" value={kindLabel(element)} />
        <Row label="ID" value={element.id} />
        {!isError && <DimensionEditor element={element} />}
        {!isError && <LengthEditor element={element} />}
        {!isError && <TapControls element={element} />}
        {Object.entries(element.userData).map(([k, v]) => (
          <Row key={k} label={LABELS[k] ?? k} value={v || "-"} isHighlight={k === "error"} />
        ))}
        {canRotate && (
          <div className="pt-2 mt-2 border-t border-panelLight">
            <div className="flex items-center justify-between mb-1">
              <span className="text-gray-400">피팅 회전</span>
              <span className="font-mono text-gray-200">
                {Math.round(element.params.rollDeg ?? 0)}°
                {rectangular ? " · 4방향" : " · 자유각"}
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1">
              <button
                onClick={() => rotateFitting(element.id, -rotateStep)}
                className="px-2 py-1 rounded bg-panelLight hover:bg-[#222b37]"
              >
                -{rotateStep}°
              </button>
              <button
                onClick={() => rotateFitting(element.id, rotateStep)}
                className="px-2 py-1 rounded bg-panelLight hover:bg-[#222b37]"
              >
                +{rotateStep}°
              </button>
            </div>
          </div>
        )}
        <div className="pt-2 mt-2 border-t border-panelLight">
          <div className="text-gray-400 mb-1">붙어있는 조인트</div>
          <div className="space-y-1">
            {element.joints.length === 0 ? (
              <div className="text-gray-500">-</div>
            ) : (
              element.joints.map((joint) => (
                <div key={joint.id} className="flex justify-between gap-2 rounded bg-black/20 px-2 py-1">
                  <span className="font-mono text-gray-200">{joint.no}</span>
                  <span className={joint.open ? "text-emerald-300" : "text-gray-400"}>
                    {joint.role}{joint.open ? " · 빈 조인트" : ""}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// Friendly Korean names. Prefer the specific part_type subtype (so reducers and
// transitions read distinctly) and fall back to the generic ComponentKind.
const PART_TYPE_LABEL: Record<string, string> = {
  straight: "직관",
  elbow: "엘보",
  tee: "티",
  valve: "밸브",
  damper: "댐퍼",
  reducer: "레듀서",
  reducer_conc: "동심 레듀서",
  reducer_ecc: "편심 레듀서",
  transition: "변환관",
  transform: "변환관",
};

function kindLabel(element: import("@flowcad/shared").SceneElement): string {
  const pt = element.userData.partType;
  if (pt && PART_TYPE_LABEL[pt]) return PART_TYPE_LABEL[pt];
  // Standard-catalog fittings carry their catalog id as partType.
  const catalog = pt ? getFitting(pt) : undefined;
  return catalog?.nameKo ?? element.kind;
}

/**
 * Editable cross-section for the selected item. Writes size_a/size_b back to the
 * matching design row and regenerates so the 3D model updates immediately.
 * Transitions (two sections) stay read-only here.
 */
function DimensionEditor({ element }: { element: SceneElement }) {
  const rows = useViewerStore((s) => s.rows);
  const setRows = useViewerStore((s) => s.setRows);
  const regenerate = useViewerStore((s) => s.regenerate);

  const p = element.params;
  const isTransition = p.fromShape != null || p.toShape != null;
  const isRect = !isTransition && (p.width != null || p.height != null);
  const isRound = !isTransition && !isRect && p.radius != null;

  const seq = element.id.replace(/^A/, "");
  const rowIdx = rows.findIndex((r) => String(r.seq ?? "").trim() === seq);

  const [a, setA] = useState("");
  const [b, setB] = useState("");
  useEffect(() => {
    if (p.width != null || p.height != null) {
      setA(String(Math.round(p.width ?? 0)));
      setB(String(Math.round(p.height ?? 0)));
    } else if (p.radius != null) {
      setA(String(Math.round((p.radius ?? 0) * 2)));
    }
    // re-seed when a different item is selected
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [element.id]);

  const editable = rowIdx >= 0 && (isRect || isRound);
  if (!editable) {
    const dims = describeDimensions(p);
    if (dims.length === 0) return null;
    return (
      <div className="pt-1.5 mt-1.5 border-t border-panelLight space-y-1.5">
        <div className="text-gray-400">치수</div>
        {dims.map((d) => (
          <Row key={d.label} label={d.label} value={d.value} />
        ))}
      </div>
    );
  }

  const commit = () => {
    const next = rows.map((r, i) =>
      i === rowIdx ? { ...r, size_a: a, ...(isRect ? { size_b: b } : {}) } : r,
    );
    setRows(next);
    void regenerate();
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
  };

  return (
    <div className="pt-1.5 mt-1.5 border-t border-panelLight space-y-1.5">
      <div className="text-gray-400">치수 (편집 가능, Enter 적용)</div>
      <div className="flex items-center gap-2">
        {isRect ? (
          <>
            <DimInput label="W" value={a} onChange={setA} onCommit={commit} onKeyDown={onKey} />
            <span className="text-gray-600">×</span>
            <DimInput label="H" value={b} onChange={setB} onCommit={commit} onKeyDown={onKey} />
          </>
        ) : (
          <DimInput label="Ø" value={a} onChange={setA} onCommit={commit} onKeyDown={onKey} />
        )}
        <span className="text-gray-500 text-[11px]">mm</span>
      </div>
      {p.bendRadius != null && (
        <Row label="곡률반경 (R)" value={`${Math.round(p.bendRadius)} mm`} />
      )}
    </div>
  );
}

/**
 * Editable straight-run length for the selected item. Writes the `length` field
 * back to the matching design row and regenerates. Corner fittings (elbow/tee)
 * derive their length from size + angle, so they stay read-only here.
 */
function LengthEditor({ element }: { element: SceneElement }) {
  const rows = useViewerStore((s) => s.rows);
  const setRows = useViewerStore((s) => s.setRows);
  const regenerate = useViewerStore((s) => s.regenerate);

  const p = element.params;
  const partType = String(element.userData.partType ?? "").toLowerCase();
  const isAutoLen =
    ["elbow", "tee"].includes(partType) ||
    element.kind === "elbow" ||
    element.kind === "tee";

  // The straight span from the geometry endpoints (the rendered length).
  const span =
    p.start && p.end
      ? Math.hypot(p.end[0] - p.start[0], p.end[1] - p.start[1], p.end[2] - p.start[2])
      : null;

  const seq = element.id.replace(/^A/, "");
  const rowIdx = rows.findIndex((r) => String(r.seq ?? "").trim() === seq);
  const row = rowIdx >= 0 ? rows[rowIdx] : undefined;

  const [len, setLen] = useState("");
  useEffect(() => {
    const rowLen = row?.length;
    if (rowLen != null && String(rowLen).trim() !== "") {
      setLen(String(rowLen));
    } else if (span != null) {
      setLen(String(Math.round(span)));
    } else {
      setLen("");
    }
    // re-seed when a different item is selected
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [element.id]);

  const editable = rowIdx >= 0 && !isAutoLen && span != null;
  if (!editable) {
    if (span == null) return null;
    return (
      <div className="pt-1.5 mt-1.5 border-t border-panelLight">
        <Row label="길이 (L)" value={`${Math.round(span)} mm${isAutoLen ? " · 자동" : ""}`} />
      </div>
    );
  }

  const commit = () => {
    setRows(rows.map((r, i) => (i === rowIdx ? { ...r, length: len } : r)));
    void regenerate();
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
  };

  return (
    <div className="pt-1.5 mt-1.5 border-t border-panelLight space-y-1.5">
      <div className="text-gray-400">길이 (편집 가능, Enter 적용)</div>
      <div className="flex items-center gap-2">
        <DimInput label="L" value={len} onChange={setLen} onCommit={commit} onKeyDown={onKey} />
        <span className="text-gray-500 text-[11px]">mm</span>
      </div>
    </div>
  );
}

function DimInput({
  label,
  value,
  onChange,
  onCommit,
  onKeyDown,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onCommit: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void;
}) {
  return (
    <label className="flex items-center gap-1">
      <span className="text-gray-500 text-[11px]">{label}</span>
      <input
        value={value}
        inputMode="numeric"
        onChange={(e) => onChange(e.target.value)}
        onBlur={onCommit}
        onKeyDown={onKeyDown}
        className="w-16 bg-panelLight rounded px-1.5 py-1 text-gray-100 outline-none focus:ring-1 focus:ring-accent text-right font-mono"
      />
    </label>
  );
}

/**
 * Side-tap branching controls. On a straight: buttons to add a 90° tap or 45°
 * lateral branch onto its side. On a tap branch: a slider to move the tap along
 * the parent straight (writes connect_port = "tap@<frac>").
 */
function TapControls({ element }: { element: SceneElement }) {
  const rows = useViewerStore((s) => s.rows);
  const setRows = useViewerStore((s) => s.setRows);
  const regenerate = useViewerStore((s) => s.regenerate);
  const addTap = useViewerStore((s) => s.addTap);

  const seq = element.id.replace(/^A/, "");
  const isStraight =
    element.kind === "duct_segment" || element.kind === "pipe_segment";
  const row = rows.find((r) => String(r.seq ?? "").trim() === seq);
  const port = String(row?.connect_port ?? "");
  const isTapBranch = port.startsWith("tap");
  const fracMatch = port.match(/tap@([\d.]+)/);
  const pct = fracMatch ? Math.round(parseFloat(fracMatch[1]) * 100) : 50;

  if (!isStraight && !isTapBranch) return null;

  const setFrac = (value: number, commit: boolean) => {
    const f = (value / 100).toFixed(2);
    const idx = rows.findIndex((r) => String(r.seq ?? "").trim() === seq);
    if (idx < 0) return;
    setRows(rows.map((r, i) => (i === idx ? { ...r, connect_port: `tap@${f}` } : r)));
    if (commit) void regenerate();
  };

  return (
    <div className="pt-2 mt-2 border-t border-panelLight space-y-2">
      {isStraight && (
        <div>
          <div className="text-gray-400 mb-1">옆면 분기 추가 (탭)</div>
          <div className="grid grid-cols-2 gap-1">
            <button
              onClick={() => addTap(seq, 90)}
              className="px-2 py-1 rounded bg-accent text-white text-xs hover:bg-blue-500"
            >
              90° 탭
            </button>
            <button
              onClick={() => addTap(seq, 45)}
              className="px-2 py-1 rounded bg-accent text-white text-xs hover:bg-blue-500"
            >
              45° 래터럴
            </button>
          </div>
        </div>
      )}
      {isTapBranch && (
        <div>
          <div className="flex justify-between text-gray-400 mb-1">
            <span>분기 위치</span>
            <span className="font-mono text-gray-200">{pct}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={pct}
            onChange={(e) => setFrac(Number(e.target.value), false)}
            onMouseUp={() => void regenerate()}
            onTouchEnd={() => void regenerate()}
            className="w-full accent-accent"
          />
        </div>
      )}
    </div>
  );
}

const mm = (n: number) => `${Math.round(n)} mm`;

/** Human-readable cross-section dimensions from an element's geometry params. */
function describeDimensions(p: import("@flowcad/shared").ElementParams): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  // Transition: show both ends.
  if (p.fromShape != null || p.toShape != null) {
    rows.push({ label: "변환 (입구)", value: sectionText(p.fromShape, p.fromWidth, p.fromHeight, p.fromRadius) });
    rows.push({ label: "변환 (출구)", value: sectionText(p.toShape, p.toWidth, p.toHeight, p.toRadius) });
    return rows;
  }
  if (p.width != null || p.height != null) {
    rows.push({ label: "단면 (W×H)", value: `${Math.round(p.width ?? 0)} × ${Math.round(p.height ?? 0)} mm` });
  } else if (p.radius != null) {
    rows.push({ label: "직경 (Ø)", value: mm(p.radius * 2) });
  }
  if (p.bendRadius != null) rows.push({ label: "곡률반경 (R)", value: mm(p.bendRadius) });
  return rows;
}

function sectionText(
  shape: "rectangular" | "round" | undefined,
  width: number | undefined,
  height: number | undefined,
  radius: number | undefined,
): string {
  if (shape === "round" || (radius != null && width == null)) {
    return radius != null ? `Ø ${mm(radius * 2)}` : "원형";
  }
  return `${Math.round(width ?? 0)} × ${Math.round(height ?? 0)} mm`;
}

function Row({ label, value, isHighlight }: { label: string; value: string; isHighlight?: boolean }) {
  return (
    <div className={`flex justify-between gap-2 ${isHighlight ? 'bg-red-500/20 p-2 rounded border border-red-500/40 text-red-200 font-medium whitespace-pre-wrap flex-col' : ''}`}>
      <span className={isHighlight ? "text-red-400 font-bold mb-1" : "text-gray-500"}>{label}</span>
      <span className={`font-mono text-right break-all ${isHighlight ? 'text-left text-red-100' : 'text-gray-200'}`}>{value}</span>
    </div>
  );
}

