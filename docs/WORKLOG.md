# WORKLOG — 단일 통합 작업 일지

> **정책 (= 사용자 SSOT 2026-05-14)**:
> - 모든 작업 일지 = 이 1 파일에 = **날짜 역순** 누적
> - 옛 일지 파일 = `_archive/` 이동
> - 영구 SSOT = `docs/SEED_SSOT_2026-05-02.md` (= 헌법 = 잠금)
> - 메모리 [[feedback_latest_is_truth_delete_old]] = 최신이 정답

---

## 📚 영구 참조 (= 잠금 SSOT)

| 문서 | 역할 |
|---|---|
| [`CLAUDE.md`](../CLAUDE.md) | AI 작업 헌법 (= 위반 시 퇴출) |
| [`docs/SEED_SSOT_2026-05-02.md`](SEED_SSOT_2026-05-02.md) | 시드 발굴 + 통합 매칭 SSOT v3 (= 잠금) |
| [`.claude/commands/seed-city.md`](../.claude/commands/seed-city.md) | 시드 발굴 스킬 (= 잠금 명령) |

---

## 2026-05-14 (= 오늘) — DB 통합 + 메인앱 v3 적용

### 🎯 핵심 결정

1. **매칭 SSOT 통합** = 시드 + 메인앱 AG3 = **동일 알고리즘** (= 행정주소 > 이름 > 좌표 10m > TS+PM)
2. **좌표 매칭 = 10m** (= 도심 밀집 = 100m 너무 넓음 = 잘못 매칭 원인)
3. **WK 이미지 보존 SSOT** = 87% 자산 = COALESCE 기존 우선 = 자동 덮어쓰기 X
4. **메인앱 v3 prompt** = `gemini-3-flash-preview` + googleSearch grounding (= 시드와 통일)
5. **신규 필드** = `selection_reason_ko` (= 인스타/FOMO) + `shortform_ko` (= 코믹/위트)
6. **컬럼 매핑** = `summary_ko` ← selection_reason_ko / `editorial_summary` ← shortform_ko
7. **백그라운드 saveNewPlacesToDB** = `await` 제거 = 응답 속도 ↑ + DB 자동 캐싱
8. **BAD_NAME 자동 감지** = 분류명/도시명/일반명 archive (= 옛 시드 오류 정정)
9. **단일 WORKLOG.md** = 매일 새 일지 X (= 사용자 검색 용이)

### 🔧 코드 변경 (= 미커밋, 대기)

| 파일 | 변경 |
|---|---|
| `server/services/agents/pipeline-v3.ts` | v3 prompt + 모델 `gemini-3-flash-preview` + grounding + GeminiPlace 인터페이스 (= `address`/`selection_reason_ko`/`shortform_ko`) + `saveNewPlacesToDB` 백그라운드 + GeminiPlace→PlaceResult 매핑 + 추적 메타 (`_matching`/`_backgroundSave`) |
| `server/services/agents/ag3-data-matcher.ts` | 통합 매칭 = 행정주소 > 이름 > 좌표 10m / INSERT 컬럼 매핑 = `editorialSummary` ← description / `summaryKo` ← personaFitReason |
| `scripts/seed-gemini.mjs` | v3 prompt + STEP 2 TextSearch + 좌표 10m + 컬럼 매핑 |
| `docs/SEED_SSOT_2026-05-02.md` | 헌법 v3 = 잠금 명령 + 통합 매칭 + WK 보존 |
| `.claude/commands/seed-city.md` | 스킬 = 잠금 명령 |
| (= 어제 2026-05-12 변경) `client/components/PlaceDetailModal.tsx` | Google Maps Embed iframe (= 우리 모달 폐기) |
| (= 어제) `client/screens/TripPlannerScreen.tsx` | WK 이미지 helper 적용 |
| (= 어제 신규) `client/lib/wikimedia-image.ts` | BTS 1주일 SSOT helper |

### 🗄️ DB 변경 (= 이미 COMMIT 됨, 비가역)

| 작업 | 영향 | phase_tag |
|---|---|---|
| **39 그룹 병합** | 42 행 archived | `archived-merge-2026-05-14` |
| **616 BAD_NAME 정리** | 616 행 archived | `archived-bad-name-2026-05-14` |
| **브뤼셀 시드 재시뮬** | 84 UPDATE + 36 INSERT | `gemini3-2026-05` |

### 📦 정리 작업 (= 비가역)

| 작업 | 영향 |
|---|---|
| 1 차 cleanup (= step*/_tmp/_diag/elpaso 등) | ~127 파일 삭제 |
| 2 차 cleanup (= db_investigate/check-/test-/일회용) | ~50 파일 삭제 |
| 옛 docs 정리 | ~19 파일 삭제 |
| **합계** | **~196 파일 정리** |

### 📊 검증 결과 (= Paris 18 곳 = 메인앱 v3 시뮬)

| 항목 | 값 |
|---|---|
| 매칭률 | **11/18 = 61%** (= 정직, 잘못 매칭 0) |
| 1 순위 행정주소 | 7 |
| 2 순위 이름 | 4 |
| 단어 단위 | 2 |
| 좌표 10m | 0 |
| 미매칭 (= TS+PM) | 7 |
| Gemini 응답 | 15.7s / $0.0012 |
| **사용자 응답 (예상)** | **~15s** (= TS+PM 백그라운드 분리) |

### 🔍 추적 도구

| 도구 | 사용 |
|---|---|
| **DB 직접 추적** | `node scripts/_diag-bg-verification.mjs baseline` / `diff` |
| **API 응답 metadata** | 클라이언트 DevTools = `response.metadata._matching` / `._backgroundSave` |
| **DB 매칭 검증** | `node scripts/_diag-mainapp-paris-match-rate.mjs` |
| **audit 파일** | `backups/merge-audit-commit-2026-05-14.json` 등 |

