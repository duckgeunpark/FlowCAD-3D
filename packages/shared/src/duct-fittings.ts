/**
 * Duct fitting catalog — the selectable "database" of duct fittings, extracted
 * from the BNPP HVAC ductwork standard drawing **0-294-M172-902** (HVAC DUCTWORK
 * GENERAL NOTES, Symbols & Legend, Figure-1 / Figure-2).
 *
 * The UI lets the user pick a fitting by `id`, then fill in the numeric `params`
 * (W, H, D, R, angle, …). Each param carries the standard's default value or
 * formula (UNO = "Unless Noted Otherwise") so a sensible model is produced even
 * before the user overrides anything.
 *
 * This is the single source of truth shared by the FastAPI backend (geometry
 * generation) and the Three.js frontend (selection + dimension form).
 */

export type FittingShape = "rect" | "round";

export type FittingCategory =
  | "straight"
  | "elbow"
  | "offset"
  | "transition"
  | "tee"
  | "wye"
  | "lateral"
  | "cap"
  | "accessory";

/** One numeric input for a fitting (a column in the dimension form). */
export interface FittingParam {
  /** Stable key written into the design row (e.g. "W", "H", "D", "R", "angle"). */
  key: string;
  /** Korean label shown in the form. */
  label: string;
  unit: "mm" | "deg" | "count";
  /**
   * Standard default applied when the field is left blank. A number is a fixed
   * UNO value; a string starting with "=" is a formula over other params
   * (evaluated by the backend), e.g. "=W/2" or "=1.5*D".
   */
  default?: number | string;
  /** False for derived/optional dimensions the user usually leaves on default. */
  required: boolean;
  /** Short note straight from the standard (UNO rule, range, …). */
  note?: string;
}

export interface DuctFitting {
  id: string;
  category: FittingCategory;
  nameEn: string;
  nameKo: string;
  /** Cross-section at the inlet / main run and at the outlet / branch. */
  inlet: FittingShape;
  outlet: FittingShape;
  params: FittingParam[];
  /** The governing standard rule (e.g. "R = W/2 (UNO)"). */
  standard: string;
  /** Source reference (drawing number). */
  ref: string;
}

const REF = "0-294-M172-902";

// Reusable param presets so the catalog stays terse and consistent.
const W: FittingParam = { key: "W", label: "폭 W", unit: "mm", required: true };
const H: FittingParam = { key: "H", label: "높이 H", unit: "mm", required: true };
const D: FittingParam = { key: "D", label: "직경 D", unit: "mm", required: true };
const L1220: FittingParam = {
  key: "L", label: "길이 L", unit: "mm", default: 1220, required: false,
  note: "직관 표준 1220mm 단부간(UNO)",
};
const Xstub: FittingParam = {
  key: "X", label: "직선부 X", unit: "mm", default: 75, required: false,
  note: "피팅 직선부 길이(X=75mm UNO)",
};
const branchW: FittingParam = { key: "branchW", label: "분기 폭 bW", unit: "mm", required: true };
const branchH: FittingParam = { key: "branchH", label: "분기 높이 bH", unit: "mm", required: true };
const branchD: FittingParam = { key: "branchD", label: "분기 직경 bD", unit: "mm", required: true };

/**
 * The catalog. Ordered by category for the picker. Defaults/formulas come
 * verbatim from the standard's UNO notes.
 */
