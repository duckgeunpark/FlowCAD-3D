# 도면 → 3D 렌더 가능한 입력 테이블 작성법 (v2 Duct)

이 문서는 **도면(PDF/CAD)에서 추출한 정보를 FlowCAD 3D 엔진이 바로 렌더링할 수 있는
입력 테이블(`Duct3D_Input` 시트)로 옮기는 규칙**을 정의합니다.
사람(수작업)과 AI 추출기 모두를 대상으로 하며, 엔진 계약(`apps/api/app/engine/duct_v2.py`)에
근거합니다.

> **한 줄 원칙:** 3D 엔진은 `row_type=DATA` 이고 **절대 좌표(origin)** 가 있는 행만 그립니다.
> 좌표·방향·길이·단면이 없으면 그 행은 렌더에서 조용히 사라집니다(에러도 안 뜸).

---

## 0. 좌표계 · 단위 규약

| 항목 | 규약 |
|---|---|
| 단위 | **밀리미터(mm)**. 각도는 도(°). |
| 축 | **Z = 위(up)**, X/Y = 수평 평면. (엔지니어링 월드업) |
| 원점 | 도면의 기준점(그리드 교점·기둥 등)을 `(0,0,0)`으로 잡고 전 계통을 그 기준으로 환산. |
| `origin_mode` | 좌표가 부재 **중심선** 기준이면 `CENTER`. |
| 높이(Z) | 층고/BOP(bottom of pipe)/CL(center line) 표기를 mm로 환산해 `origin_z`에 반영. |

**중요:** 도면이 상대 치수(“여기서 3000 더 가서 엘보”)만 줘도, 기준점 하나를 잡으면
전부 절대 좌표로 누적 환산할 수 있습니다. 좌표를 “못 뽑는다”가 아니라 **기준점을 정하는**
문제입니다.

---

## 1. DATA vs NOTE — 가장 중요한 규칙

| row_type | 의미 | 렌더링 |
|---|---|---|
| `DATA` | 3D 지오메트리 계약을 만족하는 확정 행 | ✅ 그려짐 |
| `NOTE` | 검토 필요(좌표/치수 미확정) | ❌ 엔진이 제외 |
| `REQ`/`OPT` | 헤더 밑 스펙 표기 행 | ❌ 자동 스킵 |

- 좌표를 확정 못 하면 `NOTE`로 빼는 것은 **정당**합니다.
- 하지만 **최소 한 계통(line)이라도 완전한 DATA 체인**을 만들어야 화면에 무언가 나옵니다.
- DATA로 승격하려면 아래 2~4장의 필드를 채우고 `review_status=APPROVED`, `error_code`/`error_message`는 비웁니다.

---

## 2. 모든 DATA 행 공통 필수 필드

| 필드 | 필수 | 설명 |
|---|---|---|
| `row_type` | ✅ | `DATA` |
| `element_id` | ✅ | 고유 ID (예: `E0001`). 연결관계의 키. |
| `element_type` | ✅ | `STRAIGHT` / `FITTING` / `TRANSITION` / `TERMINAL` … |
| `origin_x/y/z` | ✅ | 중심선 시작 꼭짓점(mm). **없으면 `MISSING_ORIGIN`으로 제외됨.** |
| `orientation_code` **또는** `dir_x/y/z` | ✅ | 방향(둘 중 하나). 3장 참고. |
| `shape_code` | ✅ | `RECT` / `ROUND` / `OVAL` / `FLAT_OVAL` |
| 단면 치수 | ✅ | `RECT`→`width`+`height`, `ROUND`→`diameter` (mm). 5장 참고. |

권장(품질): `line_id`, `system_id`, `service`, `seq`, `part_name_ko/en`, `material_code`,
`spec_code`, `from/to/branch_to_element_id`(6장).

---

## 3. 방향 표기 — `orientation_code` 문법

축 토큰: `XP `(+X) `XN`(−X) `YP`(+Y) `YN`(−Y) `ZP`(+Z) `ZN`(−Z).
언더스코어로 **입력→출력→분기** 순으로 나열합니다.

