---
description: 도시 시드 발굴 영구 SSOT v3 — 이 스크립트 + 이 프롬프트 그대로 사용 (잠금 명령)
argument-hint: <도시명> [--commit]
---

# 🔒 도시 시드 v3 = 잠금 실행 명령 (= 2026-05-12 확정)

**입력**: $ARGUMENTS (예: `Brussels --commit`, `Busan`)

---

## ⛔ 이 스킬의 본질 (= 작성요령 X = 실행 명령)

이 스킬 = **"이런 식으로 짜라" 가이드 아님**.
이 스킬 = **"이 스크립트 + 이 프롬프트 그대로 호출하라" 명령**.

**자동화 = 항상 같은 입력 → 항상 같은 결과** = 스크립트/프롬프트가 매번 바뀌면 자동화 깨짐.
브뤼셀 시뮬 (2026-05-12, 120 곳 / 86 초 / $0.006) = 이 조합 최적 증명. **변경 금지**.

---

## ✅ 정확히 이것만 실행 (= 1 줄 명령)

```bash
node scripts/seed-gemini.mjs --city-name=<도시명> --commit
```

| 항목 | 잠금 값 (= 변경 금지) |
|---|---|
| **스크립트 경로** | `scripts/seed-gemini.mjs` |
| **모델** | `gemini-3-flash-preview` (스크립트 내부 hardcoded) |
| **프롬프트** | 스크립트 내부 v3 (= 헌법 §2 그대로) |
| **Config** | `temperature: 0.2, maxOutputTokens: 50000, thinkingBudget: 0` |
| **Tools** | `[{ googleSearch: {} }]` |
| **변수** | `<도시명>` 하나만 (= name_en 또는 city_id) |

**도시명만 = dry-run** (= DB 변경 X = 안전 시뮬):
```bash
node scripts/seed-gemini.mjs --city-name=Brussels
```

**--commit 추가 = DB 실제 적용**:
```bash
node scripts/seed-gemini.mjs --city-name=Brussels --commit
```

= 한 번 실행 = **4 단계 자동 진행** (= Gemini → TextSearch → PhotoMedia → DB).
= 도시명만 바꿔서 **다른 도시 동일 호출 = 동일 결과 보장**.

---

## ❌ 금지 행동 (= 위반 즉시 작업 중단)

| # | 금지 | 이유 |
|---|---|---|
| 1 | 새 스크립트 `_tmp_*.mjs` / `seed-v2.mjs` / `seed-improved.mjs` 신규 작성 | 결과 들쭉날쭉 = 자동화 X |
| 2 | 프롬프트 단어 추가/삭제 ("더 좋아 보임" 사유) | 응답 형식 깨짐 |
| 3 | 모델 교체 (`gemini-2.5-flash`, lite 모델 등) | 검증된 조합 깨짐 |
| 4 | Config 변경 (`temperature` 등) | 응답 일관성 깨짐 |
| 5 | `tools: googleSearch` 제거 | grounding 끊김 = 옛 정보 |
| 6 | "임시 1 회" 우회 시도 | 영구화됨 |
| 7 | 메인앱/BTS에서 같은 작업 다른 스크립트로 호출 | SSOT 위반 |

= 위 7 가지 어떤 것도 = **사용자 자연어 승인 없이 실행 금지**.

---

## 📋 참조 헌법

- [docs/SEED_SSOT_2026-05-02.md](../../docs/SEED_SSOT_2026-05-02.md) — 잠금 표준 + 변경 통제
- [CLAUDE.md](../../CLAUDE.md) — 작업 헌법 (= 승인 없는 수정 금지)

---

## v3 핵심 변경 (= 2026-05-12 사용자 SSOT 확정)

| 변경 | v2 (2026-05-08) | v3 (2026-05-12) |
|---|---|---|
| Korean travelers 컨텍스트 | ❌ | ✅ "for KOREAN TRAVELERS" 명시 |
| 한국 인기 기준 | ❌ Google ranking | ✅ 인스타/블로그/유튜브 트렌드 |
| place_id 받기 | ⚠️ Gemini = 가짜 위험 | ✅ TextSearch 후만 신뢰 |
| google_review_count | ⚠️ Gemini = 가짜 위험 | ✅ TextSearch 응답값만 |
| primary_type / types | ❌ 우리 카테고리만 사용 | ✅ TS 응답값 (= 보조) |
| shortform_en (영어) | ✅ 있음 | ❌ 제거 (= 프론트엔드 안 씀) |
| selection_reason_ko | ❌ | ✅ 신규 (= 인스타/FOMO 톤) → `summary_ko` |
| shortform_ko | 톤 약함 | ✅ 강화 (= 코믹/위트 Claude 톤) → `editorial_summary` |
| 이미지 매칭 | Wikipedia 우선 + Google 폴백 | ✅ TextSearch 단일 경로 (= Wikipedia 폐기) |

