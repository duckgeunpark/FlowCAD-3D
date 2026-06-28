# Autopilot Spec — Piece 길이 모델 (직관 실길이 + 엘보 자동 길이)

## 사용자 요청
- 직관 길이 1500인데 3D에서 1050으로 보임 → 직관은 **실제 길이 그대로** 그려야 함.
- 현재는 직관 길이값에 엘보 몫이 섞임(중심선 모델 + 트림). 잘못됨.
- 엘보는 **길이 입력 막고** 가로·세로·각도만 입력 → 길이 자동 계산.
- 총 길이 = 직관 + 엘보, 각 piece 길이를 따로 표시.

## 확정 사항
- 엘보 길이 = **센터라인 호 길이 R×각도** (R=W 기준, 90°·W=500 → ≈785mm).

## 변경 (중심선/트림 → piece 모델)
### 백엔드
- `assembly._segment` → `build_segment(trim=False)`: 직관은 authored 전체 길이 유지.
- `assembly._place` ELBOW/TEE → 자기 footprint만큼 배치: 엘보 in-face=entry, corner=entry+leg, out-face=corner+leg. 티 center=entry+run_half, out=center+run_half, branch=center+branch_len.
- `geometry_factory.elbow_bend_radius(section)` 공유 헬퍼(rect=W, round=bend_radius/3r) — 배치·형상·클리어런스 일치.
- `geometry_factory`: 엘보 `length_mm`=`_elbow_arc_length`(호), 티=runLength → BOM/상세 표시.
- **조인트 번호**를 노드(코너)가 아닌 **조인트 면 좌표** 기준으로(`_joint_base(node, position)`), 티 분기는 `Node.fitting_port`로 BR 접미사 매칭 → 맞닿는 포트가 한 번호 공유 → 연결 조인트는 닫힘, 자유단만 open.

### 프론트엔드
- 통합 테이블: 엘보/티 `length` 입력 **비활성화**, 계산값 "N (자동)" 표시.

## 인수 기준 (충족)
- 직관 length_mm == authored(트림 없음), 조인트끼리 일치.
- 엘보 length_mm == R×각도 호 길이.
- 연결 조인트 닫힘 / 자유단만 open.
- `pytest` 57 passed, `npm run build:web` 성공.

## 비범위 (다음)
- 비-90° 엘보의 센터라인 반경 고정(현재 leg 고정 → 완만한 각도에서 반경 증가). Wye/래터럴/마이터.
