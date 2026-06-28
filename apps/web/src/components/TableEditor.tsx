"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DesignMode } from "@flowcad/shared";
import type { DiagnosticLevel } from "@flowcad/shared";
import { columnsFor, type TableRow } from "@/lib/sampleData";
import { downloadTemplate, uploadTable } from "@/lib/api";
import { diagnosticsBySeq, useViewerStore, worstLevel } from "@/store/useViewerStore";
import { summarize, toCsv, download } from "@/lib/bom";

// Row tint + left accent by worst diagnostic level (Plan_v2 §사용성: 오류 행 하이라이트).
const ROW_TINT: Record<DiagnosticLevel, string> = {
  error: "bg-red-900/30 hover:bg-red-900/40",
  warning: "bg-amber-900/25 hover:bg-amber-900/35",
  info: "bg-sky-900/20 hover:bg-sky-900/30",
};
const LEVEL_ICON: Record<DiagnosticLevel, string> = { error: "❗", warning: "⚠", info: "ⓘ" };

type TableView = "input" | "summary";

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
  const scene = useViewerStore((s) => s.scene);
  const select = useViewerStore((s) => s.select);
  const selected = useViewerStore((s) => s.selectedId);
  const regenerate = useViewerStore((s) => s.regenerate);
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<TableView>("input");
  const selectedRowRef = useRef<HTMLTableRowElement>(null);

  const diagBySeq = diagnosticsBySeq(scene);
  const bom = scene?.bom ?? [];
  const summary = useMemo(() => summarize(bom), [bom]);
  const totalLength = useMemo(
    () => bom.reduce((sum, r) => sum + (r.lengthMm || 0), 0),
    [bom],
  );

  // Scroll the row picked in 3D into view so selection feels linked both ways.
  useEffect(() => {
    if (view === "input" && selected) {
      selectedRowRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [selected, view]);

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

  const removeRow = (idx: number) => {
    const removedSeq = String(rows[idx]?.seq ?? "").trim();
    onChange(rows.filter((_, i) => i !== idx));
    // Drop the selection if it pointed at the removed item, then rebuild the
    // scene so the 3D view loses the part immediately (not just on next 생성).
    if (removedSeq && selected === `A${removedSeq}`) select(null);
    void regenerate();
  };

  const exportCsv = () => {
    if (view === "summary") {
      const csvRows: (string | number)[][] = [
        ["부재", "Spec", "수량", "총길이(mm)"],
        ...summary.map((s) => [s.description, s.spec, s.quantity, s.totalLength.toFixed(0)]),
        ["합계", "", bom.length, totalLength.toFixed(0)],
      ];
      download("flowcad_물량집계.csv", toCsv(csvRows));
    } else {
      const csvRows: (string | number)[][] = [
        columns.map((c) => LABELS[c] ?? c),
        ...rows.map((r) => columns.map((c) => String(r[c] ?? ""))),
      ];
      download("flowcad_설계입력.csv", toCsv(csvRows));
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-2 px-3 py-2 border-b border-panelLight">
        <div className="flex items-center gap-2">
          <div className="flex rounded bg-panelLight p-0.5 text-[11px]">
            {(["input", "summary"] as TableView[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                className={`px-2.5 py-1 rounded font-semibold transition-colors ${
                  view === v ? "bg-accent text-white" : "text-gray-300 hover:text-white"
                }`}
              >
                {v === "input" ? "📋 설계 입력" : "📦 물량 집계"}
              </button>
            ))}
          </div>
          {view === "input" && (
            <span className="text-[11px] text-gray-500">{rows.length}개 부재</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {view === "input" ? (
            <>
              <button onClick={handleTemplate} title="빈 Excel 템플릿 다운로드"
                className="text-xs px-2 py-1 rounded bg-panelLight hover:bg-[#222b37]">Excel</button>
              <button onClick={() => fileInput.current?.click()} disabled={busy}
                title="Excel/CSV 파일 불러오기"
                className="text-xs px-2 py-1 rounded bg-panelLight hover:bg-[#222b37] disabled:opacity-50">
                {busy ? "…" : "파일"}
              </button>
              <button onClick={addRow} className="text-xs px-2 py-1 rounded bg-panelLight hover:bg-[#222b37]">+ 행</button>
            </>
          ) : null}
          <button onClick={exportCsv} disabled={view === "summary" && bom.length === 0}
            title="현재 보기를 CSV로 내보내기"
            className="text-xs px-2 py-1 rounded bg-panelLight hover:bg-[#222b37] disabled:opacity-50">CSV</button>
          <input ref={fileInput} type="file" accept=".xlsx,.xlsm,.csv" onChange={handleUpload} className="hidden" />
        </div>
      </div>

      {view === "input" && (
        <div className="px-3 py-1.5 border-b border-panelLight/60 text-[11px] text-gray-500">
          좌표 없이 <b>연결 대상(seq)</b>·<b>연결 포트</b>·<b>각도</b>만 입력하면 위치·방향이 자동 계산됩니다. 3D에서 부재를 클릭하면 해당 행이 강조되고, 행을 클릭하면 3D가 선택됩니다.
        </div>
      )}

      <div className="overflow-auto flex-1">
        {view === "input" ? (
          <table className="text-xs w-full border-collapse">
            <thead className="sticky top-0 bg-panel z-10">
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
              {rows.map((row, rIdx) => {
                const seqKey = String(row.seq ?? "").trim();
                const diags = seqKey ? diagBySeq.get(seqKey) ?? [] : [];
                const level = worstLevel(diags);
                const isSelected = !!seqKey && selected === `A${seqKey}`;
                // Corner fittings have no straight length — it's computed from
                // size + angle, so the length cell is locked to avoid confusion.
                const lengthAuto = ["elbow", "tee"].includes(
                  String(row.part_type ?? "").toLowerCase(),
                );
                const tip = diags
                  .map((d) => `${LEVEL_ICON[d.level]} ${d.message}${d.suggestion ? `\n   ↳ ${d.suggestion}` : ""}`)
                  .join("\n");
                const rowClass = isSelected
                  ? "bg-accent/30 ring-1 ring-inset ring-accent cursor-pointer"
                  : level
                    ? `${ROW_TINT[level]} cursor-pointer`
                    : "hover:bg-panelLight/40 cursor-pointer";
                return (
                  <tr
                    key={rIdx}
                    ref={isSelected ? selectedRowRef : undefined}
                    title={tip || undefined}
                    onClick={() => seqKey && select(`A${seqKey}`)}
                    className={rowClass}
                  >
                    {columns.map((c, cIdx) => {
                      const isAutoLen = c === "length" && lengthAuto;
                      const computedLen = isAutoLen
                        ? bom.find((b) => b.elementId === `A${seqKey}`)?.lengthMm
                        : undefined;
                      const autoLenText =
                        computedLen != null ? `${Math.round(computedLen)} (자동)` : "";
                      return (
                        <td key={c} className="border-b border-panelLight/50 p-0">
                          <div className="flex items-center">
                            {cIdx === 0 && level && (
                              <span className="pl-1 text-[11px] select-none">{LEVEL_ICON[level]}</span>
                            )}
                            <input
                              value={isAutoLen ? autoLenText : String(row[c] ?? "")}
                              placeholder={isAutoLen ? "자동" : PLACEHOLDERS[c] ?? ""}
                              disabled={isAutoLen}
                              title={isAutoLen ? "엘보/티 길이는 치수·각도로 자동 계산됩니다" : undefined}
                              onChange={(e) => update(rIdx, c, e.target.value)}
                              className={`w-24 bg-transparent px-1.5 py-1 outline-none focus:bg-panelLight placeholder:text-gray-700 ${
                                isAutoLen ? "cursor-not-allowed italic text-gray-600" : ""
                              }`}
                            />
                          </div>
                        </td>
                      );
                    })}
                    <td className="border-b border-panelLight/50 text-center">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          removeRow(rIdx);
                        }}
                        className="text-gray-500 hover:text-red-400 px-1"
                        title="삭제"
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : bom.length === 0 ? (
          <div className="p-3 text-xs text-gray-500">생성된 부재가 없습니다.</div>
        ) : (
          <table className="text-xs w-full border-collapse">
            <thead className="sticky top-0 bg-panel text-gray-400 z-10">
              <tr>
                {["부재", "Spec", "수량", "총길이(mm)"].map((h, i) => (
                  <th key={h} className={`px-2 py-1 font-normal border-b border-panelLight ${i >= 2 ? "text-right" : "text-left"}`}>
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
                  <td className="px-2 py-1 text-right font-mono">{s.totalLength ? s.totalLength.toFixed(0) : "-"}</td>
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
