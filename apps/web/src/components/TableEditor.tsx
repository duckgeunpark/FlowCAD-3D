"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { DesignMode, DiagnosticLevel } from "@flowcad/shared";
import {
  columnsFor,
  ELBOW_DIRECTIONS,
  rowDiagKey,
  rowElementId,
  type TableRow,
} from "@/lib/sampleData";
import { downloadTemplate, uploadTable } from "@/lib/api";
import { diagnosticsBySeq, useViewerStore, worstLevel } from "@/store/useViewerStore";
import { summarize, toCsv, download } from "@/lib/bom";

const ROW_TINT: Record<DiagnosticLevel, string> = {
  error: "bg-red-900/30 hover:bg-red-900/40",
  warning: "bg-amber-900/25 hover:bg-amber-900/35",
  info: "bg-sky-900/20 hover:bg-sky-900/30",
};
const LEVEL_ICON: Record<DiagnosticLevel, string> = { error: "E", warning: "W", info: "I" };

type TableView = "input" | "summary";

interface TableEditorProps {
  mode: DesignMode;
  rows: TableRow[];
  onChange: (rows: TableRow[]) => void;
}

const LABELS: Record<string, string> = {
  seq: "순번",
  system_type: "시스템",
  part_type: "표준피팅",
  spec: "규격",
  size_a: "치수 A",
  size_b: "치수 B",
  length: "길이",
  angle: "각도",
  bend_to: "엘보 방향",
  offset_direction: "오프셋 방향",
  rotation: "회전",
  W: "폭 W",
  H: "높이 H",
  D: "직경 D",
  L: "길이 L",
  R: "반경 R",
  toW: "출구 W",
  toH: "출구 H",
  toD: "출구 D",
  branchW: "분기 W",
  branchH: "분기 H",
  branchD: "분기 D",
  offset: "오프셋",
  X: "X",
  NL: "목 길이",
  gores: "분절",
  connect_to_seq: "연결 순번",
  connect_port: "연결 포트",
  note: "비고",
};

const PLACEHOLDERS: Record<string, string> = {
  seq: "1",
  system_type: "duct",
  part_type: "rect_straight",
  spec: "GI",
  size_a: "500",
  size_b: "300",
  length: "1500",
  angle: "45 / 90",
  bend_to: "w/e/up/down",
  offset_direction: "w/e/up/down",
  rotation: "0/90/180/270",
  W: "500",
  H: "300",
  D: "350",
  L: "1000",
  R: "500",
  connect_to_seq: "1",
  connect_port: "end/out/branch",
  note: "비고",
};

