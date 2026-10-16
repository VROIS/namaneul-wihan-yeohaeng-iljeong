import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  integer,
  serial,
  timestamp,
  real,
  jsonb,
  unique,
} from "drizzle-orm/pg-core";
import { cities } from "./cities";

export const placeSeedRaw = pgTable("place_seed_raw", {
  id: serial("id").primaryKey(),
  // ⚠️ 수정금지(승인필요) 2026-08-24 사장님 승인 = 창고 자체 필터(신원 사다리) 상태 5컬럼(시뮬 정본 = worktrees/psr-filter-sim).
  status: text("status").notNull().default("active"),
  mergedInto: integer("merged_into"),
  businessStatus: text("business_status"), // TS businessStatus 보존(OPERATIONAL/CLOSED_*) = 재검증 근거
  verifiedAt: timestamp("verified_at"), // 마지막 TS 검증 시각(재검증 주기 근거)
  verifySource: text("verify_source"),
  // ⚠️ 수정금지(승인필요) 2026-06-11 = place_id(옛 places FK) DROP = 헛바퀴(google_place_id 가 진짜 연결)
  cityId: integer("city_id")
    .notNull()
    .references(() => cities.id, { onDelete: "cascade" }),
  seedCategory: text("seed_category").notNull(), // attraction|restaurant|healing|adventure|photospot
  // ⚠️ 개정헌법 2026-07-07 사장님 = rank nullable §19(DB↔레포 동기화). 코드는 랭킹 안 넣음 = 신규는 rank NULL 로 INSERT → AFTER autorank 트리거가 RC순 확정.
  rank: integer("rank"),
  // ⚠️ 수정금지(승인필요) 2026-06-11 = 헛바퀴 9컬럼 DROP (원재료 소진 = 미사용 = FE 재구성 예정)
  nameKo: text("name_ko"),
  nameEn: text("name_en").notNull(),
  imageUrl: text("image_url"), // 대표 이미지 1개 URL
  // ⚠️ 수정금지(승인필요) 2026-06-11 = nubi_reason → summary_ko 흡수통합 / evidence_url DROP (= 헛바퀴)
  priceEur: real("price_eur"), // 1인 입장료/식사비 (EUR), 0=무료

  googlePlaceId: text("google_place_id"),
  // ⚠️ 수정금지(승인필요) 2026-05-15 = 13 번째 SSOT 요소 = google_maps_uri
  googleMapsUri: text("google_maps_uri"),

  // ⚠️ 수정금지(승인필요) 2026-06-11 = best_image_url DROP = 이미지 image_url(구글 PM) 1종 통일 (고아·비PM 2순위 폴백 폐기)
  latitude: real("latitude"),
  longitude: real("longitude"),
  googleReviewCount: integer("google_review_count"),
  // ⚠️ 수정금지(승인필요) 2026-10-16 사장님 결정 = 안 쓰는 칸 정리: 영업시간(opening_hours)·이미지 갱신 시각(image_updated_at)만 남긴다 (정본 §정리)
  openingHours: jsonb("opening_hours").$type<Record<string, string>>(),
  editorialSummary: text("editorial_summary"),
  nameLocal: text("name_local"),
  // ⚠️ 수정금지(승인필요) 2026-10-14 사장님 결정 = 분류 이름을 포토스팟으로 바꿈 (정본 §2026-10-14)
  phaseTags: text("phase_tags").array(), // ['bts2026'] 등 수집 phase 태그
  categoryTags: text("category_tags").array(), // ['heritage','photospot','attraction'] 등 다중 카테고리 태그
  imageAttribution: text("image_attribution"), // "Photo via Google Places (placeId)"
  imageUpdatedAt: timestamp("image_updated_at"),
  createdAt: timestamp("created_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  // ⚠️ 수정금지(승인필요) 2026-07-16 = updated_at 레포 등재 §19(DB↔레포 동기화) = DB 실측 nullable+default now() 그대로 반영.
  updatedAt: timestamp("updated_at").default(sql`now()`),
  // ⚠️ 수정금지(승인필요) — 2026-05-04 사용자 SSOT: gemini3-2026-05 표준화 17 필드 추가 (메인앱 통합 진입점)
  summaryKo: text("summary_ko"), // 한국어 감성 요약 (NUBI 카피, 숏폼 KO)
  dayZone: text("day_zone"), // core (≤10km) / outskirt (10-100km)
  distanceKmFromCenter: real("distance_km_from_center"), // 도심 거리 (haversine)
  address: text("address"), // 전체 주소 + 우편번호
  googlePrimaryType: text("google_primary_type"), // Google primary type (museum, restaurant 등)
  // ⚠️ 수정금지(승인필요) 2026-08-27 사장님 확정 = 베스트&베스트 7자리 언어코드(분류 표식. 순위도 계산식도 아님).
  bestRank: integer("best_rank"),
});

// ⚠️ 수정금지(승인필요) 2026-08-12 = 다국어 노출용 번역 캐시(§2.3 Phase A2). place_seed_raw.summary_ko/editorial_summary
export const placeTranslations = pgTable(
  "place_translations",
  {
    id: serial("id").primaryKey(),
    placeId: integer("place_id")
      .notNull()
      .references(() => placeSeedRaw.id, { onDelete: "cascade" }),
    language: text("language").notNull(), // 'en'|'ja'|'zh'|'fr'|'de'|'es' 등 (ko = 원본이라 캐시 대상 아님)
    summary: text("summary"), // summary_ko 번역본
    editorialSummary: text("editorial_summary"), // editorial_summary 번역본
    createdAt: timestamp("created_at")
      .default(sql`CURRENT_TIMESTAMP`)
      .notNull(),
  },
  (t) => [
    unique("place_translations_place_id_language_uniq").on(
      t.placeId,
      t.language,
    ),
  ],
);
