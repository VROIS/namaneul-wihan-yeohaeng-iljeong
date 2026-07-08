# 여정생성 실증 검증 워크플로우 (100회+ 재사용 표준)

> **사장님 SSOT 2026-07-07.** 여정생성(MIX/DB-only) 유료 시험을 **1회에 아래 전부** 체크하는 표준 하네스.
> 시험은 반복(100회+)되므로 이 문서를 열어 **순서대로 수집·판정**한다. 매번 즉흥 조회 금지.

---

## 🔴 다음 시험 = 지난 본느 시험 빠뜨린 항목 (2026-07-07 심야 = raw 근본해결 후 이번엔 반드시)

> 지난 본느 시험(옛 번들·RLS 전)은 채점 60/100. **아래가 미완/오답이었음. 이번엔 채운다.**

| # | 지난 실패 | 이번 확인 방법 |
|---|---|---|
| **A. raw Storage 저장** | Storage raw-responses/{cityId} **0개(증발)** | RLS 고침 → 생성 후 Storage에 `90-mix-gemini`(Gemini)·`06-ts-pm-enrich`(TS) 뜨는지. 직접접속 list. |
| **B. raw 로컬 동기화** | 미확인 | 생성 후 `npx tsx fillcity/steps/raw-local-pull.ts --city-id=N` → docs/raw/{cityId} 폴더 생성 → 사장님 열람 |
| **C. 호출횟수** | "신규 1곳" **오독**(실제 신규도시=전부 호출) | PSR created_at 로 신규수 확인 = Gemini 1 / TS N / PM N. `_matching`은 매칭수지 호출수 아님 |
| **D. 생성시간** | 41.8초=이전 2배 악화인데 "체감정합"으로 얼버무림 | 응답 metadata `_totalMs` 정밀. 목표 10초(별도 개선). 얼버무림 금지 |
| **E. PSR 재입력** | 미완 | `raw-storage-recall --reinsert` = Storage raw → PSR (재과금0). 재입력 가능 확인 |

**대원칙(사장님):** Storage=원재료 SSOT. 어느 경로(운영·Chrome)든 저장 → pull(로컬 열람)·reinsert(PSR)로 언제든 회수. [[reference_raw_storage_rls_and_recall_skill]]

**시험 전제:** my-guide.replit.app = **Publish(재배포) 먼저** (코드 반영). RLS는 DB라 이미 적용. [[reference_replit_backend_needs_server_build]]

---

## ⚠️ 대전제 (위반 = 이중과금·시험무효)

1. **생성 조작 = 사장님이 손으로.** 운영 웹에서 생성 버튼을 사장님이 누름. AI는 前/後 캡처·검증만. 유료 외부호출 타이밍을 사장님이 통제.
2. **검증 = AI가 직접 수집·보고, 사장님이 그 보고를 검증 (2026-07-07 사장님 SSOT):**
   - **DB(PSR·필수컬럼·신규↔중복·저장) = AI가 직접접속(pg Client)으로 조사·보고.** ⚠️ **MCP execute_sql 금지 = Egress 경고.** 대신 **직접접속** = `fillcity/status.ts`(§16 영구도구, pg.Client + .env DATABASE_URL + ssl). Egress 무관.
   - **FE = AI가 `chrome-devtools`로** 응답 JSON·슬롯·이동·합계·마커·콘솔·생성시간.
   - **사장님 = AI 보고글을 검증** (스샷·직접조회로 폭로 §1.1). AI 거짓·게으름 = 발각.
   - **AI는 어떤 경우도 upsertPlace/외부호출 재실행 안 함 = 읽기 전용.**
3. **도시 id = 사장님이 지정.** 신규(place_seed_raw 행 0~소수) / 기존(다수)은 前 스냅샷으로 판정.
4. **유료 = 1도시 1회.** 실패해도 추가 생성 없이 보고 후 재지시(제1조).

---

## 흐름

```
[A] 前 캡처(무료)  →  사장님 생성 1번(유료)  →  [C] 後 캡처+FE파싱(무료)  →  [D] 채점표
```

---

## [A] 前(前) 캡처 — 사장님 "생성한다" 신호 직전, 읽기전용