---

## 📖 참조 = 이 스크립트가 내부적으로 수행하는 4 단계 (= 수정 금지)

> ⚠️ 아래는 **이미 구현된 동작의 참조 설명**입니다. AI 가 "더 좋게 다시 짜겠다" 시도 시 = 자동화 깨짐.
> 변경 필요 시 = 헌법 §11 변경 통제 절차 (= 사용자 명시 승인) 적용.

### Step 1 — Gemini 3 Flash 호출 (헌법 §1, §2)
- 모델 `gemini-3-flash-preview` (= URL hardcoded, 변경 X)
- `tools: [{ googleSearch: {} }]` (Google Search Grounding)
- `generationConfig: { temperature: 0.2, maxOutputTokens: 50000, thinkingBudget: 0 }`
- prompt = **헌법 §2 그대로** (= 도시명만 변수)
- 응답 = **10 필드** × 6 카테고리 × 20 = 120 곳
  - rank / name_en / name_local / name_ko / lat / lng / address
  - **selection_reason_ko** (= 인스타/FOMO 사회적 검증)
  - **shortform_ko** (= 코믹/위트 Claude 톤)
  - distance_km / day_zone
- 잘림 자동 복구 (recoverJson) = 안전장치
- 저장: `docs/raw/{city_key}.json` + `.raw.txt`

### Step 2 — TextSearch + PhotoMedia (= 신규 행만, 헌법 §3)
- 통합 매칭 우선순위 = **행정주소 > 장소명 > 좌표** (= 시드 + 메인앱 AG3 공통 SSOT)
- 시드: 매칭 행 = DB UPDATE 텍스트 보강 / 미매칭만 TS+PM 호출 (= 신규 이미지)
- AG3 (메인앱 실시간): 매칭 행 = DB 그대로 / 미매칭만 TS+PM = **2차 호출 70%+ 감소**
- `POST /v1/places:searchText` (textQuery = `{name_en} {address}`)
- 응답 14 요소 = 검증된 place_id + 좌표 + 사진명 등 = **2 차 DB 입력**
- `places.photos[0].name` 으로 PhotoMedia GET → binary → Storage upload
- rate limit = sleep 6000ms (= 분당 10 한도)
- 검증된 google_place_id / TS 좌표 / TS 주소 = Gemini 응답 덮어쓰기

### Step 3 — DB 트랜잭션 (헌법 §5)
- BEGIN
- 기존 도시 행 = `phase_tags || ARRAY['archived-2026-05']` (= DELETE 절대 X)
- 좌표 100m 매칭 = Gemini + TS 신규 데이터로 UPDATE (= 덮어쓰기)
- 매칭 X = 신규 INSERT (`collection_phase = 'gemini3-2026-05'`, `phase_tags = ['gemini3', 'gemini3-2026-05']`)
- **v3 컬럼 매핑**:
  - `name_en` / `name_ko` / `name_local` / `latitude` / `longitude` / `address`
  - `google_review_count` (= TS 응답) / `google_primary_type` (= TS 응답)
  - `editorial_summary` ← **shortform_ko** (= 코믹/위트 후킹 카피)
  - `summary_ko` ← **selection_reason_ko** (= 인스타/FOMO 사회적 검증)
  - `day_zone` / `distance_km_from_center`
  - `image_url` (= Storage URL) / `google_place_id` (= TS 검증)
- 검증: SELECT COUNT(*) + 필드 채움 비율
- COMMIT (실패 시 ROLLBACK)

### Step 4 — 단일 통합 `docs/qa/index.html` 재생성 (헌법 §8)
- 모든 `collection_phase = 'gemini3-2026-05'` 도시 SELECT
- **카드 SSOT** (= 사용자 SSOT 슬롯 카드 = 2 줄 시각 위계):
  - 이미지 + rank 뱃지
  - name_ko (= 굵게, 큰 폰트)
  - **editorial_summary** (= shortform_ko = 후킹 카피, 중간 톤)
  - **summary_ko** (= selection_reason_ko = FOMO, 회색 작게)
  - 거리 + day_zone 뱃지

---

## 컬럼 매핑 표 (= 프론트엔드 호출 시 반드시 매칭)

