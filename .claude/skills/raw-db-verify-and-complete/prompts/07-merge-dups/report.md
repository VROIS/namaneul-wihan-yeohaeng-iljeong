# 07-merge-dups — 최종 결과 보고서 템플릿

## 도시 정보

| 항목 | 값 |
|---|---|
| city_id | `{19}` |
| 활성 행 | `{N}` |
| 호출 일자 | `{YYYY-MM-DD}` |

## dry-run 매칭 그룹 분포

| 매칭 단계 | 그룹 수 | 행 수 | 확률 | 자동 적용? |
|---|---:|---:|---:|---|
| 0순위 PID | `{N}` | `{N}` | ~100% | ✅ apply-tiers=0 |
| 1순위 주소+이름 9 조합 | `{N}` | `{N}` | ~99% | ✅ apply-tiers=1 |
| 2순위 google_maps_uri | `{N}` | `{N}` | ~95% | ✅ apply-tiers=2 |
| 3순위 좌표 10m | `{N}` | `{N}` | ~95% | ✅ apply-tiers=3 |
| 4순위 이름 LOWER (= 보조) | `{N}` | `{N}` | ~30-50% | ⚠️ apply-groups 명시 |
| **합계** | `{N}` | `{N}` | - | - |

## 사용자 cc2 검수 결과

| 단계 | 결정 |
|---|---|
| dry-run 보고 | `{YYYY-MM-DD HH:MM}` |
| 사용자 검수 | `{apply-tiers=X / apply-groups=X / 거부}` |
| 트랜잭션 실행 | `{YYYY-MM-DD HH:MM}` |

## archive 결과

| 항목 | 수 |
|---|---:|
| archive 행 | `{N}` |
| keep 행 | `{N}` |
| errors | 0 |

## 활성 행 변화

| 시점 | 활성 | Δ |
|---|---:|---:|
| Before | `{N}` | - |
| After | `{N}` | `{-N}` |

## 본 세션 (= Paris 5-18) 검증 비교

- 활성 422 dry-run = 27 그룹 / 38 행 흡수 가능
- 매칭 분포 = PID 0 / 1 순위 33 / URI 0 / 좌표 1 / 이름 4
- 사용자 검수 후 archive = 15 그룹 / 16 행 (= 활성 422 → 407)
- 좌표 10m + cross-cat = 2 그룹 (= 활성 407 → 405)
- 합계 = -17 행 / -8.1% / 모두 keep 우선순위 부합

## 다음 단계

- [ ] AG2-DB SELECT 시 = archived 행 자동 제외 (= phase_tags NOT &&)
- [ ] 다음 도시 = 같은 dry-run + cc2 검수 = 동일 결과 보장