export const DUCT_FITTINGS: DuctFitting[] = [
  // ---- Straight runs -----------------------------------------------------
  {
    id: "rect_straight", category: "straight",
    nameEn: "Rect. Straight Duct", nameKo: "사각 직관",
    inlet: "rect", outlet: "rect",
    params: [W, H, L1220],
    standard: "직관 길이 표준 1220mm 단부간(UNO)", ref: REF,
  },
  {
    id: "round_straight", category: "straight",
    nameEn: "Round Duct", nameKo: "원형 직관",
    inlet: "round", outlet: "round",
    params: [D, L1220],
    standard: "직관 길이 표준 1220mm 단부간(UNO)", ref: REF,
  },

  // ---- Elbows ------------------------------------------------------------
  {
    id: "rect_radius_elbow", category: "elbow",
    nameEn: "Rect. Radius Elbow", nameKo: "사각 라디우스 엘보",
    inlet: "rect", outlet: "rect",
    params: [
      W, H,
      { key: "R", label: "곡률반경 R", unit: "mm", default: "=W/2", required: false, note: "R = W/2 (UNO)" },
      { key: "angle", label: "각도 O", unit: "deg", default: 90, required: false, note: "90°(UNO)" },
    ],
    standard: "R = W/2 (UNO), O = 0°~90°", ref: REF,
  },
  {
    id: "rect_mitered_elbow_90", category: "elbow",
    nameEn: "Rect. 90° Mitered Elbow", nameKo: "사각 90° 마이터 엘보",
    inlet: "rect", outlet: "rect",
    params: [W, H, { key: "angle", label: "각도 O", unit: "deg", default: 90, required: false, note: "90°(UNO)" }],
    standard: "90° 마이터(UNO)", ref: REF,
  },
  {
    id: "round_elbow", category: "elbow",
    nameEn: "Round Elbow (Gored)", nameKo: "원형 엘보(고어드)",
    inlet: "round", outlet: "round",
    params: [
      D,
      { key: "R", label: "곡률반경 R", unit: "mm", default: "=1.5*D", required: false, note: "R = 1.5D (UNO)" },
      { key: "angle", label: "각도 O", unit: "deg", default: 90, required: false },
      { key: "gores", label: "고어 수", unit: "count", default: "=gores(angle)", required: false,
        note: "≤36°:2, 37~72°:3, 73~90°:5 (UNO)" },
    ],
    standard: "R = 1.5D (UNO); 고어 수는 각도에 따름", ref: REF,
  },

  // ---- Offsets -----------------------------------------------------------
  {
    id: "rect_straight_offset", category: "offset",
    nameEn: "Rect. Straight-line Offset", nameKo: "사각 직선 오프셋",
    inlet: "rect", outlet: "rect",
    params: [W, H, { key: "offset", label: "오프셋 거리", unit: "mm", required: true }, Xstub],
    standard: "직선 오프셋", ref: REF,
  },
  {
    id: "rect_radius_offset", category: "offset",
    nameEn: "Rect. Radius Offset", nameKo: "사각 라디우스 오프셋",
    inlet: "rect", outlet: "rect",
    params: [W, H,
      { key: "R", label: "곡률반경 R", unit: "mm", default: "=W/2", required: false, note: "R = W/2 (UNO)" },
      { key: "offset", label: "오프셋 거리", unit: "mm", required: true }],
    standard: "R = W/2 (UNO)", ref: REF,
  },
  {
    id: "round_mitered_offset", category: "offset",
    nameEn: "Round Mitered Offset", nameKo: "원형 마이터 오프셋",
    inlet: "round", outlet: "round",
    params: [D, { key: "offset", label: "오프셋 거리", unit: "mm", required: true }],
    standard: "원형 마이터 오프셋", ref: REF,
  },
  {
    id: "round_radius_offset", category: "offset",
    nameEn: "Round Radius Offset", nameKo: "원형 라디우스 오프셋",
    inlet: "round", outlet: "round",
    params: [D,
      { key: "R", label: "곡률반경 R", unit: "mm", default: "=1.5*D", required: false, note: "R = 1.5D (UNO)" },
      { key: "offset", label: "오프셋 거리", unit: "mm", required: true }],
    standard: "R = 1.5D (UNO)", ref: REF,
  },

  // ---- Transitions -------------------------------------------------------
  {
    id: "transition_round_round", category: "transition",
    nameEn: "Round to Round", nameKo: "원형→원형 변환(레듀서)",
    inlet: "round", outlet: "round",
    params: [
      { key: "D", label: "입구 직경 D1", unit: "mm", required: true },
      { key: "toD", label: "출구 직경 D2", unit: "mm", required: true },
      { key: "L", label: "길이 L", unit: "mm", required: true },
    ],
    standard: "동심/편심 레듀서", ref: REF,
  },
  {
    id: "transition_rect_round", category: "transition",
    nameEn: "Rect. to Round", nameKo: "사각→원형 변환",
    inlet: "rect", outlet: "round",
    params: [W, H, { key: "toD", label: "출구 직경 D", unit: "mm", required: true },
      { key: "L", label: "길이 L", unit: "mm", required: true }],
    standard: "사각→원형 변환관", ref: REF,
  },
  {
    id: "transition_rect_rect", category: "transition",
    nameEn: "Rect. to Rect.", nameKo: "사각→사각 변환",
    inlet: "rect", outlet: "rect",
    params: [W, H,
      { key: "toW", label: "출구 폭 W2", unit: "mm", required: true },
      { key: "toH", label: "출구 높이 H2", unit: "mm", required: true },
      { key: "L", label: "길이 L", unit: "mm", required: true }],
    standard: "사각→사각 변환관", ref: REF,
  },

  // ---- Tees --------------------------------------------------------------
  {
    id: "rect_straight_tee", category: "tee",
    nameEn: "Rect. Straight Tee", nameKo: "사각 직각 티",
    inlet: "rect", outlet: "rect",
    params: [W, H, branchW, branchH, Xstub],
    standard: "직각 분기", ref: REF,
  },
  {
    id: "rect_radius_tee", category: "tee",
    nameEn: "Rect. Radius Tee", nameKo: "사각 라디우스 티",
    inlet: "rect", outlet: "rect",
    params: [W, H, branchW, branchH,
      { key: "R", label: "곡률반경 R", unit: "mm", default: "=W/2", required: false, note: "R = W/2 (UNO)" }],
    standard: "R = W/2 (UNO)", ref: REF,
  },
  {
    id: "conical_tee", category: "tee",
    nameEn: "Conical Tee (to Rect.)", nameKo: "코니컬 티",
    inlet: "rect", outlet: "rect",
    params: [W, H, branchW, branchH],
    standard: "코니컬 분기", ref: REF,
  },
  {
    id: "combination_tee", category: "tee",
    nameEn: "Combination Tee (Equal Height)", nameKo: "콤비네이션 티(동일 높이)",
    inlet: "rect", outlet: "rect",
    params: [W, H, branchW],
    standard: "동일 높이 분기", ref: REF,
  },
  {
    id: "round_straight_tee", category: "tee",
    nameEn: "Round Straight Tee", nameKo: "원형 직각 티",
    inlet: "round", outlet: "round",
    params: [D, branchD],
    standard: "원형 직각 분기", ref: REF,
  },
  {
    id: "straight_tapped_tee", category: "tee",
    nameEn: "Straight Tapped Tee (to Round)", nameKo: "탭 티(원형 분기)",
    inlet: "rect", outlet: "round",
    params: [W, H, branchD,
      { key: "NL", label: "넥 길이 NL", unit: "mm", default: 200, required: false,
        note: "급기 레지스터/그릴 200mm, 배기/리턴 100mm" }],
    standard: "탭 분기, 넥 길이 NL", ref: REF,
  },
  {
    id: "rect_45_tapped_tee", category: "tee",
    nameEn: "Rect. 45° Tapped Tee", nameKo: "사각 45° 탭 티",
    inlet: "rect", outlet: "rect",
    params: [W, H, branchW, branchH,
      { key: "angle", label: "분기 각도", unit: "deg", default: 45, required: false }],
    standard: "45° 탭 분기", ref: REF,
  },
  {
    id: "rect_double_45_tapped_tee", category: "tee",
    nameEn: "Rect. Double 45° Tapped Tee", nameKo: "사각 더블 45° 탭 티",
    inlet: "rect", outlet: "rect",
    params: [W, H, branchW, branchH,
      { key: "angle", label: "분기 각도", unit: "deg", default: 45, required: false }],
    standard: "양측 45° 탭 분기", ref: REF,
  },

  // ---- Wyes / laterals ---------------------------------------------------
  {
    id: "rect_two_way_wye", category: "wye",
    nameEn: "Rect. Two-way Wye", nameKo: "사각 2방향 와이",
    inlet: "rect", outlet: "rect",
    params: [W, H, branchW, branchH,
      { key: "angle", label: "분기 각도 O", unit: "deg", default: 45, required: false, note: "O = 0°~90°" }],
    standard: "2방향 와이, O = 0°~90°", ref: REF,
  },
  {
    id: "symmetrical_wye_rect", category: "wye",
    nameEn: "Symmetrical Wye (Rect.)", nameKo: "사각 대칭 와이",
    inlet: "rect", outlet: "rect",
    params: [W, H,
      { key: "angle", label: "분기 각도 O", unit: "deg", default: 45, required: false, note: "O = 0°~90°" }],
    standard: "대칭 와이", ref: REF,
  },
  {
    id: "rect_45_lateral", category: "lateral",
    nameEn: "Rect. 45° Lateral", nameKo: "사각 45° 래터럴",
    inlet: "rect", outlet: "rect",
    params: [W, H, branchW, branchH,
      { key: "angle", label: "분기 각도", unit: "deg", default: 45, required: false }],
    standard: "45° 래터럴", ref: REF,
  },
  {
    id: "conical_45_lateral", category: "lateral",
    nameEn: "Conical 45° Lateral", nameKo: "코니컬 45° 래터럴",
    inlet: "round", outlet: "round",
    params: [D, branchD,
      { key: "angle", label: "분기 각도", unit: "deg", default: 45, required: false },
      { key: "R", label: "곡률반경 R", unit: "mm", default: "=D", required: false, note: "R = W (UNO)" }],
    standard: "코니컬 45° 래터럴, R = W (UNO)", ref: REF,
  },

  // ---- Caps / accessories ------------------------------------------------
  {
    id: "rect_end_cap", category: "cap",
    nameEn: "End Cap (Rect.)", nameKo: "사각 엔드 캡",
    inlet: "rect", outlet: "rect",
    params: [W, H],
    standard: "단부 마감", ref: REF,
  },
  {
    id: "round_end_cap", category: "cap",
    nameEn: "End Cap (Round)", nameKo: "원형 엔드 캡",
    inlet: "round", outlet: "round",
    params: [D],
    standard: "단부 마감", ref: REF,
  },
  {
    id: "access_door", category: "accessory",
    nameEn: "Access Door", nameKo: "점검구(Access Door)",
    inlet: "rect", outlet: "rect",
    params: [
      { key: "doorW", label: "도어 폭", unit: "mm", required: true },
      { key: "doorH", label: "도어 높이", unit: "mm", required: true },
    ],
    standard: "AD-1~AD-5 규격 도어", ref: REF,
  },
];

