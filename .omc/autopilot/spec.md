# Autopilot Spec — 조인트 정합 버그 + 입력/BOM 통합 UX + 상세 치수

## 사용자 요청
1. 아이템 조인트끼리 붙어야 하는데 일부가 **조인트-중앙**으로 붙음.
2. 설계 입력테이블과 자재명세서(BOM)가 분리돼 비직관적 → **하나로 통합**. 3D 선택 포커스가 BOM에만, 3D 추가도 BOM에만 반영되는 것처럼 보임.
3. 아이템 상세에 **길이만** 있고 가로·세로·Ø(파이) 값이 없음.

## 진단 (근거: 파이프 샘플 조인트 덤프)
- **티 분기 버그**: 티 분기 조인트는 중심에서 `branchLength`(예 300) 위치인데, 분기 자식 직관은 `_fitting_clearance`가 포트 무관하게 **main run 절반(200)** 으로만 트림 → 자식 조인트가 티 안쪽(중심 방향)으로 100mm 파고듦. 엘보·티 main run은 정상.
- **UX**: 좌측 탭 2개(입력/BOM). `TableEditor`는 `selectedId`를 하이라이트하지 않음(진단행만). `BomTable`만 selectedId 하이라이트 → "포커스가 BOM에만". `addFromJoint`는 rows에 추가+regenerate하므로 실제로 입력에도 추가되지만 입력탭에선 강조가 없어 안 보이는 것처럼 느껴짐.
- **상세**: 치수(width/height/radius)는 `element.params`에 있는데 `DetailPanel`은 `userData`만 렌더 → 길이만 보임.

## 변경 사항 (사용자 확정: 통합 테이블)
### 백엔드 (apps/api) — 포트 인식 트리밍
- `domain/components.py::Node`에 `fitting_port: str | None` 추가.
- `engine/assembly.py::ResolvedPart`에 `start_neighbor_port: str | None` 추가; `_assign_neighbors`에서 부모 포트 저장; `_segment`에서 Node a에 전달.
- `engine/geometry_factory.py::_fitting_clearance`: TEE가 `fitting_port=="branch"`면 `branchLength`(max(r*4,300)), 아니면 main `runLength/2`. → 분기 자식 조인트가 티 분기 조인트와 정확히 일치.

### 프론트엔드 (apps/web) — 통합 테이블 + 동기화 + 상세
- 새 통합 테이블: 입력 행(편집) + "입력/물량집계" 보기 토글. 탭 분리 제거(`page.tsx`).
  - 3D 선택(`selectedId=A{seq}`) → 해당 행 하이라이트 + 스크롤. 행 클릭 → `select(A{seq})`.
  - 행 추가/삭제/업로드/CSV 유지. 물량집계 = 기존 BOM summary.
- `DetailPanel`: 치수 섹션 추가 — 사각이면 `W×H`, 원형/배관이면 `Ø(=radius*2)`, + 곡률(엘보 bendRadius) 표시.

## 인수 기준
- 티 분기 자식 직관의 시작 조인트 좌표 == 티 분기 조인트 좌표(포트 인식 트림).
- 엘보/티 main run 회귀 정상.
- 단일 테이블에서 3D 선택 시 행 하이라이트, 행 클릭 시 3D 선택, 추가 시 행 즉시 표시.
- DetailPanel에 W×H 또는 Ø 표시.
- `pytest` 그린, `npm run build:web` 그린.

## 비범위
Wye/래터럴/마이터(이전 패스 보류분), 게이지 표 정밀 이식.