export function TableEditor({ mode, rows, onChange }: TableEditorProps) {
  const columns = columnsFor(mode, rows);
  const setError = useViewerStore((s) => s.setError);
  const scene = useViewerStore((s) => s.scene);
  const select = useViewerStore((s) => s.select);
  const selected = useViewerStore((s) => s.selectedId);
  const regenerate = useViewerStore((s) => s.regenerate);
  const fileInput = useRef<HTMLInputElement>(null);
  const selectedRowRef = useRef<HTMLTableRowElement>(null);
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<TableView>("input");

  const diagBySeq = diagnosticsBySeq(scene);
  const bom = scene?.bom ?? [];
  const summary = useMemo(() => summarize(bom), [bom]);
  const totalLength = useMemo(
    () => bom.reduce((sum, r) => sum + (r.lengthMm || 0), 0),
    [bom],
  );

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
      setError(e instanceof Error ? e.message : "Excel 템플릿 다운로드 실패");
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
      setError(err instanceof Error ? err.message : "파일 불러오기 실패");
    } finally {
      setBusy(false);
    }
  };

  const update = (rowIdx: number, col: string, value: string) => {
    onChange(rows.map((r, i) => (i === rowIdx ? { ...r, [col]: value } : r)));
  };

  const addRow = () => {
    const blank: TableRow = Object.fromEntries(columns.map((c) => [c, ""]));
    const last = rows[rows.length - 1];
    const nextSeq = nextSeqValue(rows);
    blank.seq = nextSeq;
    blank.system_type = mode;
    blank.part_type = mode === "duct" ? "rect_straight" : "straight";
    blank.connect_to_seq = rows.length > 0 ? String(last?.seq ?? rows.length) : "";
    blank.connect_port = rows.length > 0 ? "end" : "start";
    blank.spec = mode === "duct" ? (last?.spec ?? "GI") : (last?.spec ?? "SCH40");
    if (mode === "duct") {
      blank.W = last?.W ?? last?.size_a ?? 500;
      blank.H = last?.H ?? last?.size_b ?? 300;
      blank.L = 1000;
      blank.length = 1000;
    } else {
      blank.size_a = last?.size_a ?? 100;
      blank.length = 1000;
    }
    onChange([...rows, blank]);
  };

  const removeRow = (idx: number) => {
    const removedId = rows[idx] ? rowElementId(rows[idx], mode) : "";
    onChange(rows.filter((_, i) => i !== idx));
    if (removedId && selected === removedId) select(null);
    void regenerate();
  };

  const exportCsv = () => {
    if (view === "summary") {
      const csvRows: (string | number)[][] = [
        ["부품", "규격", "수량", "총 길이(mm)"],
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
                {v === "input" ? "설계 입력" : "물량 집계"}
              </button>
            ))}
          </div>
          {view === "input" && (
            <span className="text-[11px] text-gray-500">{rows.length}개 행</span>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {view === "input" ? (
            <>
              <button onClick={handleTemplate} title="Excel 템플릿 다운로드"
                className="text-xs px-2 py-1 rounded bg-panelLight hover:bg-[#222b37]">Excel</button>
              <button onClick={() => fileInput.current?.click()} disabled={busy}
                title="Excel/CSV 파일 불러오기"
                className="text-xs px-2 py-1 rounded bg-panelLight hover:bg-[#222b37] disabled:opacity-50">
                {busy ? "불러오는 중" : "파일"}
              </button>
              <button onClick={addRow} className="text-xs px-2 py-1 rounded bg-panelLight hover:bg-[#222b37]">+ 행</button>
            </>
          ) : null}
          <button onClick={exportCsv} disabled={view === "summary" && bom.length === 0}
            title="현재 보기 CSV 내보내기"
            className="text-xs px-2 py-1 rounded bg-panelLight hover:bg-[#222b37] disabled:opacity-50">CSV</button>
          <input ref={fileInput} type="file" accept=".xlsx,.xlsm,.csv" onChange={handleUpload} className="hidden" />
        </div>
      </div>

      {view === "input" && (
        <div className="px-3 py-1.5 border-b border-panelLight/60 text-[11px] text-gray-500">
          도면 내용을 순번, 표준피팅, 치수, 연결 순번, 연결 포트로 입력합니다. Excel/CSV 불러오기는 같은 정규화 규칙을 사용합니다.
        </div>
      )}

      <div className="overflow-auto flex-1">
        {view === "input" ? (
          <InputTable
            rows={rows}
            columns={columns}
            mode={mode}
            selected={selected}
            selectedRowRef={selectedRowRef}
            diagBySeq={diagBySeq}
            bom={bom}
            onSelect={select}
            onUpdate={update}
            onRemove={removeRow}
          />
        ) : bom.length === 0 ? (
          <div className="p-3 text-xs text-gray-500">생성된 부품이 없습니다.</div>
        ) : (
          <SummaryTable summary={summary} totalLength={totalLength} totalCount={bom.length} />
        )}
      </div>
    </div>
  );
}