| Gemini 응답 필드 | DB 컬럼 (= place_seed_raw) | 프론트엔드 노출 위치 |
|---|---|---|
| `selection_reason_ko` | `summary_ko` | 슬롯 카드 서브라인 (= FOMO 회색) |
| `shortform_ko` | `editorial_summary` | 슬롯 카드 메인 후킹 (= 중간 톤) |
| `name_en` | `name_en` | TS 매칭 키 |
| `name_local` | `name_local` | TS 매칭 보조 |
| `name_ko` | `name_ko` | 슬롯 카드 제목 |
| `address` | `address` | **AG3 매칭 1 순위 + 모달 표시** |
| `lat` / `lng` | `latitude` / `longitude` | 지도 마커 (= TS 덮어쓰기) |

TS 응답 → DB 컬럼:
| TS 응답 | DB 컬럼 |
|---|---|
| `places.id` | `google_place_id` (= 검증된 ID = 모달 Embed 호출) |
| `places.userRatingCount` | `google_review_count` |
| `places.primaryType` | `google_primary_type` |
| `places.types` | (= 보조, JSON 저장 가능) |
| `places.photos[0].name` | (= PhotoMedia 호출 키 = 임시) |
| PhotoMedia binary → Storage | `image_url` |

---

## 안전장치 (모든 Step 공통)

| # | 안전장치 |
|---|---|
| 1 | Step 1 잘림 자동 복구 (recoverJson) + JSON 파싱 실패 시 STOP + raw 보존 |
| 2 | Step 2 TextSearch 매칭 실패 시 = 이미지 X + 다음 행 (= 스크립트 중단 X) |
| 3 | Step 2 PhotoMedia 429 = 60s 대기 + retry, sleep 6000ms |
| 4 | Step 3 DB 트랜잭션 BEGIN/COMMIT/ROLLBACK |
| 5 | Step 3 옛 행 = DELETE X / phase_tags archived 추가 |
| 6 | UNIQUE INDEX (city_id, lower(trim(name_en))) 충돌 회피 = name_en 1차 매칭 |
| 7 | quota 안전 마진 = PhotoMedia 무료 한도 (일 2,000 안) + TS Essentials |

---

## 통과 (검증) 기준

1. **DB**: v3 핵심 필드 = 100% 채움 (= `name_en`, `summary_ko`, `editorial_summary`, `google_place_id`)
2. **이미지 매칭**: 80% 이상 (= TS 응답 photos[0] 보유율)
3. **프론트엔드**: 슬롯 카드 = 2 줄 시각 위계 = `editorial_summary` + `summary_ko` 모두 표시
4. **사용자 시각 검수 = 통과 / 실패**

= 누락 시 = 즉시 STOP + 수정 + 재실행.

---

## AI 행동 약속 (사용자 명시)

- 시드/이미지/HTML 작업 = `scripts/seed-gemini.mjs` 만 호출 또는 수정
- 임시 `_tmp_*.mjs` / `_diag-*.mjs` (1 회 진단 외) 신규 작성 = 사용자 명시 승인 시에만
- "복붙 + 일부 누락" 패턴 = 발견 즉시 사용자 보고 + 수정
- 헌법 §1, §2 변경 = 사용자 자연어 검토 + 명시 승인 후에만

---

## 호출 예시

```bash
# 브뤼셀 시드 발굴 (= v3 검증 완료 도시)
node scripts/seed-gemini.mjs --city-name=Brussels --commit

# 부산 = dry-run (= DB 변경 X)
node scripts/seed-gemini.mjs --city-name=Busan

# city_id 직접 지정
node scripts/seed-gemini.mjs --city-id=41 --commit

# Gemini 재호출 스킵 (= 이미 raw 있음)
node scripts/seed-gemini.mjs --city-name=Brussels --skip-gemini --commit
```

= 도시명 하나 = 4 단계 자동 진행 = **사용자 SSOT 자동화**.

---

## 비용 모델 v3 (= 도시당)

| 단계 | API | 비용/도시 |
|---|---|---|
| Step 1 = Gemini 3 Flash | grounded | $0.006 (= 브뤼셀 검증) |
| Step 2 = TextSearch (= 120 곳) | Essentials + Pro 일부 | ~$3.00 (= 120 × $0.025) |
| Step 2 = PhotoMedia | 무료 한도 | $0 |
| Step 3 = DB | Supabase | 무료 |
| **합계** | | **~$3 / 도시** |

= 32 도시 자동 = ~$96 (= 4 단계 자동) = **단일 명령 = 도시명만 입력**.