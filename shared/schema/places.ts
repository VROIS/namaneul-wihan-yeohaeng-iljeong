import { sql } from "drizzle-orm";
import {
  pgTable,
  text,
  integer,
  serial,
  timestamp,
  real,
  boolean,
  jsonb,
  unique,
} from "drizzle-orm/pg-core";
import { dataSourceEnum } from "./enums";
import { cities } from "./cities";

// Places (restaurants, attractions, etc.)
// 🔗 Agent Protocol v1.0: 장소 식별 규약
// googlePlaceId=글로벌유일키(바코드), name=Google공식명, displayNameKo=한국어표시명, aliases=별칭배열
// Reviews for language analysis (Original Taste Verification)
export const reviews = pgTable("reviews", {
  id: serial("id").primaryKey(),
  // ⚠️ 수정금지(승인필요) 2026-05-24 = Step 4 DB DROP = places FK 제거 (= places 테이블 폐기 = 컬럼만 유지)
  placeId: integer("place_id").notNull(),
  source: dataSourceEnum("source").notNull(),
  sourceReviewId: text("source_review_id"),
  language: text("language"),
  rating: real("rating"),
  text: text("text"),
  authorCountry: text("author_country"),
  isOriginatorLanguage: boolean("is_originator_language").default(false),
  sentimentScore: real("sentiment_score"),
  authenticityKeywords: jsonb("authenticity_keywords").$type<string[]>(),
  reviewDate: timestamp("review_date"),
  fetchedAt: timestamp("fetched_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
});

// [DROPPED 0013] vibe_analysis — 0건, 미사용
// [DROPPED 0013] reality_checks — 0건, 미사용

// MCP 1·2단계 통합 로우데이터 (도시×카테고리 장소 + 한국인 인지도)
export const placeSeedRaw = pgTable("place_seed_raw", {
  id: serial("id").primaryKey(),
  // ⚠️ 수정금지(승인필요) 2026-08-24 사장님 승인 = 창고 자체 필터(신원 사다리) 상태 5컬럼(시뮬 정본 = worktrees/psr-filter-sim).
  //   status: active(명부·서빙) / candidate(무PID 목격담 = 서빙 밖) / hold(오매칭 의심 = 사람 확인) /
  //           quarantined(오염 격리) / closed(폐업) / merged(중복 = merged_into 포인터, 행 보존 = 삭제 0)
  status: text("status").notNull().default("active"),
  mergedInto: integer("merged_into"),
  businessStatus: text("business_status"), // TS businessStatus 보존(OPERATIONAL/CLOSED_*) = 재검증 근거
  verifiedAt: timestamp("verified_at"), // 마지막 TS 검증 시각(재검증 주기 근거)
  verifySource: text("verify_source"),
  // ⚠️ 수정금지(승인필요) 2026-06-11 = place_id(옛 places FK) DROP = 헛바퀴(google_place_id 가 진짜 연결)
  cityId: integer("city_id")
    .notNull()
    .references(() => cities.id, { onDelete: "cascade" }),
  seedCategory: text("seed_category").notNull(), // attraction|restaurant|healing|adventure|hotspot
  // ⚠️ 개정헌법 2026-07-07 사장님 = rank nullable §19(DB↔레포 동기화). 코드는 랭킹 안 넣음 = 신규는 rank NULL 로 INSERT → AFTER autorank 트리거가 RC순 확정.
  rank: integer("rank"),
  // ⚠️ 수정금지(승인필요) 2026-06-11 = 헛바퀴 9컬럼 DROP (원재료 소진 = 미사용 = FE 재구성 예정)
  //   = unified_id/google_*_note 3/source/source_rank/source_type/evidence_verified/naver_blog_count 정의 제거 (= DB DROP 동반).
  nameKo: text("name_ko"),
  nameEn: text("name_en").notNull(),
  imageUrl: text("image_url"), // 대표 이미지 1개 URL
  // ⚠️ 수정금지(승인필요) 2026-06-11 = nubi_reason → summary_ko 흡수통합 / evidence_url DROP (= 헛바퀴)
  // ⚠️ 2026-05-15 사용자 SSOT = price_eur 단일 컬럼 (= 1인 입장료/식사비 통합)
  // = price_source / price_fetched_at = 영구 폐기 (SSOT §14 + 제15조)
  priceEur: real("price_eur"), // 1인 입장료/식사비 (EUR), 0=무료

  // 6단계: googlePlaceId 바코드 (places 테이블 100% 정확 연결용)
  googlePlaceId: text("google_place_id"),
  // ⚠️ 수정금지(승인필요) 2026-05-15 = 13 번째 SSOT 요소 = google_maps_uri
  // = 프론트엔드 "구글맵 바로가기" 버튼 = 최후의 보루 (lat/lng 폴백보다 정확)
  googleMapsUri: text("google_maps_uri"),

  // 4단계: 통합 마스터 창고용 파생/집계 데이터
  // ⚠️ 수정금지(승인필요) 2026-06-11 = best_image_url DROP = 이미지 image_url(구글 PM) 1종 통일 (고아·비PM 2순위 폴백 폐기)
  // ⚠️ 수정금지(승인필요) 2026-06-11 = celeb_mention DROP (= 헛바퀴, ag3 미프로젝션 데드)
  // ⚠️ 수정금지(승인필요) 2026-06-11 = naver_blog_count DROP (= 네이버 수집 파이프라인 폐기 = 헛바퀴)
  vibeKeywords: jsonb("vibe_keywords").$type<string[]>(), // 분위기 키워드 배열
  // SSoT 통합: places 테이블에서 역수집한 데이터
  latitude: real("latitude"),
  longitude: real("longitude"),
  // ⚠️ 수정금지(승인필요) 2026-06-11 = google_rating DROP (= 별점 비노출 정책 = 헛바퀴)
  googleReviewCount: integer("google_review_count"),
  // ⚠️ 수정금지(승인필요) 2026-06-11 = photo_urls DROP = 이미지 image_url(구글 PM) 1종 통일 (고아·버그 폐기)
  openingHours: jsonb("opening_hours").$type<Record<string, string>>(),
  editorialSummary: text("editorial_summary"),
  nameLocal: text("name_local"),
  // ⚠️ 수정금지(승인필요) 2026-06-11 = names_i18n(고유명사 번역 무의미) / instagram·tiktok_post_url(인스타 가짜 폐기) DROP = 헛바퀴
  // ⚠️ 수정금지(승인필요) — 2026-04-30: multi-tag SSOT (1 장소 = N 카테고리)
  phaseTags: text("phase_tags").array(), // ['bts2026'] 등 수집 phase 태그
  categoryTags: text("category_tags").array(), // ['heritage','hotspot','attraction'] 등 다중 카테고리 태그
  imageAttribution: text("image_attribution"), // "Photo via Google Places (placeId)"
  imageUpdatedAt: timestamp("image_updated_at"),
  createdAt: timestamp("created_at")
    .default(sql`CURRENT_TIMESTAMP`)
    .notNull(),
  // ⚠️ 수정금지(승인필요) 2026-07-16 = updated_at 레포 등재 §19(DB↔레포 동기화) = DB 실측 nullable+default now() 그대로 반영.
  //   = 이 등재와 무관하게 db:push 는 여전히 절대 금지: DB 실측 33컬럼 vs 이 스키마 28컬럼 불일치 + latitude/longitude/distance_km_from_center 가
  //     DB numeric ↔ 이 스키마 real 로 어긋나 있어, push 시 좌표 정밀도가 깎여 좌표10m 매칭의 근거 데이터가 손상된다.
  updatedAt: timestamp("updated_at").default(sql`now()`),
  // ⚠️ 수정금지(승인필요) — 2026-05-04 사용자 SSOT: gemini3-2026-05 표준화 17 필드 추가 (메인앱 통합 진입점)
  summaryKo: text("summary_ko"), // 한국어 감성 요약 (NUBI 카피, 숏폼 KO)
  dayZone: text("day_zone"), // core (≤10km) / outskirt (10-100km)
  distanceKmFromCenter: real("distance_km_from_center"), // 도심 거리 (haversine)
  address: text("address"), // 전체 주소 + 우편번호
  googlePrimaryType: text("google_primary_type"), // Google primary type (museum, restaurant 등)
  geminiRank: integer("gemini_rank"), // Gemini 응답 순위 (rank 재정렬 우선 키)
});

// ⚠️ 수정금지(승인필요) 2026-08-12 = 다국어 노출용 번역 캐시(§2.3 Phase A2). place_seed_raw.summary_ko/editorial_summary
//   (여전히 한국어 원본, 컬럼명 안 바꿈 = 2026-08-12 판단) 를 노출 언어별로 번역해 캐시. place_id+language 조합당 1행.
//   실제 DB에 직접 CREATE TABLE 로 먼저 만들고(db:push 금지, 위 90-92행 사유와 동일) 이 정의를 맞춰 등재함.
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
    // 실제 DB에 이미 있는 제약(위 CREATE TABLE 그대로 등재, §19 DB↔레포 동기화)
    unique("place_translations_place_id_language_uniq").on(
      t.placeId,
      t.language,
    ),
  ],
);

export type Review = typeof reviews.$inferSelect;
export type PlaceSeedRaw = typeof placeSeedRaw.$inferSelect;
