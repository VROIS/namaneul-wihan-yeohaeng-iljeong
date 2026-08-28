// ⚠️ 수정금지(승인필요) 2026-08-28 사장님 승인 = place_seed_raw PID 중복그룹의 "흡수 후보 컬럼" 목록 1벌(§16 SSOT).
// = fillcity/dups-detail.ts(조사 전용, keep/loser 필드 비교) 와 server/services/fill/status-backfill.ts
//   (absorbTwinGroup 실제 흡수)가 각자 손으로 같은 목록을 재입력해 드리프트 위험이 있던 것을 이 파일 1벌로 통합.
// = dups-detail.ts 는 파일 최상단이 즉시실행 IIFE(DB 접속)라 그 파일을 직접 import 하면 부작용(접속 시도)이
//   생긴다 → 목록만 이 파일로 분리해 양쪽이 부작용 없이 import 하게 한다.
// = 식별/시스템 컬럼 제외(id, google_place_id, status, merged_into 등) = 결손이면 loser 값으로 채울 수 있는
//   "데이터" 컬럼만. 좌표(latitude/longitude)·태그(phase_tags/category_tags)는 두 파일 각자 다른 방식(좌표쌍·UNION)
//   으로 처리하므로 호출부에서 이 목록을 그대로 다 쓰지 않고 걸러 쓴다(각 파일 주석 참조).
export const FILL_COLS = [
  "name_ko",
  "name_en",
  "name_local",
  "image_url",
  "image_attribution",
  "price_eur",
  "editorial_summary",
  "summary_ko",
  "address",
  "latitude",
  "longitude",
  "google_review_count",
  "google_rating",
  "google_maps_uri",
  "google_primary_type",
  "opening_hours",
  "vibe_keywords",
  "phase_tags",
  "category_tags",
  "names_i18n",
  "photo_urls",
  "distance_km_from_center",
  "day_zone",
] as const;
