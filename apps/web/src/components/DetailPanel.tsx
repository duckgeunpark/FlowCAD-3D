"use client";

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
  const dimensions = describeDimensions(element.params);

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
        <Row label="종류" value={element.kind} />
        <Row label="ID" value={element.id} />
        {!isError && dimensions.length > 0 && (
          <div className="pt-1.5 mt-1.5 border-t border-panelLight space-y-1.5">
            <div className="text-gray-400">치수</div>
            {dimensions.map((d) => (
              <Row key={d.label} label={d.label} value={d.value} />
            ))}
          </div>
        )}
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

