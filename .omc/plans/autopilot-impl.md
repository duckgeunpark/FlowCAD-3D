# Autopilot 구현 계획 — Plan_v2 조립 그래프 엔진 (Stage 1+2)

## 결정 사항 (사용자 확인됨)
- 범위: Stage 1(배관 MVP) + Stage 2(사각·원형 덕트)
- 입력 모델: Plan_v2 토폴로지(`connect_to_seq`+`connect_port`+`angle`)를 **기본**, `direction`은 선택적 오버라이드(하위호환)
- 기존 17개 pytest는 그대로 통과해야 함 → 신규 경로는 `part_type` 컬럼 유무로 분기

## 핵심 통찰
좌표 없이 `angle`로 heading을 전파해 각 부품의 위치/방향을 계산만 하면,
기존 `GeometryFactory`/`SceneBuilder` 렌더링 계약(SceneDocument)을 그대로 재사용할 수 있다.
프론트(`GeometryFactory.tsx`)는 계약 소비자라 변경 불필요.

## Plan_v2 입력 컬럼 (canonical)
seq, system_type(pipe|duct), part_type(straight|elbow|tee|reducer|transition|valve|damper|cap),
spec, size_a, size_b, length, angle, connect_to_seq, connect_port(start|end|out|branch|in), note
+ 선택 오버라이드: direction, rotation, nominal, schedule, material, drawing_no, fitting_no, joint_nos, item_no

## 구현 항목
1. `apps/api/app/engine/assembly.py` (신규)
   - `ResolvedPart`: kind, shape, section(s), start/end pos, in/out dir, ports, metadata
   - `AssemblyResolver.resolve(rows, mode, specs)`:
     - part_type→ComponentKind, system_type/size→CrossSection (spec/size 상속)
     - seq 순 처리, 부모 exit port에서 entry pos/heading 획득
     - straight/reducer/transition/valve: length만큼 heading 전진
     - elbow: corner에서 heading을 angle만큼 +Z축 회전 (direction 있으면 그 값)
     - tee: main 통과 + branch 수직(roll 적용)
     - 루트는 staggered origin
     - 연결 규칙 검증: ROUND_SAME_DIA / RECT_SAME_WH / shape mismatch → error_markers
   - `AssemblyCompiler.compile(parts, mode, errors)`: 부품별 transient Node/Run으로
     기존 `GeometryFactory.build_segment/transition/fitting/error_marker` 호출 → SceneBuilder
   - `build_assembly_scene(mode, rows, specs)` 진입점
2. `services/generation_service.py`: `part_type` 감지 시 assembly 경로로 분기
3. `services/table_template.py`: Plan_v2 컬럼으로 템플릿 갱신 (+ 예시행)
4. 프론트: `lib/sampleData.ts`(컬럼/샘플), `components/TableEditor.tsx`(라벨/플레이스홀더) Plan_v2화
5. 테스트: `apps/api/tests/test_assembly.py` 신규
   - 직관→엘보90→직관 자동 방향, 직경/가로세로 불일치 마커, 변환관 OK, 티 브랜치,
     direction 오버라이드, 레거시(part_type 없음) 경로 유지

## 검증 (Plan_v2 검증 포인트)
- 동일 규격 원형 직관+엘보 연결 OK
- 사각 덕트 가로·세로 불일치 시 연결 차단(마커)
- 티/레듀서 포트 의미 구분
- 누락 컬럼/빈 값/잘못된 규격 검출
- 조인트 없이 seq만으로 경로 생성
