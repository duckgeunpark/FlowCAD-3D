"use client";

import { useEffect, useMemo, useState } from "react";
import {
  DUCT_FITTINGS,
  resolveFitting,
  type DuctFitting,
  type FittingCategory,
} from "@flowcad/shared";
import { useViewerStore, type SelectedJointContext } from "@/store/useViewerStore";

const UNIT_SUFFIX: Record<string, string> = { mm: "mm", deg: "도", count: "개" };
const DIRECTIONS = [
  { value: "", label: "기본" },
  { value: "w", label: "좌" },
  { value: "e", label: "우" },
  { value: "up", label: "상" },
  { value: "down", label: "하" },
  { value: "n", label: "북" },
  { value: "s", label: "남" },
];

const CATEGORY_LABEL_KO: Record<FittingCategory, string> = {
  straight: "직관",
  elbow: "엘보",
  offset: "오프셋",
  transition: "변환",
  tee: "티 분기",
  wye: "Y 분기",
  lateral: "래터럴",
  cap: "캡",
  accessory: "부속",
};

const FITTING_LABEL_KO: Record<string, string> = {
  rect_straight: "각 덕트 직관",
  round_straight: "원형 덕트 직관",
  rect_elbow: "각 덕트 엘보",
  round_elbow: "원형 덕트 엘보",
  rect_reducer: "각 덕트 레듀서",
  round_reducer: "원형 덕트 레듀서",
  rect_to_round: "각-원 변환",
  round_to_rect: "원-각 변환",
  rect_tee: "각 덕트 티",
  round_tee: "원형 덕트 티",
  rect_y_branch: "각 덕트 Y분기",
  round_y_branch: "원형 덕트 Y분기",
  rect_lateral: "각 덕트 래터럴",
  round_lateral: "원형 덕트 래터럴",
  rect_offset: "각 덕트 오프셋",
  round_offset: "원형 덕트 오프셋",
  rect_offset_transition: "각 덕트 오프셋 변환",
  round_offset_transition: "원형 덕트 오프셋 변환",
  square_to_round: "사각-원 변환",
  round_to_square: "원-사각 변환",
  rect_cap: "각 덕트 캡",
  round_cap: "원형 덕트 캡",
};

const PARAM_LABEL_KO: Record<string, string> = {
  W: "폭 W",
  H: "높이 H",
  D: "직경 D",
  L: "길이 L",
  R: "반경 R",
  angle: "각도",
  toW: "출구 폭",
  toH: "출구 높이",
  toD: "출구 직경",
  branchW: "분기 폭",
  branchH: "분기 높이",
  branchD: "분기 직경",
  offset: "오프셋",
  X: "X",
  NL: "목 길이",
  gores: "분절 수",
};