### ⚠️ Replit 서버 콘솔 = 사용자 접근 X
= 백엔드 로그 추적 = API 응답 metadata 우회 = 사용자 클라이언트 DevTools 확인.

### 🔜 후속 작업 = 12 개 (= /simplify + /review + react best 발견)

| # | 우선 | 작업 |
|---|---|---|
| 1 | P1 | haversine 중복 (3 곳) → `server/utils/geo-utils.ts` 추출 |
| 2 | P1 | O(N×M) 매칭 효율 → 도시 반경 사전 필터 + bounding box |
| 3 | P1 | saveNewPlacesToDB silent 실패 → APM 모니터링 |
| 4 | P2 | magic strings 8 곳 → `constants/phase-tags.ts` |
| 5 | P2 | seed-gemini.mjs ↔ ag3 매칭 중복 → 공통 lib |
| 6 | P2 | matchPlacesWithDB 반환 = `{places, stats}` → 매칭 통계 정확 추적 |
| 7 | P2 | PlaceDetailModal waterfall fetch → SWR/React Query |
| 8 | P2 | PlaceDetailModal null state → enum/객체 |
| 9 | P2 | PlaceDetailModal URL 빌더 → 헬퍼 추출 |
| 10 | P3 | 주석 "WHAT" → "WHY" 압축 |
| 11 | P3 | GeminiPlace 인터페이스 = 옛 `reason` 필드 제거 |
| 12 | P3 | AG3 매칭 4+ 중첩 → `matchByAddress()` 추출 |

### 📝 다음 단계 = 커밋/푸시 (= 사용자 명시 시)

1. baseline 캡처 = `node scripts/_diag-bg-verification.mjs baseline`
2. `git commit` + `git push`
3. Replit Republish (= 백엔드)
4. EAS Update OR Expo Go 재시작 (= 클라이언트 모달 + WK 이미지)
5. 운영 검증 = Paris 일정 생성 → 응답 metadata 확인 + DB diff

---

## 2026-05-12 — Pipeline v3 사용자 SSOT 정비

### 🎯 핵심 결정

- **DB DROP 43 데드 컬럼** = 90 → 47 (= 28 Atmosphere SKU + 10 legacy + 5 unused)
- **`resolvePrice` 매트릭스 폴백** = `MEAL_BUDGET[travelStyle]?.[mealType]` 추가
- **`PlaceDetailModal` 통째 재작성** = Google Maps Embed iframe (= 사진/평점/리뷰 자동)
- **WK 이미지 helper** = BTS 1주일 SSOT (= UA + bucket + Platform 분기)
- **`saveNewPlacesToDB` 복원** = DB 자동 캐싱 SSOT (= 사용자 명시 정정)

### 🔧 변경

| 파일 | 변경 |
|---|---|
| `scripts/migrate-drop-43-dead-cols.mjs` (신규) | 트랜잭션 DROP COLUMN |
| `scripts/backup-place-seed-raw-43-cols.mjs` (신규) | 백업 (= 59 KB) |
| `server/services/agents/pipeline-v3.ts:72-99` | `resolvePrice` + matrix fallback |
| `server/services/sync-place-seed-trucks.ts` | `runBackfillGooglePlaceId` 폐기 (= Enterprise SKU) |
| `server/routes.ts` + `server/admin-routes.ts` | 2 routes 410 Deprecated |
| `client/components/PlaceDetailModal.tsx` | Google Embed iframe |
| `client/screens/TripPlannerScreen.tsx` | description 우선순위 (= description \|\| geminiReason \|\| personaFitReason) |
| `client/lib/wikimedia-image.ts` (신규) | WK helper |

### 📊 검증

- DB: 10,836 행 보존 + 43 컬럼 정확 DROP
- 코드: TypeScript 0 추가 에러 (= 기존 `nameKo` 오류 5 곳만 = 별개)

---

## 이전 일지 = `_archive/` 이동

| 파일 | 날짜 | 주제 |
|---|---|---|
| `2026-05-05 — gemini3 데이터 정리 + HTML 재작성 plan.md` | 2026-05-05 | gemini3 데이터 정리 + HTML 재작성 (= 완료) |
| `2026-05-08 앱 1차 제미나이 프롬프트 버젼1.md` | 2026-05-08 | AG2 v2 prompt 명세 (= 본 일지에 흡수) |
| `2026-05-09 여정숓폼 생성 과정.md` | 2026-05-09 | 5 에이전트 분리 + 영상 차별화 (= 완료) |
| `2026-05-09 운영 백엔드 데이터 흐름 추적.md` | 2026-05-09 | 운영 16 슬롯 추적 (= 완료) |
| `2026-05-09 운영 버튼 전수 현미경 검증.md` | 2026-05-09 | 운영 버튼 검증 (= 완료) |
| `2026-05-10 DB 효율극대화.md` | 2026-05-10 | 9 컬럼 SSOT + 메인앱 v3 분석 (= 본 일지 흡수) |

= 위 파일들 = `docs/_archive/` 이동 후 = 본 WORKLOG.md 가 단일 진입점.

---

## 변경 통제

- 이 파일 = **단일 일지 = 누적**.
- 새 작업 = 최상단에 새 섹션 (날짜 역순).
- 옛 일지 파일 = 절대 새로 만들지 X (= 사용자 SSOT 2026-05-14).
- 핵심 SSOT 변경 = `docs/SEED_SSOT_2026-05-02.md` (= 헌법) 갱신.