| 부재 | 형식 | 예시 | 뜻 |
|---|---|---|---|
| 직관 | `입력_출력` (같음) | `XP_XP` | +X로 곧게 진행 |
| 엘보 | `입력_출력` | `XP_ZP` | +X로 들어와 +Z로 꺾임 |
| 티/와이 | `입력_출력_BRANCH_분기` | `XP_XP_BRANCH_YP` | +X 관통, +Y로 분기 |
| 크로스/스플리터 | `입력_분기1_분기2…` | `XP_YP_YN` | +X 입력, +Y/−Y 양분기 |

`orientation_code`가 없으면 `dir_x/y/z`(단위 벡터)로 대체 가능하지만, 피팅은
`orientation_code`를 쓰는 것이 명확합니다.

---

## 4. 부재 유형별 필수 필드

### 4.1 직관 STRAIGHT
- `origin_x/y/z` = 시작점, **`end_x/y/z` 또는 `centerline_length` 중 하나 필수**(끝점 결정).
- `orientation_code = 축_축` (예: `XP_XP`), 또는 `dir_x/y/z`.
- 단면: `width`+`height`(RECT) 또는 `diameter`(ROUND).

```
row_type=DATA, element_id=E0001, element_type=STRAIGHT, shape_code=RECT,
origin_x=0, origin_y=0, origin_z=3000, end_x=2000, end_y=0, end_z=3000,
orientation_code=XP_XP, width=500, height=300, to_element_id=E0002
```

### 4.2 엘보 ELBOW
- `origin` = **꺾이는 모서리 꼭짓점**(양쪽 직관이 만나는 점).
- `orientation_code = 입력축_출력축` (예: `XP_ZP`).
- 단면 치수. (다리 길이·bend는 엔진이 치수로 자동 계산.)

```
row_type=DATA, element_id=E0002, element_type=FITTING, fitting_type=ELBOW,
shape_code=RECT, origin_x=2000, origin_y=0, origin_z=3000,
orientation_code=XP_ZP, width=500, height=300,
from_element_id=E0001, to_element_id=E0003
```

### 4.3 티 / 와이 TEE / WYE
- `origin` = 분기 중심점.
- `orientation_code = 입력_출력_BRANCH_분기` (예: `XP_XP_BRANCH_YP`),
  또는 `branch_b_side` = `LEFT/RIGHT/FRONT/BACK/TOP/BOTTOM`.
- 분기 단면: `branch_width`/`branch_height`(또는 `branch_diameter`).
- 와이/래터럴 각도: `branch_angle_deg`(티 기본 90°, 와이 기본 45°).
- 연결: `from`(입력) `to`(관통 출력) `branch_to`(분기 대상).

```
row_type=DATA, element_id=E0003, element_type=FITTING, fitting_type=TEE,
shape_code=RECT, origin_x=2000, origin_y=0, origin_z=5000,
orientation_code=ZP_ZP_BRANCH_YP, width=500, height=300,
branch_width=250, branch_height=250, branch_angle_deg=90,
from_element_id=E0002, to_element_id=E0004, branch_to_element_id=E0100
```

### 4.4 크로스 / 스플리터 CROSS / SPLITTER
- `orientation_code`에 분기축을 2개 이상: `입력_분기1_분기2`.
- 복합 분기는 `branch_b_side` / `branch_c_side`(방위 키워드)로도 지정 가능.
- `part_subtype`: `CROSS_BRANCH`, `DOUBLE_Y_BRANCH_PANTS`, `BULLHEAD_TEE_DOUBLE_ELBOW`.

### 4.5 레듀서 / 트랜지션 TRANSITION
- 입구 단면(`shape_code`+`width/height` 또는 `diameter`) + **출구 단면**
  (`outlet_width`/`outlet_height` 또는 `outlet_diameter`).
- `origin`(입구) `end`(출구) 또는 `transition_length`.
- 사각→원 등 형상 변화는 출구 치수로 자동 인식.

### 4.6 캡 / 터미널 CAP (`element_type=TERMINAL` 또는 `fitting_type=CAP`)
- `origin` + `orientation_code`(막는 방향) + 단면 치수.

---

## 5. 단면 치수 규칙

| shape_code | 필수 치수 |
|---|---|
| `RECT` | `width`, `height` (mm) |
| `ROUND` | `diameter` (mm) |
| `OVAL` / `FLAT_OVAL` | `major_axis`, `minor_axis` |

