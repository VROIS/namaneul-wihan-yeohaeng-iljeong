# Tripis 정리 묶음 1 — 근거 문서 (2026-10-16)

> 범위 = 아무도 안 쓰는 1회용 스크립트·워크플로 삭제. 코드 수정·이름바꾸기·설정 변경 없음. 삭제와 이 문서 작성, 두 가지만 했다.
>
> **git 기록 안내**: 이 저장소는 단일 `seed` 커밋(1bc4955)으로 압축되어 있어 `git log`가 모든 파일에 같은 날짜(세션 생성 시각)만 보여준다. 그래서 "마지막 수정 날짜"는 git이 아니라 **파일 안에 적힌 날짜 흔적**(주석의 YYYY-MM-DD)을 썼고, 없으면 "내부 흔적 없음"으로 그대로 적었다. 추정으로 날짜를 만들지 않았다.
>
> **비밀값 처리**: 삭제한 스크립트 일부에 DB 접속 주소·비밀번호가 평문으로 적혀 있었다(예: `p0-bts-events-seed.js`, `p0-migrate.js` 계열). 이 문서에는 파일 이름만 적고 값은 전부 삭제 처리했으므로 원문이 남아 있지 않다.

## 1. 삭제한 파일 — 묶음 2·3 (워크플로·DB 직접입력)

| 파일 | 묶음 | 참조 검사 결과 | 내부 날짜 흔적 |
|---|---|---|---|
| `scripts/sql/elpaso-bts2026/elpaso-00-delete.sql` | ② 엘파소 BTS 직접입력 | repo 전체에서 자기 자신(같은 묶음) 외 참조 0 | 없음 |
| `scripts/sql/elpaso-bts2026/elpaso-01-attraction.sql` | ② | 〃 | 없음 |
| `scripts/sql/elpaso-bts2026/elpaso-02-restaurant.sql` | ② | 〃 | 없음 |
| `scripts/sql/elpaso-bts2026/elpaso-03-healing.sql` | ② | 〃 | 없음 |
| `scripts/sql/elpaso-bts2026/elpaso-04-adventure.sql` | ② | 〃 | 없음 |
| `scripts/sql/elpaso-bts2026/elpaso-05-photospot.sql` | ② | 〃 | 없음 |
| `scripts/sql/elpaso-bts2026/elpaso-06-heritage.sql` | ② | 〃 | 없음 |
| `scripts/sql/elpaso-bts2026/elpaso-07-shopping.sql` | ② | 〃 | 없음 |
| `scripts/p2-bts2026-upsert.mjs` | ② | package.json·훅·.claude·다른 scripts·worker/client/shared/fillcity 참조 0. `scripts/sql/{slug}-bts2026/*.sql` 을 읽어 `db.query(sql)` 로 직접 INSERT = 제14조 금지(SQL 직접 입력) 그 모양 | 없음 |
| `.github/workflows/bts-bts2026-upsert.yml` | ② | 위 스크립트만 부름(자기 묶음 내부 참조). docs 1곳이 이름만 언급(참조로 안 침) | 없음(본문에 날짜 언급 없음) |
| `.github/workflows/bts-discover-direct.yml` | ③ 죽은 워크플로 | `node scripts/p1-bts-google-direct.mjs` 호출 → 그 파일이 저장소에 없음(확인됨). docs/_archive 가 "구 안(❌)"으로 이미 폐기 기록 | 2026-04-29(주석) |
| `.github/workflows/bts-image-fallback.yml` | ③ | `node scripts/p3-wikipedia-unsplash-fill.mjs` 호출 → 파일 없음(확인됨). docs 가 "v3 폐기(❌)"로 기록 | 없음 |
| `.github/workflows/bts-image-fallback-v2.yml` | ③ | `node scripts/p3-wikipedia-unsplash-fill-v2.mjs` 호출 → 파일 없음(확인됨). docs 가 "v3 폐기(❌)"로 기록. `.claude/commands/bts-image-fill.md` 가 이 파일명·스크립트명을 문서로 언급하지만 그 스크립트 자체가 이미 없어 그 문서 설명도 이미 못 실행되는 상태였음(아래 "지우지 않은 의심" 참고) | 없음 |
| `.github/workflows/bts-elpaso-verify-40.yml` | ③ | `node scripts/p2-elpaso-verify-40-images.mjs` 호출 → 파일 없음(확인됨) | 2026-04-28(주석) |