function InputTable({
  rows,
  columns,
  mode,
  selected,
  selectedRowRef,
  diagBySeq,
  bom,
  onSelect,
  onUpdate,
  onRemove,
}: {
  rows: TableRow[];
  columns: string[];
  mode: DesignMode;
  selected: string | null;
  selectedRowRef: React.RefObject<HTMLTableRowElement | null>;
  diagBySeq: Map<string, import("@flowcad/shared").Diagnostic[]>;
  bom: import("@flowcad/shared").BomRow[];
  onSelect: (id: string | null) => void;
  onUpdate: (rowIdx: number, col: string, value: string) => void;
  onRemove: (idx: number) => void;
}) {
  return (
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
          const elId = rowElementId(row, mode);
          const diagKey = rowDiagKey(row, mode);
          const diags = diagKey ? diagBySeq.get(diagKey) ?? [] : [];
          const level = worstLevel(diags);
          const isSelected = !!elId && selected === elId;
          const partType = String(row.part_type ?? "").toLowerCase();
          const lengthAuto = ["elbow", "tee", "rect_elbow", "round_elbow", "rect_tee", "round_tee"].includes(partType);
          const isElbow = partType.includes("elbow");
          const tip = diags
            .map((d) => `${LEVEL_ICON[d.level]} ${d.message}${d.suggestion ? `\n권장: ${d.suggestion}` : ""}`)
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
              onClick={() => elId && onSelect(elId)}
              className={rowClass}
            >
              {columns.map((c, cIdx) => {
                if (c === "bend_to") {
                  return (
                    <td key={c} className="border-b border-panelLight/50 p-0">
                      {isElbow ? (
                        <select
                          value={String(row[c] ?? "")}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => onUpdate(rIdx, c, e.target.value)}
                          className="w-24 bg-transparent px-1.5 py-1 outline-none focus:bg-panelLight text-gray-200 cursor-pointer"
                        >
                          {ELBOW_DIRECTIONS.map((d) => (
                            <option key={d.value} value={d.value} className="bg-panel">
                              {d.label}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <CellInput value={String(row[c] ?? "")} placeholder={PLACEHOLDERS[c]} onChange={(v) => onUpdate(rIdx, c, v)} />
                      )}
                    </td>
                  );
                }

                const computedLen = c === "length" && lengthAuto
                  ? bom.find((b) => b.elementId === elId)?.lengthMm
                  : undefined;
                return (
                  <td key={c} className="border-b border-panelLight/50 p-0">
                    <div className="flex items-center">
                      {cIdx === 0 && level && (
                        <span className="pl-1 text-[10px] font-bold select-none">{LEVEL_ICON[level]}</span>
                      )}
                      <CellInput
                        value={computedLen != null ? `${Math.round(computedLen)} 자동` : String(row[c] ?? "")}
                        placeholder={computedLen != null ? "자동" : PLACEHOLDERS[c] ?? ""}
                        disabled={computedLen != null}
                        onChange={(v) => onUpdate(rIdx, c, v)}
                      />
                    </div>
                  </td>
                );
              })}
              <td className="border-b border-panelLight/50 text-center">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(rIdx);
                  }}
                  className="text-gray-500 hover:text-red-400 px-1"
                  title="삭제"
                >
                  x
                </button>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function CellInput({
  value,
  placeholder,
  disabled,
  onChange,
}: {
  value: string;
  placeholder?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <input
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => onChange(e.target.value)}
      className={`w-24 bg-transparent px-1.5 py-1 outline-none focus:bg-panelLight placeholder:text-gray-700 ${
        disabled ? "cursor-not-allowed italic text-gray-600" : "text-gray-200"
      }`}
    />
  );
}

function SummaryTable({
  summary,
  totalLength,
  totalCount,
}: {
  summary: ReturnType<typeof summarize>;
  totalLength: number;
  totalCount: number;
}) {
  return (
    <table className="text-xs w-full border-collapse">
      <thead className="sticky top-0 bg-panel text-gray-400 z-10">
        <tr>
          {["부품", "규격", "수량", "총 길이(mm)"].map((h, i) => (
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
          <td className="px-2 py-1 text-right font-mono">{totalCount}</td>
          <td className="px-2 py-1 text-right font-mono">{totalLength.toFixed(0)}</td>
        </tr>
      </tfoot>
    </table>
  );
}

function nextSeqValue(rows: TableRow[]): number {
  return rows.reduce((max, row) => {
    const n = Number(row.seq);
    return Number.isFinite(n) && n > max ? n : max;
  }, 0) + 1;
}