- 인렛/아웃렛이 다르면 `inlet_*` / `outlet_*` 접두 컬럼 사용.
- 분기 단면은 `branch_*`. 없으면 본관 단면을 그대로 사용.
- 도면의 인치 표기(예: `14x16 in`)는 **mm로 환산**해서 넣습니다(14"→355.6 등).

---

## 6. 연결관계 그래프 (품질 필수)

`from_element_id` / `to_element_id` / `branch_to_element_id`로 부재를 잇습니다.

- **왜 필요한가:** 이 링크가 있어야 ① 직관이 피팅 접합면까지 자동 트림되고
  ② 단면 회전(roll)이 계통을 따라 일관되게 전파됩니다(수직 구간 톱니 방지).
- 링크가 없으면 부재들이 서로 안 이어진 채 각자 배치됩니다(렌더는 되지만 접합이 지저분).
- 규칙: 앞 부재의 `to_element_id` = 다음 부재의 `element_id`, 다음 부재의
  `from_element_id` = 앞 부재의 `element_id` (양방향으로 채우기).

---

## 7. 좌표를 못 뽑을 때(HOLD) 처리 정책

1. 좌표 미확정 행은 `row_type=NOTE`, `review_status=HOLD`로 분리 — **정당**.
2. `error_code`를 **원인별로 구체화**(전부 한 종류로 뭉치지 말 것):
   - `MISSING_ORIGIN` — 기준점/좌표 없음
   - `MISSING_LENGTH` — 길이·끝점 없음
   - `MISSING_SECTION` — 단면 치수 없음
   - `MISSING_BRANCH_GEOMETRY` — 분기축/분기 단면 없음
3. `ai_source`(도면 페이지·라인), `ai_confidence`를 남겨 검토 우선순위를 만듭니다.
4. **부분 확보 우선:** 좌표가 일부라도 있는 계통은 통째로 HOLD하지 말고 DATA로 승격.

---

## 8. 작성 완료 검증 체크리스트

DATA 행마다:

- [ ] `row_type=DATA`
- [ ] `origin_x/y/z` 채워짐(mm, 기준점 기준 절대값)
- [ ] `orientation_code` 또는 `dir_x/y/z` 있음
- [ ] 직관이면 `end_x/y/z` 또는 `centerline_length` 있음
- [ ] `shape_code` + 해당 단면 치수(`width/height` 또는 `diameter`) 있음
- [ ] 피팅이면 유형별 추가 필드(엘보 출력축 / 티·와이 분기축·분기단면) 있음
- [ ] `from/to/branch_to_element_id` 로 앞뒤 연결됨
- [ ] `error_code`/`error_message` 비어 있고 `review_status=APPROVED`

계통 전체:

- [ ] 같은 `line_id`의 부재들이 `seq` 순서대로 좌표가 연속(끝점=다음 시작점)
- [ ] 서로 다른 계통은 좌표가 겹치지 않음

---

## 9. 최소 완전 예시 — 직관→엘보→직관 한 계통

| element_id | element_type | fitting_type | shape | origin (x,y,z) | end/dir | orientation | W×H | from→to |
|---|---|---|---|---|---|---|---|---|
| E0001 | STRAIGHT | NONE | RECT | 0,0,3000 | end 2000,0,3000 | XP_XP | 500×300 | →E0002 |
| E0002 | FITTING | ELBOW | RECT | 2000,0,3000 | dir 0,0,1 | XP_ZP | 500×300 | E0001→E0003 |
| E0003 | STRAIGHT | NONE | RECT | 2000,0,3000 | end 2000,0,5000 | ZP_ZP | 500×300 | E0002→ |

이 3행이면 “바닥을 따라 +X로 2m 간 뒤 위로 꺾여 2m 상승하는 500×300 덕트”가 렌더됩니다.

---

## 참고 (엔진 소스)
- 렌더 계약·해석: `apps/api/app/engine/duct_v2.py`
- 컬럼 스키마·필수 플래그: `apps/api/app/services/table_template.py` (`V2_DUCT_COLUMNS`, `_V2_REQUIRED`)
- 정상 샘플: `duct_3d_sheet_v2.xlsx`