## 2. 삭제한 파일 — 묶음 ① scripts/ 1회용 스크립트 (55개)

전부 "참조 검사 결과 = package.json·.githooks·.claude·남은 workflows·다른 scripts 파일·worker/client/shared/fillcity·guard-no-reinvention owners 어디에도 이름 0건"으로 동일하게 통과했다. 아래 표는 파일별 성격과 내부 날짜 흔적만 구분해 적는다.

| 파일 | 내부 날짜 흔적 |
|---|---|
| `scripts/add-economic-enum.sql` | 없음 |
| `scripts/add-europe-cities.js` | 없음 |
| `scripts/add-missing-columns.js` | 없음 |
| `scripts/add-seedance-api-key.ts` | 없음 |
| `scripts/add-video-columns.js` | 없음 |
| `scripts/archive-bad-names.mjs` | 2026-05-14 |
| `scripts/check-all-tables.js` | 없음 |
| `scripts/check-api-keys.js` | 없음 |
| `scripts/check-columns.js` | 없음 |
| `scripts/check-crisis-db.js` | 없음 |
| `scripts/check-db-encoding.js` | 없음 |
| `scripts/check-db-status.js` | 없음 |
| `scripts/check-tables.js` | 없음 |
| `scripts/check_mcp.js` | 없음 |
| `scripts/clean-all-broken-final.js` | 없음 |
| `scripts/clean-broken-data.js` | 없음 |
| `scripts/clean-ig-aggressive.js` | 없음 |
| `scripts/create-api-keys-table.js` | 없음 |
| `scripts/create-test-itinerary.js` | 2026-02-01 |
| `scripts/db-encoding-fix.js` | 없음 |
| `scripts/fill-missing-mcp-data.js` | 없음 |
| `scripts/final-cleanup.js` | 없음 |
| `scripts/final-ig-cleanup.js` | 없음 |
| `scripts/fix-all-broken.js` | 없음 |
| `scripts/fix-cities-final.js` | 없음 |
| `scripts/fix-db-simple.js` | 없음 |
| `scripts/fix-duplicates.js` | 없음 |
| `scripts/fix-guide-prices.js` | 없음 |
| `scripts/fix-korean-encoding.js` | 없음 |
| `scripts/fix-missing-cities.js` | 없음 |
| `scripts/fix-schedule-dup.js` | 없음 |
| `scripts/fix-sequences.js` | 없음 |
| `scripts/get-latest-itinerary-id.ts` | 없음 |
| `scripts/import-data-only.js` | 없음 |
| `scripts/import-data-step.js` | 없음 |
| `scripts/import-single-connection.js` | 없음 |
| `scripts/import-to-supabase.js` | 없음 |
| `scripts/import-with-insert.js` | 없음 |
| `scripts/list-byteplus-models.ts` | 없음 |
| `scripts/merge-db-duplicates.mjs` | 2026-05-14 |
| `scripts/migrate-add-raw-data.ts` | 없음 |
| `scripts/migrate-crisis-alerts.js` | 2026-01-15 |
| `scripts/migrate-drop-43-dead-cols.mjs` | 없음 |
| `scripts/migrate-guide-prices.js` | 없음 |
| `scripts/migrate-itineraries-protagonist.js` | 없음 |
| `scripts/migrate-users-vibes.js` | 없음 |
| `scripts/p0-bts-events-seed.js` | 2026-04-09 (파일 안에 평문 DB 접속정보 있었음 → 삭제로 같이 제거됨) |
| `scripts/p0-data-migrate.js` | 없음 (평문 DB 접속정보 있었음 → 삭제로 같이 제거됨) |
| `scripts/p0-migrate.js` | 없음 |
| `scripts/p0-prod-migrate.js` | 없음 (평문 DB 접속정보 있었음 → 삭제로 같이 제거됨) |
| `scripts/restore-data-v2.js` | 없음 |
| `scripts/restore-data.js` | 없음 |
| `scripts/test-crisis.js` | 없음 |
| `scripts/upload-via-api.js` | 없음 |
| `scripts/verify-db-clean.js` | 없음 |

