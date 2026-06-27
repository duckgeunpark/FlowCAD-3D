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

const LABELS: Record<string, string> = {
  seq: "순번",
  system_type: "계통",
  part_type: "부품 종류",
  spec: "규격코드",
  size_a: "치수A",
  size_b: "치수B",
  length: "길이(mm)",
  angle: "각도°",
  connect_to_seq: "연결 대상",
  connect_port: "연결 포트",
  note: "비고",
};

const PLACEHOLDERS: Record<string, string> = {
  seq: "1",
  system_type: "pipe/duct",
  part_type: "straight/elbow/tee/reducer",
  spec: "SCH40 / GI",
  size_a: "직경 또는 가로",
  size_b: "세로(사각만)",
  length: "2000",
  angle: "45 / 90",
  connect_to_seq: "1",
  connect_port: "end/out/branch",
  note: "비고",
};

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
    e.target.value = "";
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
    const lastRow = rows[rows.length - 1];
    blank.seq = rows.length + 1;
    blank.system_type = mode;
    blank.part_type = "straight";
    blank.connect_to_seq = rows.length > 0 ? rows.length : "";
    blank.connect_port = rows.length > 0 ? "end" : "start";
    blank.length = 1000;
    if (mode === "pipe") {
      blank.spec = lastRow?.spec ?? "SCH40";
      blank.size_a = lastRow?.size_a ?? 100;
    } else {
      blank.spec = lastRow?.spec ?? "GI";
      blank.size_a = lastRow?.size_a ?? 500;
      blank.size_b = lastRow?.size_b ?? 300;
    }
    onChange([...rows, blank]);
  };

  const removeRow = (idx: number) =>
    onChange(rows.filter((_, i) => i !== idx));

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-panelLight">
        <div>
          <div className="text-sm font-medium text-gray-200 whitespace-nowrap">입력 테이블</div>
          <div className="text-[11px] text-gray-500">
            좌표 없이 <b>연결 대상(seq)</b>·<b>연결 포트</b>·<b>각도</b>만 입력하면 위치·방향이 자동 계산됩니다. 규격이 비면 연결된 부품에서 상속되며, 단면 불일치 시 3D 공간에 경고 마커(❗)가 표출됩니다.
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={handleTemplate}
            title="빈 Excel 템플릿 다운로드"
            className="text-xs px-2 py-1 rounded bg-panelLight hover:bg-[#222b37]"
          >
            Excel
          </button>
          <button
            onClick={() => fileInput.current?.click()}
            disabled={busy}
            title="Excel/CSV 파일 불러오기"
            className="text-xs px-2 py-1 rounded bg-panelLight hover:bg-[#222b37] disabled:opacity-50"
          >
            {busy ? "…" : "파일"}
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
                  {LABELS[c] ?? c}
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
                      placeholder={PLACEHOLDERS[c] ?? ""}
                      onChange={(e) => update(rIdx, c, e.target.value)}
                      className="w-24 bg-transparent px-1.5 py-1 outline-none focus:bg-panelLight placeholder:text-gray-700"
                    />
                  </td>
                ))}
                <td className="border-b border-panelLight/50 text-center">
                  <button
                    onClick={() => removeRow(rIdx)}
                    className="text-gray-500 hover:text-red-400 px-1"
                    title="삭제"
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
