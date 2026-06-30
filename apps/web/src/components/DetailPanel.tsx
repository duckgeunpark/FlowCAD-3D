"use client";

import { useEffect, useState } from "react";
import type { KeyboardEvent } from "react";
import { getFitting, type SceneElement } from "@flowcad/shared";
import { useViewerStore } from "@/store/useViewerStore";
import { rowElementId } from "@/lib/sampleData";

const LABELS: Record<string, string> = {
  drawingNo: "도면번호",
  fittingNo: "피팅번호",
  jointNo: "조인트",
  jointNos: "조인트",
  itemNo: "아이템",
  spec: "규격",
  material: "재질",
  sheetGauge: "두께",
  stiffenerSpec: "보강재",
  maxSpacing: "최대 간격",
  materialSpec: "재질 규격",
  error: "오류",
  length_mm: "길이",
};

const PART_TYPE_LABEL: Record<string, string> = {
  straight: "직관",
  rect_straight: "각 덕트 직관",
  round_straight: "원형 덕트 직관",
  elbow: "엘보",
  rect_elbow: "각 덕트 엘보",
  round_elbow: "원형 덕트 엘보",
  tee: "티",
  rect_tee: "각 덕트 티",
  round_tee: "원형 덕트 티",
  wye: "와이 분기",
  cross: "크로스 분기",
  tap: "탭(측면 분기)",
  splitter: "스플리터",
  cap: "캡(막음)",
  valve: "밸브",
  damper: "댐퍼",
  reducer: "레듀서",
  reducer_conc: "동심 레듀서",
  reducer_ecc: "편심 레듀서",
  transition: "변환",
  transform: "변환",
  rect_to_round: "각-원 변환",
  round_to_rect: "원-각 변환",
};