export function FittingPicker() {
  const addCatalogFitting = useViewerStore((s) => s.addCatalogFitting);
  const selectedJointContext = useViewerStore((s) => s.selectedJointContext);
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [direction, setDirection] = useState("");

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
  const canAdd = !!selected && !!resolved && resolved.missing.length === 0;

  useEffect(() => {
    if (!selected) return;
    setInputs(seedInputs(selected, selectedJointContext));
    setDirection("");
  }, [selected, selectedJointContext]);

  const add = () => {
    if (!selected || !resolved || resolved.missing.length > 0) return;
    const directionValue = direction.trim();
    const directional: Record<string, string> = {};
    if (selected.category === "elbow" && directionValue) {
      directional.bend_to = directionValue;
    } else if (selected.category === "offset" && directionValue) {
      directional.offset_direction = directionValue;
    }
    addCatalogFitting(selected.id, { ...resolved.values, ...directional });
  };

  return (
    <div className="border-b border-panelLight">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-xs font-semibold text-gray-200 hover:bg-panelLight/40"
      >
        <span>
          표준피팅 추가 <span className="text-gray-500 font-normal">(0-294-M172-902)</span>
        </span>
        <span className="text-gray-500">{open ? "접기" : "열기"}</span>
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-2">
          <JointContextSummary context={selectedJointContext} />

          <div className="max-h-44 overflow-auto rounded border border-panelLight/60 bg-black/20">
            {[...byCategory.entries()].map(([cat, list]) => (
              <div key={cat}>
                <div className="px-2 py-1 text-[10px] font-semibold text-gray-500 bg-panelLight/40 sticky top-0">
                  {CATEGORY_LABEL_KO[cat]}
                </div>
                <div className="grid grid-cols-2 gap-0.5 p-1">
                  {list.map((f) => (
                    <button
                      key={f.id}
                      onClick={() => setSelectedId(f.id)}
                      title={f.nameEn}
                      className={`text-left text-[11px] px-1.5 py-1 rounded truncate ${
                        selectedId === f.id
                          ? "bg-accent text-white"
                          : "text-gray-300 hover:bg-panelLight"
                      }`}
                    >
                      {fittingLabel(f)}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {selected && (
            <div className="space-y-1.5 rounded border border-panelLight/60 p-2">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-medium text-gray-100">{fittingLabel(selected)}</span>
                <span className="text-[10px] text-gray-500">
                  {shapeLabel(selected.inlet)} → {shapeLabel(selected.outlet)}
                </span>
              </div>
              <div className="text-[10px] text-gray-500">표준 기본값과 입력값으로 치수를 정규화합니다.</div>
              <div className="grid grid-cols-2 gap-1.5 pt-1">
                {selected.params.map((p) => {
                  const isFormula = typeof p.default === "string";
                  const placeholder = isFormula
                    ? "자동"
                    : p.default != null
                      ? `${p.default}`
                      : "필수";
                  return (
                    <label key={p.key} className="flex flex-col gap-0.5">
                      <span className="text-[10px] text-gray-400">
                        {PARAM_LABEL_KO[p.key] ?? p.label}
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

              {(selected.category === "elbow" || selected.category === "offset") && (
                <div className="pt-1">
                  <div className="text-[10px] text-gray-400 mb-1">
                    {selected.category === "elbow" ? "출구 방향" : "오프셋 방향"}
                  </div>
                  <div className="grid grid-cols-4 gap-1">
                    {DIRECTIONS.map((d) => (
                      <button
                        key={d.value || "default"}
                        type="button"
                        onClick={() => setDirection(d.value)}
                        className={`px-1.5 py-1 rounded text-[10px] ${
                          direction === d.value
                            ? "bg-accent text-white"
                            : "bg-panelLight text-gray-300 hover:bg-[#222b37]"
                        }`}
                      >
                        {d.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

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
                {selectedJointContext ? "선택 조인트에 추가" : "새 시작 피팅 추가"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function JointContextSummary({ context }: { context: SelectedJointContext | null }) {
  if (!context) {
    return (
      <div className="rounded border border-amber-500/40 bg-amber-950/20 px-2 py-1.5 text-[11px] text-amber-200">
        조인트 미선택: 새 시작 피팅으로 추가됩니다.
      </div>
    );
  }
  const dims = Object.entries(context.dimensions)
    .map(([k, v]) => `${k}=${v}`)
    .join(", ");
  return (
    <div className="rounded border border-emerald-500/40 bg-emerald-950/20 px-2 py-1.5 text-[11px] text-emerald-100">
      조인트 {context.jointNo} / seq {context.parentSeq} / 포트 {context.role}
      {dims ? <span className="text-emerald-300"> / {dims}</span> : null}
    </div>
  );
}

function fittingLabel(fitting: DuctFitting): string {
  return FITTING_LABEL_KO[fitting.id] ?? fitting.nameEn;
}

function shapeLabel(shape: string): string {
  if (shape === "rectangular") return "각";
  if (shape === "round") return "원";
  return shape;
}

function seedInputs(
  fitting: DuctFitting,
  context: SelectedJointContext | null,
): Record<string, string> {
  if (!context) return {};
  const seeded: Record<string, string> = {};
  for (const p of fitting.params) {
    const value = context.dimensions[p.key];
    if (value != null) seeded[p.key] = String(value);
  }
  return seeded;
}
