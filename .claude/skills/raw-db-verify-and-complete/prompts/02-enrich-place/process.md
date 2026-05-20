# 02-enrich-place — 필수 과정

## 호출 흐름

```
[입력] city_id, batch 사이즈 (= 40 기본)
   ↓
1. place_seed_raw = 활성 행 SELECT id ASC (= 카테고리 무관)
   = WHERE city_id = $1 AND NOT (phase_tags && ARRAY['archived-*'])
   ↓
2. batch 분할 (= 40 곳 / batch)
   ↓
3. 각 batch = ${JSON_INPUT} 치환
   ↓
4. _call-config.md 표준 호출
   ↓
5. 응답 raw JSON = docs/raw/{city_id}/02-enrich-batch-{offset}.json 저장
   ↓
6. Adaptive fallback (= 실패 시 30 → 20 → 10)
   ↓
7. post-process.ts = 응답 id 매칭 + upsertPlace() UPDATE
```

## Adaptive Fallback

| 시도 | batch 사이즈 | 다음 |
|---|---:|---|
| 1 | 40 | 응답 OK = 다음 batch 도 40 |
| 1 실패 | - | 30 시도 |
| 2 | 30 | 응답 OK = 다음 batch 도 30 |
| 2 실패 | - | 20 시도 |
| 3 | 20 | 응답 OK = 다음 batch 도 20 |
| 3 실패 | - | 10 시도 (= 최소) |
| 4 | 10 | 응답 OK = 다음 batch 도 10 |
| 4 실패 | - | 사용자 검수 = 행 별 의심 처리 |

## 응답 매칭 (= id 기반)

- 입력 id (= place_seed_raw.id) = 응답 places[].id 정확 일치 필수
- 누락 id = 재호출 또는 사용자 검수
- 추가 id (= 응답에만 있는 가짜) = 무시

## 데이터 흐름 (= 응답 → DB)

| 응답 필드 | upsertPlace 필드 | DB 컬럼 | 정책 |
|---|---|---|---|
| `id` | (매칭 키) | `place_seed_raw.id` | - |
| `name_en` | `nameEn` | `name_en` | 입력 그대로 (= 변경 X) |
| `name_local` | `nameLocal` | `name_local` | COALESCE 새 우선 (= 갱신) |
| `name_ko` | `nameKo` | `name_ko` | COALESCE 새 우선 |
| `address` | `address` | `address` | COALESCE 옛 우선 (= 신뢰 데이터) |
| `latitude`/`longitude` | `latitude`/`longitude` | (좌표) | COALESCE 옛 우선 |이것도 최신우선임
| `summary_ko` | `selectionReasonKo` | `summary_ko` | 새 우선 (= Gemini 큐레이션 갱신) |
| `editorial_summary` | `shortformKo` | `editorial_summary` | 새 우선 |
| `estimated_price_eur` | `priceEur` | `price_eur` | **GREATEST 비싼 쪽** (= §14) / shopping 강제 null |

## 검증 조건

| 항목 | 기준 |
|---|---|
| 응답 places 길이 | 입력 batch 길이와 동일 |
| 응답 id = 입력 id | 정확 일치 |
| 누락 id | 0 |
| name_en = 입력 그대로 | 100% (= 매칭 키 보호) |
| UPDATE 결과 | UPDATE 수 = 응답 수 / errors 0 |

## 비용 (= 본 세션 실측)

- 1 호출 약 6000-7500 토큰 (= 40 곳)
- 비용 ≈ $0.002 / 호출
- 도시 활성 422 행 = 11 batch = 약 $0.02