export const FITTING_CATEGORY_LABEL: Record<FittingCategory, string> = {
  straight: "직관",
  elbow: "엘보",
  offset: "오프셋",
  transition: "변환관",
  tee: "티",
  wye: "와이",
  lateral: "래터럴",
  cap: "캡",
  accessory: "부속",
};

/** Look up a fitting definition by id. */
export function getFitting(id: string): DuctFitting | undefined {
  return DUCT_FITTINGS.find((f) => f.id === id);
}

/**
 * Number of gores in a round gored elbow for a given turn angle, per note 12 of
 * the standard: 2 gores up to 36°, 3 gores 37–72°, 5 gores 73–90° (UNO).
 */
export function goreCount(angleDeg: number): number {
  const a = Math.abs(angleDeg);
  if (a <= 36) return 2;
  if (a <= 72) return 3;
  return 5;
}

/**
 * Evaluate a single param `default` against already-known numeric inputs.
 * Supports the small formula vocabulary used by the catalog:
 *   "=W/2", "=1.5*D", "=D", "=gores(angle)"
 * Returns `undefined` if the referenced inputs are missing.
 */
function evalDefault(
  def: number | string | undefined,
  inputs: Record<string, number>,
): number | undefined {
  if (def === undefined) return undefined;
  if (typeof def === "number") return def;
  const expr = def.startsWith("=") ? def.slice(1).trim() : def.trim();

  // gores(angle)
  const goreMatch = expr.match(/^gores\(\s*(\w+)\s*\)$/i);
  if (goreMatch) {
    const v = inputs[goreMatch[1]];
    return v === undefined ? undefined : goreCount(v);
  }
  // <key>, k*<key>, <key>/k, k*<key>/j  — single variable with scalar factor.
  const m = expr.match(/^(?:(\d*\.?\d+)\s*\*\s*)?([A-Za-z]\w*)(?:\s*\/\s*(\d*\.?\d+))?$/);
  if (m) {
    const [, mul, key, div] = m;
    const base = inputs[key];
    if (base === undefined) return undefined;
    let val = base;
    if (mul) val *= parseFloat(mul);
    if (div) val /= parseFloat(div);
    return val;
  }
  const lit = parseFloat(expr);
  return Number.isFinite(lit) ? lit : undefined;
}

