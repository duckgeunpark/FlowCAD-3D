"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef } from "react";
import { Toolbar } from "@/components/Toolbar";
import { FittingPicker } from "@/components/FittingPicker";
import { TableEditor } from "@/components/TableEditor";
import { ExportBar } from "@/components/ExportBar";
import { DetailPanel } from "@/components/DetailPanel";
import { DiagnosticsPanel } from "@/components/DiagnosticsPanel";
import { sampleRowsFor, type TableRow } from "@/lib/sampleData";
import { useViewerStore } from "@/store/useViewerStore";
import type { DesignMode } from "@flowcad/shared";

// The 3D canvas must only render client-side (WebGL); skip SSR.
const Viewer = dynamic(
  () => import("@/components/Viewer").then((m) => m.Viewer),
  { ssr: false },
);

// localStorage key for the working project (auto-saved so a refresh keeps edits).
const STORAGE_KEY = "flowcad.project.v1";

interface ProjectFile {
  app?: string;
  version?: number;
  mode: DesignMode;
  rows: TableRow[];
}

function readSavedProject(): ProjectFile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      (parsed.mode === "pipe" || parsed.mode === "duct") &&
      Array.isArray(parsed.rows)
    ) {
      return parsed as ProjectFile;
    }
  } catch {
    /* ignore corrupt storage */
  }
  return null;
}

export default function Home() {
  const { mode, setMode, rows, setRows, regenerate, error } = useViewerStore();
  const fileInput = useRef<HTMLInputElement>(null);

  // When a project load changes the mode, the mode-reset effect below must NOT
  // clobber the loaded rows with a fresh sample.
  const skipReset = useRef(false);
  const prevMode = useRef<DesignMode>(mode);

  // Restore the saved project once on mount (rows live in the store now).
  useEffect(() => {
    const saved = readSavedProject();
    if (!saved) return;
    if (saved.mode !== mode) {
      skipReset.current = true;
      setMode(saved.mode);
    }
    if (saved.rows.length) setRows(saved.rows);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reset rows to the matching sample whenever the user changes the design mode.
  useEffect(() => {
    if (prevMode.current === mode) return;
    prevMode.current = mode;
    if (skipReset.current) {
      skipReset.current = false;
      return;
    }
    setRows(sampleRowsFor(mode));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  // Auto-save the working project so a refresh does not lose edits.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ mode, rows }));
    } catch {
      /* storage may be full/blocked — non-fatal */
    }
  }, [mode, rows]);

  const handleSaveProject = () => {
    const payload: ProjectFile = { app: "FlowCAD-3D", version: 1, mode, rows };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `flowcad_project_${mode}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleOpenProject = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text()) as ProjectFile;
      if (
        (parsed.mode !== "pipe" && parsed.mode !== "duct") ||
        !Array.isArray(parsed.rows)
      ) {
        throw new Error("형식이 올바르지 않습니다");
      }
      if (parsed.mode !== mode) {
        skipReset.current = true;
        setMode(parsed.mode);
      }
      setRows(parsed.rows);
    } catch (e) {
      useViewerStore.getState().setError(
        e instanceof Error ? `프로젝트 열기 실패: ${e.message}` : "프로젝트 열기 실패",
      );
    }
  };

  return (
    <div className="flex flex-col h-full">
      <Toolbar
        onGenerate={() => void regenerate()}
        onLoadSample={() => setRows(sampleRowsFor(mode))}
        onSaveProject={handleSaveProject}
        onOpenProject={() => fileInput.current?.click()}
      />
      <input
        ref={fileInput}
        type="file"
        accept=".json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (file) void handleOpenProject(file);
        }}
      />

      {error && (
        <div className="px-4 py-1.5 bg-red-900/40 text-red-200 text-sm border-b border-red-800">
          ⚠ {error}
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        <aside className="w-[460px] flex flex-col border-r border-panelLight bg-panel/60 shadow-lg">
          <FittingPicker />
          <div className="flex-1 min-h-0 flex flex-col">
            <TableEditor mode={mode} rows={rows} onChange={setRows} />
          </div>

          <DiagnosticsPanel />

          <div className="border-t border-panelLight bg-panel/40">
            <ExportBar mode={mode} rows={rows} />
          </div>
        </aside>

        <main className="relative flex-1 min-w-0">
          <Viewer />
          <DetailPanel />
        </main>
      </div>
    </div>
  );
}
