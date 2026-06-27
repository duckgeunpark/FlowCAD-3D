"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { Toolbar } from "@/components/Toolbar";
import { TableEditor } from "@/components/TableEditor";
import { BomTable } from "@/components/BomTable";
import { ExportBar } from "@/components/ExportBar";
import { DetailPanel } from "@/components/DetailPanel";
import { generateScene } from "@/lib/api";
import { sampleRowsFor, type TableRow } from "@/lib/sampleData";
import { useViewerStore } from "@/store/useViewerStore";

// The 3D canvas must only render client-side (WebGL); skip SSR.
const Viewer = dynamic(
  () => import("@/components/Viewer").then((m) => m.Viewer),
  { ssr: false },
);

export default function Home() {
  const { mode, setScene, setError, setLoading, error } = useViewerStore();
  const [rows, setRows] = useState<TableRow[]>(() => sampleRowsFor("pipe"));

  // Reset rows to the matching sample whenever the design mode changes.
  useEffect(() => {
    setRows(sampleRowsFor(mode));
  }, [mode]);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);
    try {
      const scene = await generateScene(mode, rows as Record<string, unknown>[]);
      setScene(scene);
    } catch (e) {
      setError(e instanceof Error ? e.message : "알 수 없는 오류");
      setScene(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <Toolbar onGenerate={handleGenerate} onLoadSample={() => setRows(sampleRowsFor(mode))} />

      {error && (
        <div className="px-4 py-1.5 bg-red-900/40 text-red-200 text-sm border-b border-red-800">
          ⚠ {error}
        </div>
      )}

      <div className="flex flex-1 min-h-0">
        <aside className="w-[440px] flex flex-col border-r border-panelLight bg-panel/60">
          <div className="h-1/2 min-h-0 border-b border-panelLight">
            <TableEditor mode={mode} rows={rows} onChange={setRows} />
          </div>
          <div className="h-1/2 min-h-0 flex flex-col">
            <div className="flex-1 min-h-0">
              <BomTable />
            </div>
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