## 3. 보존한 후보와 이유 (삭제하지 않음)

| 파일 | 삭제 후보였던 이유 | 보존 이유(확실한 근거) |
|---|---|---|
| `scripts/backup-place-seed-raw-43-cols.mjs` | 보존 패턴에 안 걸림 | `scripts/migrate-drop-43-dead-cols.mjs` 안내문이 "먼저 이 스크립트를 실행하라"고 참조함(다른 scripts 파일 참조 적중) |
| `scripts/dev-pipeline.mjs` | 보존 패턴에 안 걸림 | `eslint.config.js`가 "Workflow 스크립트(top-level await/return 특수 컨텍스트)"로 명시 제외 처리. 파일 자체도 `export const meta = {...}` 형태의 현역 Workflow 스크립트(회귀방지 파이프라인) |
| `scripts/gen-cobe-inline.mjs` | 보존 패턴에 안 걸림 | 파일 1행에 `⚠️ 수정금지(승인필요) 2026-07-30` 마커. `node_modules/cobe`를 읽어 `client/screens/bts/cobe-inline.ts`를 생성하는 현역 빌드 도구 |
| `scripts/city-link-repair.mjs` | 보존 패턴에 안 걸림 | 파일 1행에 `⚠️ 영구 컴포넌트 2026-08-02 사장님 승인` 마커(도시 연결 정리, 현역) |
| `scripts/p0-bts-clear-bad-images.mjs` | 보존 패턴에 안 걸림 | `⚠️ 수정금지(승인필요) — 사용자 2026-04-25 승인` 마커 |
| `scripts/p0-bts-dedupe-cities.mjs` | 보존 패턴에 안 걸림 | 〃 |
| `scripts/p0-psr-to-places-sync.mjs` | 보존 패턴에 안 걸림 | 〃 |
| `scripts/omni-clips-preview.ts` | 보존 패턴에 안 걸림 | `⚠️ 수정금지(승인필요) 2026-09-26 사장님 결정` 마커, 옴니 시험 도구(현역) |
| `scripts/publish-day-video.ts` | 보존 패턴에 안 걸림 | `⚠️ 수정금지(승인필요) 2026-09-26 사장님 결정` 마커, 완성본 게시 도구(현역) |
| `scripts/stripe-replay-webhook.mjs` | 보존 패턴에 안 걸림 | `⚠️ 수정금지(승인필요) 2026-08-06 사장님 SSOT`에 "1회용 아님" 명시 |
| `scripts/verify-ios-auth.mjs` | 보존 패턴에 안 걸림 | `.github/workflows/ios-auth-verify.yml`이 현재도 호출(워크플로 참조 적중) |

## 4. 자체 검증 결과

