# 05-text-recategorize — 최종 결과 보고서 템플릿

## 도시 정보

| 항목 | 값 |
|---|---|
| city_id | `{19}` |
| 활성 행 수 (= 입력) | `{N}` |
| 호출 일자 | `{YYYY-MM-DD}` |

## Gemini 호출 결과

| batch | offset | 사이즈 | finishReason | 정정 후보 | 토큰 | 비용 |
|---:|---:|---:|---|---:|---:|---:|
| 1 | 0 | 100 | STOP | `{N}` | ~10000 | $0.003 |
| 2 | 100 | 100 | STOP | `{N}` | ~10000 | $0.003 |
| ... | ... | ... | ... | ... | ... | ... |
| **합계** | - | - | - | `{N}` | - | `{$N}` |

## 산출물 raw 보관

- 경로 = `docs/raw/{city_id}/05-text-recategorize-batch-{offset}.json` (= N 파일)
- 통합 = `docs/raw/{city_id}/05-text-recategorize-suggestions.json` (= 정정 후보 list)

## 정정 후보 분포 (= AI 분석 = 사용자 검수 전)

| FROM | TO | 행 수 | 대표 행 |
|---|---|---:|---|
| attraction | restaurant | `{N}` | `{Bistrot Benoit, Le Cinq, ...}` |
| hotspot | restaurant | `{N}` | `{Kabul, Boot Café, ...}` |
| ... | ... | ... | ... |
| **합계** | - | **`{N}`** | - |

## 사용자 검수 결과 (= cc2 옵션)

| 단계 | 결정 |
|---|---|
| AI 분석 보고 | `{YYYY-MM-DD HH:MM}` |
| 사용자 검수 | `{전체 적용 / 일부 적용 / 거부}` |
| 명시 후 트랜잭션 | `{YYYY-MM-DD HH:MM}` |

## 트랜잭션 실행 결과

| 항목 | 수 |
|---|---:|
| UPDATE 성공 | `{N}` |
| SKIP (= 이미 동일 카테고리) | `{N}` |
| rank 충돌 | 0 (= MAX+1 자동) |
| errors | 0 |

## 카테고리 분포 변화

| 카테고리 | Before | After | Δ |
|---|---:|---:|---:|
| restaurant | `{N}` | `{N}` | `{+N}` |
| attraction | `{N}` | `{N}` | `{-N}` |
| healing | `{N}` | `{N}` | `{+N}` |
| adventure | `{N}` | `{N}` | `{-N}` |
| heritage | `{N}` | `{N}` | `{0}` |
| hotspot | `{N}` | `{N}` | `{-N}` |
| shopping | `{N}` | `{N}` | `{+N}` |

## 본 세션 (= Paris 2026-05-19) 검증 비교

- 입력 = 455 활성 행
- 정정 후보 = 47 (= 10.3%)
- 사용자 cc2 검수 = 전체 적용
- 트랜잭션 = 47/47 성공 / errors 0
- 카테고리 분포 변화 = restaurant 169 → 205 (= +36) 등

## 다음 단계

- [ ] 5 단계 매칭 재실행 = 카테고리 변경 후 새 중복 가능 검출
- [ ] 다른 도시 적용 = 같은 prompt + city_id 만 변경 = 동일 결과 보장