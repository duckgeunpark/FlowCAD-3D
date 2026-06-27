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
  item_no: "부품 번호",
  item_type: "부품 종류",
  connect_to_seq: "연결 대상",
  connect_port: "연결 포트",
  joint_nos: "조인트 No",
  direction: "방향",
  length: "길이(mm)",
  nominal: "호칭경",
  schedule: "스케줄",
  shape: "형상",
  width: "폭",
  height: "높이",
  diameter: "직경",
  material: "자재 재질",
  rotation: "회전°",
  drawing_no: "도면번호",
  fitting_no: "피팅번호",
};

const PLACEHOLDERS: Record<string, string> = {
  seq: "1",
  item_no: "item 1",
  item_type: "pipe/duct/elbow",
  connect_to_seq: "1",
  connect_port: "end/out",
  joint_nos: "sw001, sw002",
  direction: "E/N/U",
  length: "2000",
  nominal: "100A",
  schedule: "Sch40",
  shape: "rectangular/round",
  material: "Galvanized",
  rotation: "0",
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
    blank.seq = rows.length + 1;
    blank.item_no = `item ${rows.length + 1}`;
    blank.item_type = mode === "pipe" ? "pipe" : "duct";
    blank.connect_to_seq = rows.length > 0 ? rows.length : "";
    blank.connect_port = rows.length > 0 ? "end" : "start";
    blank.direction = "E";
    blank.length = 1000;
    const lastRow = rows[rows.length - 1];
    if (lastRow) {
      blank.material = lastRow.material ?? "";
      if (mode === "pipe") {
        blank.nominal = lastRow.nominal ?? "100A";
        blank.schedule = lastRow.schedule ?? "Sch40";
      } else {
        blank.shape = lastRow.shape ?? "rectangular";
        blank.width = lastRow.width ?? 400;
        blank.height = lastRow.height ?? 300;
      }
    } else {
      if (mode === "pipe") {
        blank.nominal = "100A";
        blank.schedule = "Sch40";
        blank.material = "Carbon Steel";
      } else {
        blank.shape = "rectangular";
        blank.width = 400;
        blank.height = 300;
        blank.material = "Galvanized";
      }
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
            부품 단위로 행을 작성하며, 동일한 조인트 번호(예: sw002)를 공유하는 부품은 자동으로 연결 및 사양을 상속받습니다. 단면 불일치 시 3D 공간에 경고 마커(❗)가 표출됩니다.
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
