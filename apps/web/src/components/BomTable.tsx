"use client";

import { useViewerStore } from "@/store/useViewerStore";

/** Bill of Materials with two-way highlight linkage to the 3D viewer. */
export function BomTable() {
  const { scene, selectedId, select, hover } = useViewerStore();
  const bom = scene?.bom ?? [];

  return (
    <div className="flex flex-col h-full">
      <div className="px-3 py-2 border-b border-panelLight text-sm font-medium text-gray-200">
        BOM 자재명세 {bom.length > 0 && <span className="text-gray-500">({bom.length})</span>}
      </div>
      <div className="overflow-auto flex-1">
        {bom.length === 0 ? (
          <div className="p-3 text-xs text-gray-500">생성된 부재가 없습니다.</div>
        ) : (
          <table className="text-xs w-full border-collapse">
            <thead className="sticky top-0 bg-panel text-gray-400">
              <tr>
                {["Item", "Joints", "부재", "Spec", "길이(mm)"].map((h) => (
                  <th key={h} className="px-2 py-1 text-left font-normal border-b border-panelLight">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bom.map((row) => (
                <tr
                  key={row.elementId}
                  onClick={() => select(row.elementId)}
                  onMouseEnter={() => hover(row.elementId)}
                  onMouseLeave={() => hover(null)}
                  className={`cursor-pointer border-b border-panelLight/50 ${
                    selectedId === row.elementId ? "bg-accent/30" : "hover:bg-panelLight/40"
                  }`}
                >
                  <td className="px-2 py-1 font-mono">{row.itemNo || row.elementId}</td>
                  <td className="px-2 py-1 font-mono text-[11px]">{row.jointNos || row.jointNo || "-"}</td>
                  <td className="px-2 py-1">{row.description}</td>
                  <td className="px-2 py-1 text-gray-400">{row.spec}</td>
                  <td className="px-2 py-1 text-right">{row.lengthMm ? row.lengthMm.toFixed(0) : "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