export function DetailPanel() {
  const { scene, selectedId, select, rotateFitting } = useViewerStore();
  const element = scene?.elements.find((e) => e.id === selectedId);
  if (!element) return null;

  const isError = element.kind === "error_marker";
  const canRotate = ["elbow", "tee", "wye", "cross", "tap", "splitter", "valve", "damper", "transition"].includes(element.kind);
  const rectangular = element.params.width != null || element.params.height != null;
  const rotateStep = rectangular ? 90 : 15;

  return (
    <div className={`absolute top-3 right-3 w-72 bg-panel/95 backdrop-blur border ${isError ? "border-red-500/80 shadow-red-900/50" : "border-panelLight"} rounded-lg shadow-xl`}>
      <div className={`flex items-center justify-between px-3 py-2 border-b ${isError ? "border-red-500/50 bg-red-500/20" : "border-panelLight"}`}>
        <span className={`text-sm font-medium ${isError ? "text-red-300 font-bold" : ""}`}>
          {isError ? "연결 경고" : "아이템 상세"}
        </span>
        <button onClick={() => select(null)} className="text-gray-500 hover:text-white">x</button>
      </div>
      <div className="p-3 space-y-1.5 text-xs">
        {!isError && <Row label="아이템" value={element.itemNo || "-"} />}
        <Row label="종류" value={kindLabel(element)} />
        <Row label="ID" value={element.id} />
        {!isError && <DimensionEditor element={element} />}
        {!isError && <LengthEditor element={element} />}
        {Object.entries(element.userData).map(([k, v]) => (
          <Row key={k} label={LABELS[k] ?? k} value={v || "-"} isHighlight={k === "error"} />
        ))}
        {canRotate && (
          <div className="pt-2 mt-2 border-t border-panelLight">
            <div className="flex items-center justify-between mb-1">
              <span className="text-gray-400">회전</span>
              <span className="font-mono text-gray-200">
                {Math.round(element.params.rollDeg ?? 0)}도
              </span>
            </div>
            <div className="grid grid-cols-2 gap-1">
              <button
                onClick={() => rotateFitting(element.id, -rotateStep)}
                className="px-2 py-1 rounded bg-panelLight hover:bg-[#222b37]"
              >
                -{rotateStep}
              </button>
              <button
                onClick={() => rotateFitting(element.id, rotateStep)}
                className="px-2 py-1 rounded bg-panelLight hover:bg-[#222b37]"
              >
                +{rotateStep}
              </button>
            </div>
          </div>
        )}
        <div className="pt-2 mt-2 border-t border-panelLight">
          <div className="text-gray-400 mb-1">조인트</div>
          <div className="space-y-1">
            {element.joints.length === 0 ? (
              <div className="text-gray-500">-</div>
            ) : (
              element.joints.map((joint) => (
                <div key={joint.id} className="flex justify-between gap-2 rounded bg-black/20 px-2 py-1">
                  <span className="font-mono text-gray-200">{joint.no}</span>
                  <span className={joint.open ? "text-emerald-300" : "text-gray-400"}>
                    {joint.role}{joint.open ? " 열림" : ""}
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

function kindLabel(element: SceneElement): string {
  const pt = element.userData.partType;
  if (pt && PART_TYPE_LABEL[pt]) return PART_TYPE_LABEL[pt];
  const catalog = pt ? getFitting(pt) : undefined;
  return catalog?.nameKo ?? element.kind;
}

function DimensionEditor({ element }: { element: SceneElement }) {
  const mode = useViewerStore((s) => s.mode);
  const rows = useViewerStore((s) => s.rows);
  const setRows = useViewerStore((s) => s.setRows);
  const regenerate = useViewerStore((s) => s.regenerate);

  const p = element.params;
  const isTransition = p.fromShape != null || p.toShape != null;
  const isRect = !isTransition && (p.width != null || p.height != null);
  const isRound = !isTransition && !isRect && p.radius != null;
  const rowIdx = rows.findIndex((r) => rowElementId(r, mode) === element.id);

  const [a, setA] = useState("");
  const [b, setB] = useState("");
  useEffect(() => {
    if (p.width != null || p.height != null) {
      setA(String(Math.round(p.width ?? 0)));
      setB(String(Math.round(p.height ?? 0)));
    } else if (p.radius != null) {
      setA(String(Math.round(p.radius * 2)));
    }
  }, [element.id, p.height, p.radius, p.width]);

  const editable = rowIdx >= 0 && (isRect || isRound);
  if (!editable) {
    const dims = describeDimensions(p);
    if (dims.length === 0) return null;
    return (
      <div className="pt-1.5 mt-1.5 border-t border-panelLight space-y-1.5">
        <div className="text-gray-400">치수</div>
        {dims.map((d) => <Row key={d.label} label={d.label} value={d.value} />)}
      </div>
    );
  }

  const commit = () => {
    const next = rows.map((r, i) => {
      if (i !== rowIdx) return r;
      // DUCT (v2) rows use width/height/diameter; PIPE (assembly) rows use the
      // size_a/size_b/W/H/D columns.
      if (mode === "duct") {
        return { ...r, ...(isRect ? { width: a, height: b } : { diameter: a }) };
      }
      return { ...r, size_a: a, ...(isRect ? { size_b: b, W: a, H: b } : { D: a }) };
    });
    setRows(next);
    void regenerate();
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
  };

  return (
    <div className="pt-1.5 mt-1.5 border-t border-panelLight space-y-1.5">
      <div className="text-gray-400">치수</div>
      <div className="flex items-center gap-2">
        {isRect ? (
          <>
            <DimInput label="W" value={a} onChange={setA} onCommit={commit} onKeyDown={onKey} />
            <span className="text-gray-600">x</span>
            <DimInput label="H" value={b} onChange={setB} onCommit={commit} onKeyDown={onKey} />
          </>
        ) : (
          <DimInput label="D" value={a} onChange={setA} onCommit={commit} onKeyDown={onKey} />
        )}
        <span className="text-gray-500 text-[11px]">mm</span>
      </div>
      {p.bendRadius != null && <Row label="R" value={mm(p.bendRadius)} />}
    </div>
  );
}

function LengthEditor({ element }: { element: SceneElement }) {
  const mode = useViewerStore((s) => s.mode);
  const rows = useViewerStore((s) => s.rows);
  const setRows = useViewerStore((s) => s.setRows);
  const regenerate = useViewerStore((s) => s.regenerate);

  const p = element.params;
  const partType = String(element.userData.partType ?? "").toLowerCase();
  const isAutoLen = ["elbow", "tee"].includes(partType) || element.kind === "elbow" || element.kind === "tee";
  const span = p.start && p.end
    ? Math.hypot(p.end[0] - p.start[0], p.end[1] - p.start[1], p.end[2] - p.start[2])
    : null;
  const rowIdx = rows.findIndex((r) => rowElementId(r, mode) === element.id);
  const row = rowIdx >= 0 ? rows[rowIdx] : undefined;
  const rowLen = mode === "duct" ? row?.centerline_length : row?.length;

  const [len, setLen] = useState("");
  useEffect(() => {
    setLen(rowLen != null && String(rowLen).trim() !== "" ? String(rowLen) : span != null ? String(Math.round(span)) : "");
  }, [element.id, rowLen, span]);

  if (span == null) return null;
  const editable = rowIdx >= 0 && !isAutoLen;
  if (!editable) {
    return (
      <div className="pt-1.5 mt-1.5 border-t border-panelLight">
        <Row label="길이" value={`${Math.round(span)} mm${isAutoLen ? " 자동" : ""}`} />
      </div>
    );
  }

  const commit = () => {
    setRows(rows.map((r, i) => {
      if (i !== rowIdx) return r;
      if (mode !== "duct") return { ...r, length: len, L: len };
      // v2 straight: keep centerline_length and the absolute end_* coords in sync
      // (end = origin + unit(dir) * length) so the rendered geometry updates.
      const L = Number(len) || 0;
      const ox = Number(r.origin_x ?? 0);
      const oy = Number(r.origin_y ?? 0);
      const oz = Number(r.origin_z ?? 0);
      let dx = Number(r.dir_x ?? 0);
      let dy = Number(r.dir_y ?? 0);
      let dz = Number(r.dir_z ?? 0);
      let mag = Math.hypot(dx, dy, dz);
      if (mag < 1e-9) {
        // No explicit dir_*: derive heading from the current end - origin so the
        // edit keeps the run's direction instead of collapsing to zero length.
        dx = Number(r.end_x ?? 0) - ox;
        dy = Number(r.end_y ?? 0) - oy;
        dz = Number(r.end_z ?? 0) - oz;
        mag = Math.hypot(dx, dy, dz);
      }
      mag = mag || 1;
      dx /= mag; dy /= mag; dz /= mag;
      return {
        ...r,
        centerline_length: len,
        end_x: ox + dx * L,
        end_y: oy + dy * L,
        end_z: oz + dz * L,
      };
    }));
    void regenerate();
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") (e.target as HTMLInputElement).blur();
  };

  return (
    <div className="pt-1.5 mt-1.5 border-t border-panelLight space-y-1.5">
      <div className="text-gray-400">길이</div>
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

const mm = (n: number) => `${Math.round(n)} mm`;

function describeDimensions(p: import("@flowcad/shared").ElementParams): { label: string; value: string }[] {
  const rows: { label: string; value: string }[] = [];
  if (p.fromShape != null || p.toShape != null) {
    rows.push({ label: "입구", value: sectionText(p.fromShape, p.fromWidth, p.fromHeight, p.fromRadius) });
    rows.push({ label: "출구", value: sectionText(p.toShape, p.toWidth, p.toHeight, p.toRadius) });
    return rows;
  }
  if (p.width != null || p.height != null) {
    rows.push({ label: "W x H", value: `${Math.round(p.width ?? 0)} x ${Math.round(p.height ?? 0)} mm` });
  } else if (p.radius != null) {
    rows.push({ label: "D", value: mm(p.radius * 2) });
  }
  if (p.bendRadius != null) rows.push({ label: "R", value: mm(p.bendRadius) });
  return rows;
}

function sectionText(
  shape: "rectangular" | "round" | "oval" | "flat_oval" | undefined,
  width: number | undefined,
  height: number | undefined,
  radius: number | undefined,
): string {
  if (shape === "round" || (radius != null && width == null)) {
    return radius != null ? `D ${mm(radius * 2)}` : "원형";
  }
  return `${Math.round(width ?? 0)} x ${Math.round(height ?? 0)} mm`;
}

function Row({ label, value, isHighlight }: { label: string; value: string; isHighlight?: boolean }) {
  return (
    <div className={`flex justify-between gap-2 ${isHighlight ? "bg-red-500/20 p-2 rounded border border-red-500/40 text-red-200 font-medium whitespace-pre-wrap flex-col" : ""}`}>
      <span className={isHighlight ? "text-red-400 font-bold mb-1" : "text-gray-500"}>{label}</span>
      <span className={`font-mono text-right break-all ${isHighlight ? "text-left text-red-100" : "text-gray-200"}`}>{value}</span>
    </div>
  );
}
