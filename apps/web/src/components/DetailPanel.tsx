"use client";

import { useViewerStore } from "@/store/useViewerStore";

const LABELS: Record<string, string> = {
  drawingNo: "도면번호",
  fittingNo: "피팅번호",
  jointNo: "대표 조인트",
  itemNo: "아이템번호",
  spec: "스펙",
  length_mm: "길이(mm)",
};

/** Right-side detail panel shown when a 3D element is selected. */
export function DetailPanel() {
  const { scene, selectedId, select } = useViewerStore();
  const element = scene?.elements.find((e) => e.id === selectedId);
  if (!element) return null;

  return (
    <div className="absolute top-3 right-3 w-72 bg-panel/95 backdrop-blur border border-panelLight rounded-lg shadow-xl">
      <div className="flex items-center justify-between px-3 py-2 border-b border-panelLight">
        <span className="text-sm font-medium">아이템 상세</span>
        <button onClick={() => select(null)} className="text-gray-500 hover:text-white">×</button>
      </div>
      <div className="p-3 space-y-1.5 text-xs">
        <Row label="아이템번호" value={element.itemNo || "-"} />
        <Row label="종류" value={element.kind} />
        <Row label="ID" value={element.id} />
        {Object.entries(element.userData).map(([k, v]) => (
          <Row key={k} label={LABELS[k] ?? k} value={v || "-"} />
        ))}
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-gray-500">{label}</span>
      <span className="font-mono text-gray-200 text-right break-all">{value}</span>
    </div>
  );
}
