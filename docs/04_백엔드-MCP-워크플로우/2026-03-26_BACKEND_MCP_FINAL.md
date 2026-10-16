# 백그라운드 설계 확정 — MCP 기반 로우데이터 아키텍처

> **목적**: 기존 place-seeder + 12개 크롤러를 MCP 검색 기반으로 전환. API 비용·크롤러 복잡도 대폭 축소.  
> **관련**: `docs/MCP_RAW_DATA_PROMPTS.md`, `docs/MCP_AUTOMATION_DESIGN.md`

---

## 1. 아키텍처 확정 요약

| 구분 | 기존 | MCP 전환 후 |
|------|------|-------------|
| **1단계 장소 수집** | Google Places API (Nearby + Details) | MCP Google Search (API 비용 없음) |
| **2단계 한국인 인지도** | 12개 크롤러 (인스타·유튜브·네이버·패키지 등) | MCP Google Search (nubiReason 일괄) |
| **좌표 확보** | 시딩 시 Places API 호출 | **최종 일정 생성 시** 구글맵 API (일 8곳) |
| **저장** | places + place_nubi_reasons | place_seed_raw (1·2단계 통합) |

---

## 2. 백엔드 구성 확정

### 2-1. 신규

| 항목 | 내용 |
|------|------|
| **place_seed_raw** | 1·2단계 결과 저장. 좌표 없음. |
| **mcp-raw-service** | 1단계·2단계 MCP 호출 + place_seed_raw I/U |
| **mcp_raw_stage1**, **mcp_raw_stage2** | 스케줄러 태스크 (주 1회 또는 수동) |
| **Admin API** | `POST /api/admin/mcp-raw/stage1`, `stage2` |

### 2-2. 축소·유지

| 항목 | 변경 |
|------|------|
| **place-seeder** | **중단** — MCP 1단계로 대체 |
| **place_seed_sync** | **중단** — mcp_raw_stage1·2로 대체 |
| **12개 크롤러** | **대부분 중단** — MCP 2단계(nubiReason)로 대체 |
| **place-linker** | **축소** — place_seed_raw는 place_id 불필요 |
| **Wikimedia, OpenTripMap** | **선택 유지** — 보강용 (무료) |
| **Google Places API** | **일정 생성 시 8곳/일만** 호출 |

### 2-3. 그대로 활용

| 항목 | 용도 |
|------|------|
| cities | 도시 목록, 변수 치환 |
| celeb_evidence | {셀럽목록} 동적 생성 |
| dataSyncLog | MCP 배치 로깅 |
| data_collection_schedule | mcp_raw_stage1, mcp_raw_stage2 등록 |

---

## 3. place_seed_raw 스키마 (확정)

```sql
CREATE TABLE IF NOT EXISTS place_seed_raw (
  id SERIAL PRIMARY KEY,
  city_id INTEGER NOT NULL REFERENCES cities(id) ON DELETE CASCADE,
  seed_category TEXT NOT NULL,  -- attraction, restaurant, healing, adventure, hotspot
  rank INTEGER NOT NULL,
  name_ko TEXT,
  name_en TEXT NOT NULL,
  google_search_note TEXT,
  google_review_count_note TEXT,
  google_image_count_note TEXT,
  source TEXT,
  -- 2단계
  source_rank INTEGER,
  source_type TEXT,
  nubi_reason TEXT,
  evidence_url TEXT,
  evidence_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_place_seed_raw_city_category ON place_seed_raw(city_id, seed_category);
```

---

## 4. 워크플로 (확정)

```
1단계 MCP → place_seed_raw INSERT (도시×5카테고리×30곳)
     ↓
2단계 MCP → place_seed_raw UPDATE (nubiReason, evidence_url...)
     ↓
일정 생성 시 → place_seed_raw에서 선정 → 구글맵 API 8곳/일 검증
```

---

## 5. 대시보드 수정 방향 (MCP 적용)

### 5-1. 제거·숨김

| 현재 섹션 | 조치 |
|-----------|------|
| 🌱 장소 시딩 자동 실행 (place-seed-toggle) | **제거** — mcp_raw_stage1·2로 대체 |
| 바이브 시딩 (syncGooglePlaces) | **제거** — MCP 1단계로 대체 |
| 데이터 소스: Google Places, Instagram, YouTube, 네이버, 티스토리 개별 동기화 | **축소** — MCP가 대체 |
| 한국 감성 데이터 (인스타·네이버·유튜브 개별 동기화) | **축소** — MCP 2단계가 nubiReason 통합 수집 |
| 유튜브 채널·블로그 소스 수동 관리 | **축소 또는 유지** — MCP는 celeb_evidence만 사용 |

### 5-2. 신규·강화

| 섹션 | 내용 |
|------|------|
| **MCP 로우데이터** | place_seed_raw 현황 (도시별·카테고리별 건수) |
| **MCP 1단계 실행** | 도시·카테고리 선택 → 수동 실행 버튼 |
| **MCP 2단계 실행** | 도시 선택 → nubiReason 수집 실행 버튼 |
| **MCP 스케줄** | mcp_raw_stage1, mcp_raw_stage2 상태·마지막 실행 시각 |
| **API 사용량** | 구글맵 API: 일 8곳(일정 생성용) 강조, 기존 Places 시딩 비용 제거 |

### 5-3. 탭 구조 제안

| 탭 | 기존 | 변경 |
|----|------|------|
| 개요 | 유지 | MCP place_seed_raw 현황 카드 추가 |
| 데이터 소스 | Google/인스타/유튜브/네이버/티스토리 | **MCP 로우데이터** (1·2단계 실행·상태) |
| API 상태 | 유지 | Places API 설명: "일정 생성 시 8곳/일만 사용" |
| 스케줄러 | place_seed_sync 등 | **mcp_raw_stage1, mcp_raw_stage2** 표시 |

---

## 6. 구현 순서 (권장)

1. **place_seed_raw** 마이그레이션
2. **mcp-raw-service** (1단계·2단계 로직)
3. **Admin API** (`/api/admin/mcp-raw/stage1`, `stage2`)
4. **스케줄러** mcp_raw_stage1·2 등록, place_seed_sync 비활성화
5. **대시보드** MCP 섹션 추가, 기존 시딩·크롤러 UI 축소

---

## 7. 크롤러 일시 중단 (비용 절감, 2026-02)

- **위치**: `server/services/data-scheduler.ts` → `PAUSED_TASKS`
- **유지**: `weather_sync`, `exchange_rate_sync`, `crisis_sync` (무료·실사긴성)
- **재활성화**: `PAUSED_TASKS` Set에서 해당 태스크명 제거 후 재배포

---

## 8. 참조 문서

| 문서 | 용도 |
|------|------|
| `docs/MCP_RAW_DATA_PROMPTS.md` | 1·2단계 프롬프트 템플릿 |
| `docs/MCP_AUTOMATION_DESIGN.md` | DB 설계·자동화 상세 |
| `docs/BACKEND_MCP_FINAL.md` | 본 문서 — 확정 아키텍처·대시보드 방향 |
