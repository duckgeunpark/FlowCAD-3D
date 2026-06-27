"use client";

import { useMemo, useState } from "react";
import type { BomRow } from "@flowcad/shared";
import { useViewerStore } from "@/store/useViewerStore";

type BomView = "detail" | "summary";

interface SummaryRow {
  description: string;
  spec: string;
  quantity: number;
  totalLength: number;
}

/** Aggregate BOM rows into a quantity takeoff grouped by (부재, Spec). */
function summarize(bom: BomRow[]): SummaryRow[] {
  const groups = new Map<string, SummaryRow>();
  for (const row of bom) {
    const key = `${row.description}||${row.spec}`;
    const existing = groups.get(key);
    if (existing) {
      existing.quantity += 1;
      existing.totalLength += row.lengthMm || 0;
    } else {
      groups.set(key, {
        description: row.description,
        spec: row.spec,
        quantity: 1,
        totalLength: row.lengthMm || 0,
      });
    }
  }
  return [...groups.values()].sort(
    (a, b) =>
      a.description.localeCompare(b.description) || a.spec.localeCompare(b.spec),
  );
}

function toCsv(rows: (string | number)[][]): string {
  const escape = (v: string | number) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  // Prepend a UTF-8 BOM so Excel reads Korean headers correctly.
  return "﻿" + rows.map((r) => r.map(escape).join(",")).join("\r\n");
}

function download(filename: string, content: string): void {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Bill of Materials with detail/summary views, CSV takeoff, and 3D linkage. */
export function BomTable() {
  const { scene, selectedId, select, hover } = useViewerStore();
  const bom = scene?.bom ?? [];
  const [view, setView] = useState<BomView>("detail");

  const summary = useMemo(() => summarize(bom), [bom]);
  const totalLength = useMemo(
    () => bom.reduce((sum, r) => sum + (r.lengthMm || 0), 0),
    [bom],
  );

  const exportCsv = () => {
    if (view === "summary") {
      const rows: (string | number)[][] = [
        ["부재", "Spec", "수량", "총길이(mm)"],
        ...summary.map((s) => [s.description, s.spec, s.quantity, s.totalLength.toFixed(0)]),
        ["합계", "", bom.length, totalLength.toFixed(0)],
      ];
      download("flowcad_bom_물량.csv", toCsv(rows));
    } else {
      const rows: (string | number)[][] = [
        ["Item", "Joints", "부재", "Spec", "길이(mm)"],
        ...bom.map((r) => [
          r.itemNo || r.elementId,
          r.jointNos || r.jointNo || "",
          r.description,
          r.spec,
          r.lengthMm ? r.lengthMm.toFixed(0) : "",
        ]),
      ];
      download("flowcad_bom_상세.csv", toCsv(rows));
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-panelLight">
        <div className="text-sm font-medium text-gray-200">
          BOM 자재명세{" "}
          {bom.length > 0 && <span className="text-gray-500">({bom.length})</span>}
        </div>
        <div className="flex items-center gap-1.5">
          <div className="flex rounded bg-panelLight p-0.5 text-[11px]">
            {(["detail", "summary"] as BomView[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-2 py-0.5 rounded transition-colors ${
                  view === v ? "bg-accent text-white" : "text-gray-300 hover:text-white"
                }`}
              >
                {v === "detail" ? "상세" : "물량 집계"}
              </button>
            ))}
          </div>
          <button
            onClick={exportCsv}
            disabled={bom.length === 0}
            title="현재 보기를 CSV로 내보내기"
            className="text-xs px-2 py-1 rounded bg-panelLight hover:bg-[#222b37] disabled:opacity-50"
          >
            CSV
          </button>
        </div>
      </div>
      <div className="overflow-auto flex-1">
        {bom.length === 0 ? (
          <div className="p-3 text-xs text-gray-500">생성된 부재가 없습니다.</div>
        ) : view === "detail" ? (
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
        ) : (
          <table className="text-xs w-full border-collapse">
            <thead className="sticky top-0 bg-panel text-gray-400">
              <tr>
                {["부재", "Spec", "수량", "총길이(mm)"].map((h, i) => (
                  <th
                    key={h}
                    className={`px-2 py-1 font-normal border-b border-panelLight ${
                      i >= 2 ? "text-right" : "text-left"
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {summary.map((s) => (
                <tr key={`${s.description}||${s.spec}`} className="border-b border-panelLight/50 hover:bg-panelLight/40">
                  <td className="px-2 py-1">{s.description}</td>
                  <td className="px-2 py-1 text-gray-400">{s.spec || "-"}</td>
                  <td className="px-2 py-1 text-right font-mono">{s.quantity}</td>
                  <td className="px-2 py-1 text-right font-mono">
                    {s.totalLength ? s.totalLength.toFixed(0) : "-"}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="sticky bottom-0 bg-panel">
              <tr className="border-t border-panelLight font-semibold text-gray-200">
                <td className="px-2 py-1">합계</td>
                <td className="px-2 py-1" />
                <td className="px-2 py-1 text-right font-mono">{bom.length}</td>
                <td className="px-2 py-1 text-right font-mono">{totalLength.toFixed(0)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </div>
    </div>
  );
}
