"use client";

import { useState } from "react";
import type { DiagnosticLevel } from "@flowcad/shared";
import { useViewerStore } from "@/store/useViewerStore";

const LEVEL_META: Record<DiagnosticLevel, { icon: string; label: string; cls: string }> = {
  error: { icon: "❗", label: "오류", cls: "text-red-300" },
  warning: { icon: "⚠", label: "경고", cls: "text-amber-300" },
  info: { icon: "ⓘ", label: "안내", cls: "text-sky-300" },
};
const RANK: Record<DiagnosticLevel, number> = { error: 0, warning: 1, info: 2 };

/**
 * Lists structured diagnostics from the last generation (Plan_v2 §사용성:
 * 연결 불가 사유 표시 + 추천값). Clicking a row focuses the related 3D element.
 */
export function DiagnosticsPanel() {
  const scene = useViewerStore((s) => s.scene);
  const select = useViewerStore((s) => s.select);
  const selectedId = useViewerStore((s) => s.selectedId);
  const [open, setOpen] = useState(true);

  const diags = scene?.diagnostics ?? [];
  if (diags.length === 0) return null;

  const sorted = [...diags].sort((a, b) => RANK[a.level] - RANK[b.level]);
  const counts = diags.reduce(
    (acc, d) => ({ ...acc, [d.level]: (acc[d.level] ?? 0) + 1 }),
    {} as Record<DiagnosticLevel, number>,
  );

  return (
    <div className="border-t border-panelLight bg-panel/50">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 text-xs font-semibold text-gray-200 hover:bg-panelLight/30"
      >
        <span>{open ? "▾" : "▸"}</span>
        <span>설계 검토</span>
        <span className="flex items-center gap-2 ml-auto font-normal">
          {(["error", "warning", "info"] as DiagnosticLevel[])
            .filter((l) => counts[l])
            .map((l) => (
              <span key={l} className={LEVEL_META[l].cls}>
                {LEVEL_META[l].icon} {counts[l]}
              </span>
            ))}
        </span>
      </button>
      {open && (
        <ul className="max-h-44 overflow-auto px-2 pb-2 space-y-1">
          {sorted.map((d, i) => {
            const meta = LEVEL_META[d.level];
            const targetId = d.seq ? `A${d.seq}` : null;
            const active = targetId != null && targetId === selectedId;
            return (
              <li
                key={`${d.code}-${d.seq}-${i}`}
                onClick={targetId ? () => select(targetId) : undefined}
                className={`rounded px-2 py-1.5 text-[11px] leading-snug ${
                  targetId ? "cursor-pointer hover:bg-panelLight/40" : ""
                } ${active ? "bg-panelLight/60 ring-1 ring-accent" : "bg-panelLight/20"}`}
              >
                <div className={`flex gap-1.5 ${meta.cls}`}>
                  <span className="select-none">{meta.icon}</span>
                  <span className="text-gray-200">{d.message}</span>
                </div>
                {d.suggestion && (
                  <div className="pl-5 text-gray-400 mt-0.5">↳ {d.suggestion}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