### A-1. DB 前 스냅샷 = **AI 직접접속 조사** (MCP 금지·Egress → `fillcity/status.ts` 또는 pg.Client 직접)
- 빠른 현황: `npx tsx fillcity/status.ts --city-id={CITY}` (카테고리별 행수·완비율 pid/coord/rc/price/img/sumko).
- 상세 스냅샷(필수컬럼 전수)은 아래 쿼리를 pg.Client 직접접속으로:
```sql
-- {CITY} = 사장님 지정 city_id
SELECT
  COUNT(*) AS rows_before,
  COUNT(*) FILTER (WHERE name_local IS NOT NULL) AS name_local,
  COUNT(*) FILTER (WHERE name_ko IS NOT NULL) AS name_ko,
  COUNT(*) FILTER (WHERE google_review_count IS NOT NULL) AS rc,
  COUNT(*) FILTER (WHERE image_url IS NOT NULL) AS image,
  COUNT(*) FILTER (WHERE editorial_summary IS NOT NULL) AS edsum,
  COUNT(*) FILTER (WHERE price_eur IS NOT NULL) AS price,
  COUNT(*) FILTER (WHERE google_place_id IS NOT NULL) AS pid,
  COUNT(*) FILTER (WHERE google_maps_uri IS NOT NULL) AS uri,
  COUNT(*) FILTER (WHERE rank IS NULL) AS rank_null,
  MAX(updated_at) AS last_updated
FROM place_seed_raw WHERE city_id = {CITY};
```
→ 신규판정: rows_before 0~소수 = 신규 / 다수 = 기존.

### A-2. 로컬 docs/raw 前 목록
- `docs/raw/{CITY}/` 폴더가 있나 + 파일 목록 (없으면 신규 = 생성 후 새 폴더 생겨야 함).

### A-3. Storage 前 (선택)
- `raw-responses/{CITY}/` 파일 목록 (생성 후 diff 기준).

> 이 스냅샷을 scratchpad에 기록 = 後와 diff.

---

## [B] 사장님 생성 (유료·1회)

- 운영 웹 `https://my-guide.replit.app` (모바일 에뮬 iPhone 12 390x844).
- 조건: 사장님 지정 (기본 = 3일·Packed·많이걷기·합리적).
- **AI는 chrome-devtools로 접속만 미리 해두고**, 사장님이 입력·생성 누름.
- 생성 시작 = 네트워크 `POST /api/routes/generate` 타임스탬프 기록 → 응답까지 **생성시간(초)**.

---

## [C] 後 캡처 — 생성 완료 직후

### C-1. FE 응답 JSON 통째 저장 (chrome-devtools)
- `list_network_requests` → `/generate` 응답 body → 통째 저장 `docs/raw/{CITY}/{날짜}_verify_response.json`.
- 콘솔오류: `list_console_messages` → error 0건이어야.

### C-2. 스샷 (chrome-devtools take_screenshot, 설명형 파일명)
- 슬롯 카드 / 슬롯간 이동 / 일합계 칩 / 지도 마커. `docs/raw/{CITY}/` 저장.

### C-3. DB 後 스냅샷 = **AI 직접접속 조사** = A-1 동일(status.ts) + 신규행 상세 쿼리(pg.Client 직접)
```sql
-- 생성으로 새로 들어온/갱신된 행 (updated_at 前 스냅샷 이후)
SELECT id, seed_category, rank, name_en, name_local, name_ko,
  (google_review_count IS NOT NULL) AS rc, (image_url IS NOT NULL) AS img,
  (editorial_summary IS NOT NULL) AS edsum, (price_eur IS NOT NULL) AS price,
  (google_place_id IS NOT NULL) AS pid, (google_maps_uri IS NOT NULL) AS uri,
  (latitude IS NOT NULL AND longitude IS NOT NULL) AS coord,
  updated_at
FROM place_seed_raw WHERE city_id = {CITY}
ORDER BY updated_at DESC LIMIT 40;
```

### C-4. 로컬 docs/raw / Storage 後 목록 = A-2·A-3 diff

---

## [D] 채점표 (DB-only = 정답 기준. 벗어난 것 = MIX 결함)

