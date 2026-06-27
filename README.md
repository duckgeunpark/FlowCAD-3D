# FlowCAD 3D

스마트 배관·덕트 3D 자동 생성 및 인터랙티브 도면 솔루션. 설계 데이터(엑셀/CSV/웹 표)를
**1:1 실척 3D 모델**과 메타데이터(도면/피팅/조인트 번호)로 변환합니다.

이 저장소는 **Phase 1 MVP 수직 슬라이스**를 구현합니다:
`표 입력 → 백엔드 지오메트리 엔진 → Three.js 3D 뷰어 → BOM 쌍방향 인터랙션`.

## 아키텍처

```
표/CSV 입력 ──▶ FastAPI 백엔드 ──▶ Scene Document(JSON) ──▶ Next.js + React Three Fiber
                 (지오메트리 엔진)        (계약)                   (3D 뷰어 / BOM)
```

핵심 설계 원칙: **백엔드는 지오메트리 "파라미터"만 계산**하고, **프론트는 그 계약(Scene
Document)을 메쉬로 렌더링**합니다. 두 엔진이 느슨하게 결합되어 독립적으로 진화합니다.

### 적용 디자인 패턴

| 패턴 | 위치 | 목적 |
| :-- | :-- | :-- |
| **Repository** | `apps/api/app/specs/repository.py` | 표준 스펙 DB 추상화 (메모리 → 나중에 RDB로 교체) |
| **Strategy** | `apps/api/app/parsing/` | 파이프/덕트 입력 파서 분리 |
| **Factory** | `app/engine/geometry_factory.py` · `apps/web/src/three/GeometryFactory.tsx` | 컴포넌트 종류별 지오메트리 생성 (백/프론트 대칭) |
| **Builder** | `app/engine/scene_builder.py` | Scene Document 점진적 조립 (bounds/BOM 누적) |
| **Service Layer** | `app/services/generation_service.py` | parse→compile 유스케이스 오케스트레이션 |
| **DTO 분리** | `app/api/schemas.py` · `packages/shared/src/scene.ts` | 와이어 포맷과 도메인 모델 분리 |

## 디렉토리 구조

```
apps/
  api/                 # FastAPI 백엔드 (지오메트리 엔진)
    app/
      domain/          # 프레임워크 무관 엔티티/값객체 + Scene 계약
      specs/           # 스펙 Repository
      parsing/         # 입력 파서 (Strategy + Factory)
      engine/          # GeometryFactory · SceneBuilder · NetworkCompiler
      services/        # 애플리케이션 서비스 + CSV 로더
      api/             # FastAPI 라우트 · DTO · DI
    tests/
  web/                 # Next.js + React Three Fiber 프론트엔드
    src/{app,components,three,store,lib}
packages/
  shared/              # 백/프론트 공유 TypeScript 타입 (Scene 계약)
samples/               # 예제 CSV
```

## 실행 방법

### 1) 백엔드 (FastAPI, 포트 8000)

```bash
cd apps/api
python -m venv .venv
.venv/Scripts/python -m pip install -r requirements.txt   # macOS/Linux: .venv/bin/python
.venv/Scripts/python -m uvicorn app.main:app --reload --port 8000
```

테스트: `.venv/Scripts/python -m pytest`
API 문서: http://localhost:8000/docs

### 2) 프론트엔드 (Next.js, 포트 3000)

```bash
npm install            # 저장소 루트에서 (workspaces)
npm run dev:web
```

브라우저에서 http://localhost:3000 → **샘플 불러오기 → 3D 생성**.

## 주요 기능 (MVP)

- 📄 빈 Excel(.xlsx) 템플릿 다운로드 → 값 입력 → 업로드로 테이블 자동 채움 (.xlsx/.csv)
- 📤 외부 내보내기: **DXF**(AutoCAD) · **PDF**(ISO 도면) · **IFC4**(Revit/Navisworks) · **STEP**(SolidWorks/CATIA) — 백엔드 가용성 자동 감지
- 🚰 파이프 / 💨 덕트 모드 전환, 표준 스펙(Sch40 등) 기반 OD 자동 계산
- 1:1 실척 3D 렌더링 + 실척 ↔ ISO(직교) 카메라 토글
- 3D 부품 클릭 → 상세 패널 / BOM 행 클릭 → 3D 하이라이트 (쌍방향)
- 조인트/피팅 번호 통합 검색 (비매칭 부품 20% 반투명)
- 모든 메쉬에 메타데이터(`userData`) 1:1 바인딩

## 로드맵 대비 현재 범위

- ✅ **Phase 1**: 표 입력, 실척 3D 뷰어, 지오메트리 엔진, BOM
- 🔜 **Phase 2**: STEP/IFC/DXF 내보내기(PythonOCC/IfcOpenShell/ezdxf), ISO 비척도 파단 단축
- 🔜 **Phase 3**: AI 2D 도면 인식 (YOLOv8/OCR)

> 참고: 현재 엘보우/티는 조인트 마커(구/박스)로 표현됩니다. 실제 토러스 곡관 지오메트리는
> 양쪽 `GeometryFactory`에 case를 추가하면 확장됩니다 — 계약은 그대로 유지됩니다.
```
