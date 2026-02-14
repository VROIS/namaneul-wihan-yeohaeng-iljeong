# MCP 자동화 최종 상세 계획 (승인용)

> 목적: `docs/MCP_RAW_DATA_PROMPTS.md`를 기준으로  
> **도시 1개당 1차 5회 + 2차 5회(총 10회) 완전 순차 실행**을 고정하고,  
> **기존 DB 중심(컬럼 확장 위주)**으로 로우데이터를 빠르고 안정적으로 쌓는다.

---

## 1) 확정 원칙

- **절대 병렬 금지**: 호출 1회 3~5분 소요 특성상 순차 고정
- **실행 순서 = 화면 노출 순서 = 저장 순서**
- **도시 순서(앱 기준)**:
  - 프랑스 순위 1~30 (파리 포함)
  - 다음 유럽 순위 1~30 (중복 도시 자동 스킵)
- **카테고리 순서 고정**:
  - `attraction -> restaurant -> healing -> adventure -> hotspot`
- **호출 단위 고정**:
  - 1차: `1도시 x 1카테고리 x 30장소`
  - 2차: 1차 결과 30개 묶음으로 `1도시 x 1카테고리`
- **응답 도착 즉시 DB 저장**: 저장 완료 후 다음 호출 시작

---

## 2) 데이터 기준(도시 순위)

### 2-1. 현재 반영된 기준

- `cities` 테이블에 MCP 순위 컬럼 존재:
  - `mcp_rank_fr`, `mcp_rank_eu`, `mcp_bucket`, `mcp_rank_basis`, `mcp_rank_note`, `mcp_rank_updated_at`
- 의미:
  - 운영자가 Supabase에서 직접 “프랑스/유럽 순위”를 확인 가능
  - 연계 서비스(위기경보, MCP 실행 순서) 공통 기준으로 사용 가능

### 2-2. 순위가 없는 도시는 처리 제외

- 배치 실행 대상은 `mcp_rank_fr` 또는 `mcp_rank_eu`가 있는 도시만
- 순위 없는 도시는 “일반 도시”로 유지 (본 배치 범위 밖)

---

## 3) DB 사용 전략 (간소화)

### 3-1. 기본 원칙

- `places`: 장소 마스터(기존 고비용 수집 데이터 최대 재활용)
- `place_nubi_reasons`: 2차(인지도 근거) 중심 저장
- `place_seed_raw`: 현재 운영 중이라면 유지하되, 장기적으로는 축소 가능

### 3-2. 권장 컬럼 확장 (기존 테이블 기반)

> 신규 테이블 추가보다 기존 테이블 컬럼 추가를 우선

#### A. `place_nubi_reasons` (핵심)
- `seed_category` (카테고리)
- `seed_rank` (카테고리 내 1~30)
- `run_batch_id` (실행 배치 식별)
- `stage1_google_search_note`
- `stage1_google_review_count_note`
- `stage1_google_image_count_note`
- `stage1_status`, `stage2_status`
- `retry_count`, `error_message`, `updated_at`

#### B. 유니크 키 재설계(중요)
- 현재 `placeId unique` 단일 구조는 도시×카테고리×순위 반복 운영에 불리
- 권장:
  - `(city_id, seed_category, seed_rank, run_batch_id)` 유니크

---

## 4) 실행 파이프라인 (도시 1개 기준)

### 4-1. 1차 (총 5회 호출)

1. 카테고리1 프롬프트 주입 -> MCP 호출  
2. JSON 파싱/정규화  
3. 30개 저장 (`stage1_status=success`)  
4. 카테고리2~5 반복

### 4-2. 2차 (총 5회 호출)

1. 1차 결과 30개를 카테고리별 묶음으로 읽기  
2. 인지도 매칭 프롬프트 주입 -> MCP 호출  
3. `sourceRank/sourceType/nubiReason/evidenceUrl/verified` 저장 (`stage2_status=success`)  
4. 카테고리2~5 반복

### 4-3. 완료 조건

- 도시 1개 완료 기준:
  - 1차 5카테고리 모두 30개 확보
  - 2차 5카테고리 모두 응답 저장 완료
- 완료 후 다음 도시로 이동

---

## 5) 장애 복구/안정화 규칙

