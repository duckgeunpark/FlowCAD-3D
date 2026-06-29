"use client";

import { useEffect, useState } from "react";
import type { DesignMode, ExportAvailability, ExportFormat } from "@flowcad/shared";
import { downloadExport, fetchExportAvailability } from "@/lib/api";
import { useViewerStore } from "@/store/useViewerStore";
import type { TableRow } from "@/lib/sampleData";

const FORMATS: { fmt: ExportFormat; label: string; hint: string }[] = [
  { fmt: "dxf", label: "DXF", hint: "AutoCAD 3D" },
  { fmt: "pdf", label: "PDF", hint: "ISO 도면" },
  { fmt: "ifc", label: "IFC", hint: "Revit / Navisworks" },
  { fmt: "step", label: "STEP", hint: "SolidWorks / CATIA" },
];

interface ExportBarProps {
  mode: DesignMode;
  rows: TableRow[];
}

export function ExportBar({ mode, rows }: ExportBarProps) {
  const { scene, setError } = useViewerStore();
  const [availability, setAvailability] = useState<ExportAvailability | null>(null);
  const [busy, setBusy] = useState<ExportFormat | null>(null);

  useEffect(() => {
    fetchExportAvailability().then(setAvailability).catch(() => setAvailability(null));
  }, []);

  const handleExport = async (fmt: ExportFormat) => {
    setBusy(fmt);
    setError(null);
    try {
      await downloadExport(mode, rows as Record<string, unknown>[], fmt);
    } catch (e) {
      setError(e instanceof Error ? e.message : "내보내기 실패");
    } finally {
      setBusy(null);
    }
  };

  const hasScene = !!scene && scene.elements.length > 0;

  return (
    <div className="flex items-center gap-1.5 px-3 py-2 border-t border-panelLight bg-panel">
      <span className="text-xs text-gray-400 mr-1">내보내기</span>
      {FORMATS.map(({ fmt, label, hint }) => {
        const unavailable = availability ? !availability[fmt] : false;
        const disabled = !hasScene || unavailable || busy !== null;
        return (
          <button
            key={fmt}
            onClick={() => handleExport(fmt)}
            disabled={disabled}
            title={unavailable ? `${hint} 서버 백엔드 미설치` : hint}
            className={`px-2.5 py-1 rounded text-xs font-medium transition-colors ${
              disabled
                ? "bg-panelLight/50 text-gray-600 cursor-not-allowed"
                : "bg-panelLight text-gray-200 hover:bg-accent hover:text-white"
            }`}
          >
            {busy === fmt ? "준비 중" : label}
            {unavailable && <span className="ml-1 text-[10px]">미지원</span>}
          </button>
        );
      })}
    </div>
  );
}
