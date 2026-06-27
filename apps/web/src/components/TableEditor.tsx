"use client";

import { useRef, useState } from "react";
import type { DesignMode } from "@flowcad/shared";
import { columnsFor, type TableRow } from "@/lib/sampleData";
import { downloadTemplate, uploadTable } from "@/lib/api";
import { useViewerStore } from "@/store/useViewerStore";

interface TableEditorProps {
  mode: DesignMode;
  rows: TableRow[];
  onChange: (rows: TableRow[]) => void;
}

export function TableEditor({ mode, rows, onChange }: TableEditorProps) {
  const columns = columnsFor(mode);
  const setError = useViewerStore((s) => s.setError);
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const handleTemplate = async () => {
    setError(null);
    try {
      await downloadTemplate(mode);
    } catch (e) {
      setError(e instanceof Error ? e.message : "템플릿 다운로드 실패");
    }
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-uploading the same file
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const loaded = await uploadTable(file);
      if (loaded.length === 0) {
        setError("파일에 데이터 행이 없습니다.");
      } else {
        onChange(loaded as TableRow[]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "파일 업로드 실패");
    } finally {
      setBusy(false);
    }
  };

  const update = (rowIdx: number, col: string, value: string) => {
    const next = rows.map((r, i) => (i === rowIdx ? { ...r, [col]: value } : r));
    onChange(next);
  };

  const addRow = () => {
    const blank: TableRow = Object.fromEntries(columns.map((c) => [c, ""]));
    blank.run_id = rows[rows.length - 1]?.run_id ?? "R1";
    blank.seq = rows.length + 1;
    onChange([...rows, blank]);
  };

  const removeRow = (idx: number) =>
    onChange(rows.filter((_, i) => i !== idx));

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-panelLight">
        <span className="text-sm font-medium text-gray-200 whitespace-nowrap">입력 테이블</span>
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleTemplate}
            title="헤더만 있는 빈 Excel 템플릿을 받아 값을 채워 넣으세요"
            className="text-xs px-2 py-1 rounded bg-panelLight hover:bg-[#222b37]"
          >
            ⬇ 빈 Excel
          </button>
          <button
            onClick={() => fileInput.current?.click()}
            disabled={busy}
            title="채운 Excel/CSV 파일을 불러와 테이블에 채웁니다"
            className="text-xs px-2 py-1 rounded bg-panelLight hover:bg-[#222b37] disabled:opacity-50"
          >
            {busy ? "…" : "⬆ 파일"}
          </button>
          <button onClick={addRow} className="text-xs px-2 py-1 rounded bg-panelLight hover:bg-[#222b37]">
            + 행
          </button>
          <input
            ref={fileInput}
            type="file"
            accept=".xlsx,.xlsm,.csv"
            onChange={handleUpload}
            className="hidden"
          />
        </div>
      </div>
      <div className="overflow-auto flex-1">
        <table className="text-xs w-full border-collapse">
          <thead className="sticky top-0 bg-panel">
            <tr>
              {columns.map((c) => (
                <th key={c} className="px-1.5 py-1 text-left text-gray-400 font-normal whitespace-nowrap border-b border-panelLight">
                  {c}
                </th>
              ))}
              <th className="border-b border-panelLight" />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rIdx) => (
              <tr key={rIdx} className="hover:bg-panelLight/40">
                {columns.map((c) => (
                  <td key={c} className="border-b border-panelLight/50 p-0">
                    <input
                      value={String(row[c] ?? "")}
                      onChange={(e) => update(rIdx, c, e.target.value)}
                      className="w-20 bg-transparent px-1.5 py-1 outline-none focus:bg-panelLight"
                    />
                  </td>
                ))}
                <td className="border-b border-panelLight/50 text-center">
                  <button
                    onClick={() => removeRow(rIdx)}
                    className="text-gray-500 hover:text-red-400 px-1"
                    title="행 삭제"
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