| 항목 | 결과 |
|---|---|
| `package.json`의 `scripts` 칸 경로 전부 존재 | ✅ 통과 (`prepare`·`db:push`·`lint`·`lint:fix`·`check:types`·`check:format`·`format`·`android`·`ios` 전부 scripts/ 경로가 아니거나 삭제 대상과 무관) |
| `.githooks/*` 가 부르는 파일 전부 존재 | ✅ 통과 (`pre-commit`→`guard-commit-approval.mjs`·`verify-pipeline.mjs`, `post-commit`→`guard-commit-approval.mjs`, `pre-rebase`→`guard-no-history-rewrite.mjs`, 전부 보존 목록) |
| `.husky` 폴더 | 없음(해당 없음) |
| `.claude/settings.json` 훅이 부르는 파일 전부 존재 | ✅ 통과 (`guard-bash-danger.mjs`·`guard-fillcity.mjs`, 전부 보존 목록) |
| 남은 `.github/workflows/*.yml` 이 부르는 scripts/ 파일 전부 존재 | ✅ 통과 (유일하게 스크립트를 부르는 `ios-auth-verify.yml` → `verify-ios-auth.mjs` 존재 확인) |
| `scripts/guard-no-reinvention.mjs` 의 owners 파일 전부 존재 | ✅ 통과 (owners 전부 `worker/lib/services/**`·`fillcity/steps/**`·`scripts/release.mjs`·`scripts/verify-before-commit.mjs` = 삭제 대상과 무관, 전부 보존됨) |
| `npm ci` 후 `npx tsc --noEmit` 가지 생성 전(`master`)과 비교 | ✅ 통과 — `npm ci` 성공. 가지 생성 전 `master`와 삭제 후 `claude/cleanup-01` 양쪽에서 `npx tsc --noEmit` 실행 결과가 **완전히 동일**(`worker/lib/db.ts`·`worker/lib/services/shared/r2-client.ts`의 `cloudflare:workers` 타입선언 관련 오류 4건, 이번 삭제와 무관한 기존 오류). `diff` 로 바이트 단위 대조 = 신규 오류 0건 |

## 5. 지운 파일 수·줄 수 합계

- **지운 파일 = 69개** (`git diff --cached --stat` 실측)
- **지운 줄 수 = 6,852줄** (`git diff --cached --stat` 실측, 전부 삭제(-)만 있고 추가(+)는 0)
  - 묶음 ① scripts 1회용 55개
  - 묶음 ② 엘파소 BTS 직접입력 10개(sql 8 + mjs 1 + yml 1)
  - 묶음 ③ 죽은 워크플로 4개

## 6. 지우지 않은 의심 파일 (한 번이라도 헷갈려서 보존)

| 파일 | 헷갈린 지점 |
|---|---|
| `.claude/commands/bts-image-fill.md` | 이 스킬 문서 122·191·193행이 `scripts/p3-wikipedia-unsplash-fill-v2.mjs`와 `.github/workflows/bts-image-fallback-v2.yml`을 현재 절차로 설명하고 있다. 그런데 그 스크립트 자체는 이미 저장소에 없어(이번 삭제 전부터) 그 문서의 그 부분은 이미 실행 불가능한 상태였다. 이번 작업 범위는 "삭제"뿐이라 이 `.md` 파일은 건드리지 않았다. 사장님이 별도로 이 스킬 문서를 갱신할지 정하셔야 한다 |
| `scripts/_capture/2026-05-09-prod-buttons/` | 스크립트가 아니라 캡처(스크린샷류) 보관 폴더로 보여 "1회용 스크립트" 범위 밖으로 보고 손대지 않았다 |
| `scripts/.trigger-ci.txt` | 스크립트가 아니라 CI 트리거용 마커 파일로 보여 범위 밖으로 보고 손대지 않았다 |
| `docs/2026-08-06 Cloudflare 이전 실행계획.md` 69행 | 과거에 `bts-image-fallback.yml`을 "별도 수동 워크플로, 승인 범위 밖 = 보존"이라고 명시적으로 보존 결정한 기록이 있다. 이번에는 그 워크플로가 부르는 스크립트(`p3-wikipedia-unsplash-fill.mjs`)가 없어져 있어 삭제 후보 ③ 기준(부르는 파일이 없다)에는 맞았다. 문서는 참조로 치지 않는 규칙에 따라 삭제했지만, 과거 보존 결정이 있었다는 사실은 여기 남긴다 |