export interface ResolvedFitting {
  id: string;
  /** Every param key resolved to a finite number (defaults/formulas applied). */
  values: Record<string, number>;
  /** Keys that are still missing a value after applying defaults. */
  missing: string[];
}

/**
 * Resolve a fitting's full numeric parameter set from partial user input,
 * applying the standard's UNO defaults and formulas. User-entered values always
 * win over defaults. Formula params are evaluated after literal inputs so they
 * can reference them (e.g. R = W/2 once W is known).
 */
export function resolveFitting(
  id: string,
  raw: Record<string, string | number | undefined>,
): ResolvedFitting {
  const fitting = getFitting(id);
  const values: Record<string, number> = {};
  const missing: string[] = [];
  if (!fitting) return { id, values, missing };

  // Pass 1: literal user inputs + numeric defaults.
  for (const p of fitting.params) {
    const entered = raw[p.key];
    const n = entered === "" || entered === undefined ? NaN : Number(entered);
    if (Number.isFinite(n)) {
      values[p.key] = n;
    } else if (typeof p.default === "number") {
      values[p.key] = p.default;
    }
  }
  // Pass 2: formula defaults (may reference values resolved in pass 1).
  for (const p of fitting.params) {
    if (p.key in values) continue;
    if (typeof p.default === "string") {
      const v = evalDefault(p.default, values);
      if (v !== undefined && Number.isFinite(v)) values[p.key] = v;
    }
  }
  // Anything required but still unresolved is reported as missing.
  for (const p of fitting.params) {
    if (p.required && !(p.key in values)) missing.push(p.key);
  }
  return { id, values, missing };
}