### 공통 (반드시 4종)
| 항목 | 판정 |
|---|---|
| 스샷 | 슬롯·이동·일합계·마커 4종 저장됐나 |
| 로그 | 생성 totalMs or 서버로그 확보 |
| 콘솔오류 | Chrome console error = **0건** |
| 생성시간 | POST /generate 소요 초 (DB-only ~3s / MIX ~20s 참고) |

### ① FE — 응답 JSON 슬롯별 파싱 (실제 필드명 = ag4-db-finalize.ts 확정)
**슬롯 6요소 (place[] 각 원소, 전 슬롯 채움?)**
| 요소 | 응답 키 | 합격 조건 |
|---|---|---|
| 로컬이름 | `nameLocal` | 전 슬롯 non-null |
| 한국이름 | `nameKo` | 전 슬롯 non-null |
| 슬롯시간 | `startTime` | 전 슬롯 존재 (HH:MM) |
| RC 리뷰수 | `userRatingCount` | 전 슬롯 >0 |
| 요약(숏폼) | `editorialSummary` | 전 슬롯 non-null |
| 가격 | `estimatedPriceEur`(비식당)/`mealPrice`(식당) | 존재 (0=무료 정상) |

**슬롯 간 이동 (transit.transits[] + place.transit_*)**
| 항목 | 응답 키 | 합격 |
|---|---|---|
| 이동수단 | `transits[].mode` (walk/transit/guide) | 거리 맞는 분포 (전부 walk = ❌) |
| 소요시간 | `transits[].duration` = `transit_min` | 존재 |
| 거리 | `transits[].distance`(m) = `distance_from_prev_km`×1000 | 존재·양수 |
| 배열길이 | `transits.length` | = places수 − 1 (off-by-one ❌) |
| 드라이빙가이드일 | isGuideDay면 구간 cost=0·일총합만 | shouldApplyGuidePrice 정합 |

**1일/1인 합계 (dailyCost.breakdown)**
| 항목 | 응답 키 | 합격 |
|---|---|---|
| 입장료 | `breakdown.entranceEur` | 존재 |
| 식비 | `breakdown.mealEur` | 존재 |
| 교통비 | `breakdown.transportEur` | 구간합산 가변 (€8.6 고정 = ❌) |

**지도 마커 ↔ 카테고리**
- place[].`seedCategory` ↔ 스샷 마커색 1:1 (불일치 지점 특정).

### ② BE — DB/Storage 관찰변화
**호출 횟수** (신규분만 TS+PM = #45)
| API | 확인처 | 기대 |
|---|---|---|
| Gemini | 서버로그/raw파일 | 1콜 |
| TS | raw파일 개수 | 신규 inserted 행수만큼 (기존 재활용 시 ↓) |
| PM | 이미지 신규분 | 이미지결손 신규분만 (이미 있으면 0) |

**PSR 변화**
- 신규도시: rows_before → rows_after (생성행 = 차이). 화면 슬롯수와 저장행수 일치?
- 기존도시: 행 안늘고 updated_at만 = 중복흡수 / 늘면 = 신규INSERT.
- **필수컬럼 채움 (신규행 각각)**: name_en, name_local, name_ko, latitude, longitude, google_place_id, google_maps_uri, google_review_count, price_eur, image_url, editorial_summary, summary_ko, seed_category, address, opening_hours, google_primary_type, distance_km_from_center, day_zone, category_tags, rank(트리거 후) → **결손 컬럼 목록 출력**.

**저장**
| 대상 | 확인 | 합격 |
|---|---|---|
| Storage `raw-responses/{CITY}/` | Gemini·TS 파일 생김 | 도시폴더 구조 (§18) |
| 이미지 | image_url = Storage URL | 신규 이미지 저장됨 |
| 로컬 `docs/raw/{CITY}/` | 신규폴더+pretty JSON | 관리자 즉시열람 형식 (§18) |

### 종합 판정
- 각 항목 ✅/❌ + ❌면 원인 1줄 → **DB-only 기준 벗어난 결함 전수 목록**.
- 수정은 보고 후 사장님 승인받아 별도 (제1조).

---

## 산출물 (docs/raw/{CITY}/)
- `{날짜}_verify_response.json` (응답 통째)
- 스샷 4종 (설명형 파일명)
- `{날짜}_verify_scorecard.md` (前<>後 diff + 채점표)
- WORKLOG 기입.