- 호출 타임아웃: 8~10분
- 재시도: 작업 단위당 최대 1~2회
- 실패해도 전체 배치 중단 금지
  - 실패 작업은 `failed` 상태 저장
  - 다음 작업 계속 진행
- 재개(resume):
  - `pending/failed` 작업만 다시 수행

---

## 6) API/운영 계약 (최소)

- `POST /api/admin/mcp/workflow/start`
  - 입력: `startCity?`, `endCity?`, `runBatchId`
- `POST /api/admin/mcp/workflow/resume`
  - 입력: `runBatchId`
- `GET /api/admin/mcp/workflow/status`
  - 현재 도시/카테고리/단계/성공률/실패 목록
- `GET /api/admin/mcp/workflow/report?runBatchId=...`
  - 도시별 150개 충족 여부 + 2차 매칭 완료율

---

## 7) 검증 지표 (대표님 확인용)

- `france_count = 30`
- `europe_count = 30`
- `both_count = 2` (파리/니스)
- 고유 실행도시 `ranked_count = 58`
- 도시 1개당:
  - 1차 150개 저장 완료 여부
  - 2차 150개 매칭 완료 여부

---

## 8) 구현 단계 (승인 후 바로 실행)

1. `mcp-raw-service.ts` 기능 분리
   - prompt-builder / runner / parser / writer / orchestrator
2. `place_nubi_reasons` 컬럼 확장 + 유니크 키 재설계
3. 순차 실행 오케스트레이터 연결(도시/카테고리 고정 순서)
4. 상태 API/리포트 API 연결
5. 프랑스 1개 도시 파일럿 -> 전체 프랑스 30 확장

---

## 9) 최종 확인 질문 (승인 체크)

- [O] 도시 순서: 프랑스 1~30 -> 유럽 1~30(중복 스킵)로 확정
- [O] 카테고리 순서: attraction -> restaurant -> healing -> adventure -> hotspot 확정
- [O] 1차/2차 모두 완전 순차(병렬 금지) 확정
- [O] 저장 기준 테이블: `places + place_nubi_reasons` 중심 확정
- [O] 1차 프랑스 우선 배치부터 시작 확정

---

## 10) 실행 로그 (2026-02-14)

### 10-1. 오늘 구현 반영

- `mcp-raw-service`에 워크플로우 API용 오케스트레이션 반영
  - `runMcpWorkflowStart`
  - `runMcpWorkflowResume`
  - `getMcpWorkflowStatus`
  - `getMcpWorkflowReport`
- `data_sync_log` 체크포인트 강제 기록 반영
  - 상태: `running/success/failed`
  - source 포맷: `run={runBatchId}|cat={category}|cityOrder={n}|city={nameEn}`
- `admin-routes`에 워크플로우 엔드포인트 연결 완료
  - `POST /api/admin/mcp/workflow/start`
  - `POST /api/admin/mcp/workflow/resume`
  - `GET /api/admin/mcp/workflow/status`
  - `GET /api/admin/mcp/workflow/report`

### 10-2. 파일럿 실행 결과 (runBatchId=`FR_PILOT_20260214_02`)

- 파리(Paris) 1차: `150/150` 저장 완료
- 파리(Paris) 2차: `148/150` 저장 (미완료 2건)
- 누락 카테고리: `adventure` (2건)
- 자동 실행은 정책대로 계속 중단 상태 유지 (`mcp_raw_stage1`, `mcp_raw_stage2` paused)

### 10-3. 확인된 리스크 및 수정 내역

- `place_seed_raw` 테이블 미존재로 초기 파일럿 실패 -> DB 생성 처리 완료
- DB `cities.id`에 PK 제약이 없어서 FK 생성 실패 -> PK 보정 후 진행
- `resume`가 범위를 넓게 재개하던 문제 -> `startCity/endCity` 범위 재개 지원으로 수정 완료
- 2차 일부 매칭 누락 보완을 위해 장소명 정규화 로직 추가
  - 소문자 + 유니코드 정규화 + 공백/특수문자 제거 키 병행 매칭

### 10-4. 다음 세션 시작점 (필수)

1. 파리 `adventure` 2건 누락 원본 이름 확인
2. rank 기반 보조 매칭(동순위 fallback) 추가
3. `Paris 2차 150/150` 달성 후 파일럿 PASS 판정
4. PASS 후 프랑스 30개 순차 확장
