"use client";

import { useMemo, useState } from "react";
import {
  DUCT_FITTINGS,
  FITTING_CATEGORY_LABEL,
  resolveFitting,
  type DuctFitting,
  type FittingCategory,
} from "@flowcad/shared";
import { useViewerStore } from "@/store/useViewerStore";

const UNIT_SUFFIX: Record<string, string> = { mm: "mm", deg: "°", count: "개" };

/**
 * Standard duct-fitting catalog picker (BNPP 0-294-M172-902): choose a fitting,
 * fill in its dimensions, and add it to the model. Standard UNO defaults/formulas
 * (R=W/2, R=1.5D, gore count, X=75, L=1220) are applied automatically.
 */
export function FittingPicker() {
  const addCatalogFitting = useViewerStore((s) => s.addCatalogFitting);
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [inputs, setInputs] = useState<Record<string, string>>({});

  const byCategory = useMemo(() => {
    const groups = new Map<FittingCategory, DuctFitting[]>();
    for (const f of DUCT_FITTINGS) {
      const list = groups.get(f.category) ?? [];
      list.push(f);
      groups.set(f.category, list);
    }
    return groups;
  }, []);

  const selected = selectedId ? DUCT_FITTINGS.find((f) => f.id === selectedId) : null;
  const resolved = selected ? resolveFitting(selected.id, inputs) : null;
  const canAdd = !!resolved && resolved.missing.length === 0;

  const pick = (id: string) => {
    setSelectedId(id);
    setInputs({});
  };

  const add = () => {
    if (!selected || !resolved || resolved.missing.length > 0) return;
    addCatalogFitting(selected.id, resolved.values);
  };

  return (
    <div className="border-b border-panelLight">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-gray-200 hover:bg-panelLight/40"
      >
        <span>＋ 표준 피팅 추가 <span className="text-gray-500 font-normal">(0-294-M172-902)</span></span>
        <span className="text-gray-500">{open ? "▴" : "▾"}</span>
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-2">
          {/* Category-grouped fitting chooser */}
          <div className="max-h-44 overflow-auto rounded border border-panelLight/60 bg-black/20">
            {[...byCategory.entries()].map(([cat, list]) => (
              <div key={cat}>
                <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-gray-500 bg-panelLight/40 sticky top-0">
                  {FITTING_CATEGORY_LABEL[cat]}
                </div>
                <div className="grid grid-cols-2 gap-0.5 p-1">
                  {list.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => pick(f.id)}
                      title={`${f.nameEn} · ${f.standard}`}
                      className={`text-left text-[11px] px-1.5 py-1 rounded truncate ${
                        selectedId === f.id
                          ? "bg-accent text-white"
                          : "text-gray-300 hover:bg-panelLight"
                      }`}
                    >
                      {f.nameKo}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* Dimension form for the selected fitting */}
          {selected && (
            <div className="space-y-1.5 rounded border border-panelLight/60 p-2">
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-medium text-gray-100">{selected.nameKo}</span>
                <span className="text-[10px] text-gray-500">{selected.inlet}→{selected.outlet}</span>
              </div>
              <div className="text-[10px] text-gray-500">{selected.standard}</div>
              <div className="grid grid-cols-2 gap-1.5 pt-1">
                {selected.params.map((p) => {
                  const isFormula = typeof p.default === "string";
                  const placeholder = isFormula
                    ? "자동"
                    : p.default != null
                      ? `${p.default}`
                      : "필수";
                  return (
                    <label key={p.key} className="flex flex-col gap-0.5" title={p.note ?? ""}>
                      <span className="text-[10px] text-gray-400">
                        {p.label}
                        <span className="text-gray-600"> {UNIT_SUFFIX[p.unit] ?? ""}</span>
                        {p.required && !isFormula && <span className="text-amber-400"> *</span>}
                      </span>
                      <input
                        value={inputs[p.key] ?? ""}
                        inputMode="numeric"
                        placeholder={placeholder}
                        onChange={(e) =>
                          setInputs((s) => ({ ...s, [p.key]: e.target.value }))
                        }
                        className="bg-panelLight rounded px-1.5 py-1 text-xs text-gray-100 outline-none focus:ring-1 focus:ring-accent text-right font-mono placeholder:text-gray-600"
                      />
                    </label>
                  );
                })}
              </div>
              {resolved && resolved.missing.length > 0 && (
                <div className="text-[10px] text-amber-400">
                  필수 입력: {resolved.missing.join(", ")}
                </div>
              )}
              <button
                onClick={add}
                disabled={!canAdd}
                className="w-full mt-1 px-2 py-1.5 rounded bg-accent text-white text-xs font-semibold hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                모델에 추가
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
