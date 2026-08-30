import { pool } from "./db";

export async function runStartupMigrations(): Promise<void> {
  if (!pool) return;

  try {
    await pool.query(`ALTER TABLE "users" REPLICA IDENTITY FULL;`);
    console.log("[Migration] ✅ users REPLICA IDENTITY FULL 적용 완료");

    await pool.query(`
      ALTER TABLE "place_seed_raw"
        ADD COLUMN IF NOT EXISTS "price_eur" real;
    `);
    console.log("[Migration] ✅ 0004 price_eur 적용 완료");

    await pool.query(`
      ALTER TABLE "cities"
        ADD COLUMN IF NOT EXISTS "mcp_phases" jsonb DEFAULT '[]'::jsonb;
    `);
    await pool.query(`
      ALTER TABLE "place_seed_raw"
        ADD COLUMN IF NOT EXISTS "image_url" text;
    `);
    console.log("[Migration] ✅ 0006 mcp_phases/image_url 적용 완료");

    await pool.query(`
      ALTER TABLE "cities"
        ADD COLUMN IF NOT EXISTS "bts_rank" integer;
    `);
    console.log("[Migration] ✅ 0007 bts_rank 적용 완료");

    // ⚠️ 수정금지(승인필요) 2026-06-11 = 0008 place_id 부팅마이그 제거 (= place_id 컬럼 DROP = 헛바퀴, 좀비 부활 차단)

    await pool.query(`
      ALTER TABLE "place_seed_raw"
        ADD COLUMN IF NOT EXISTS "google_place_id" text;
    `);
    console.log("[Migration] ✅ 0009 place_seed_raw.google_place_id 적용 완료");

    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS "user_providers" (
          "id" serial PRIMARY KEY NOT NULL,
          "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
          "provider" text NOT NULL,
          "provider_id" text NOT NULL,
          "created_at" timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
          CONSTRAINT "user_providers_provider_provider_id_unique" UNIQUE("provider", "provider_id")
        );
      `);
      await pool.query(
        `CREATE INDEX IF NOT EXISTS "user_providers_user_id_idx" ON "user_providers"("user_id");`,
      );
      await pool.query(
        `CREATE INDEX IF NOT EXISTS "user_providers_provider_provider_id_idx" ON "user_providers"("provider", "provider_id");`,
      );
      await pool.query(`
        INSERT INTO "user_providers" ("user_id", "provider", "provider_id")
        SELECT "id", "provider", "provider_id"
        FROM "users"
        WHERE "provider" IS NOT NULL AND "provider_id" IS NOT NULL
        ON CONFLICT ("provider", "provider_id") DO NOTHING;
      `);
      console.log("[Migration] ✅ 0010 user_providers 적용 완료");
    } catch (e010) {
      console.warn(
        "[Migration] 0010 user_providers 스킵:",
        (e010 as Error).message,
      );
    }
    // ⚠️ 수정금지(승인필요) 2026-05-24 = Step 4 DB DROP = places 폐기 (= ALTER places 제거)
    await pool.query(
      "ALTER TABLE place_seed_raw ADD COLUMN IF NOT EXISTS name_local text;",
    );
    console.log("[Migration] 0011 name_local 적용 완료");
    await pool.query(
      "ALTER TABLE place_seed_raw ADD COLUMN IF NOT EXISTS latitude real, ADD COLUMN IF NOT EXISTS longitude real, ADD COLUMN IF NOT EXISTS google_review_count integer, ADD COLUMN IF NOT EXISTS opening_hours jsonb, ADD COLUMN IF NOT EXISTS editorial_summary text;",
    );
    console.log("[Migration] 0012 SSoT 통합 컬럼 적용 완료");

    await pool.query(`
      DROP TABLE IF EXISTS vibe_analysis CASCADE;
      DROP TABLE IF EXISTS itinerary_items CASCADE;
      DROP TABLE IF EXISTS reality_checks CASCADE;
      DROP TABLE IF EXISTS conversations CASCADE;
      DROP TABLE IF EXISTS messages CASCADE;
    `);
    console.log("[Migration] 0013a 죽은 테이블 5개 DROP 완료");

    // ⚠️ 수정금지(승인필요) 2026-05-24 = Step 4 DB DROP = place_images + celebrity_place_evidence 폐기 (= DELETE 제거)
    const cleanupResult = await pool.query(`
      UPDATE place_seed_raw SET image_url = NULL
        WHERE image_url LIKE '%places.googleapis.com%'
           OR image_url LIKE '%fbcdn.net%'
           OR image_url LIKE '%cdninstagram.com%';
    `);
    console.log("[Migration] 0013b 깨진 URL 정리 완료");

    // ⚠️ 수정금지(승인필요) 2026-06-11 = 0013c instagram/tiktok_post_url 부팅마이그 제거 (= DROP = 인스타 가짜 폐기, 좀비 차단)

    await pool.query(`
      ALTER TABLE place_seed_raw
        ADD COLUMN IF NOT EXISTS phase_tags text[],
        ADD COLUMN IF NOT EXISTS category_tags text[],
        ADD COLUMN IF NOT EXISTS image_attribution text,
        ADD COLUMN IF NOT EXISTS image_updated_at timestamptz,
        ADD COLUMN IF NOT EXISTS summary_ko text,
        ADD COLUMN IF NOT EXISTS day_zone text,
        ADD COLUMN IF NOT EXISTS distance_km_from_center real,
        ADD COLUMN IF NOT EXISTS address text,
        ADD COLUMN IF NOT EXISTS google_primary_type text;
    `);
    // ⚠️ 수정금지(승인필요) 2026-08-27 §19 = 이 목록에 있던 옛 제미니 순위 컬럼은 원천(이 줄)·라이브 컬럼 모두 완전삭제.
    console.log("[Migration] 0014 multi-tag/image-meta 컬럼 9개 추가 완료");

    await pool.query(`
      ALTER TABLE place_seed_raw
        ADD COLUMN IF NOT EXISTS google_maps_uri text;
    `);
    console.log("[Migration] 0015 google_maps_uri 컬럼 추가 완료");

    // ⚠️ 수정금지(승인필요) 2026-06-11 = 0016 celeb_mention 부팅마이그 제거 (= DROP = 헛바퀴, 좀비 차단)

    await pool.query(`
      ALTER TABLE "itineraries"
        ADD COLUMN IF NOT EXISTS "is_saved_by_user" boolean DEFAULT false;
    `);
    console.log("[Migration] ✅ 0017 itineraries.is_saved_by_user 적용 완료");

    // 0018: expert_inquiries.kind/day_number (= 일별 [바로 예약하기] = 전문가 문의함 통합, 2026-07-24 사장님 승인)
    await pool.query(`
      ALTER TABLE "expert_inquiries"
        ADD COLUMN IF NOT EXISTS "kind" varchar NOT NULL DEFAULT 'expert',
        ADD COLUMN IF NOT EXISTS "day_number" integer;
    `);
    console.log(
      "[Migration] ✅ 0018 expert_inquiries.kind/day_number 적용 완료",
    );

    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "credit_transactions_purchase_ref_uniq"
        ON "credit_transactions" ("reference_id")
        WHERE "type" = 'purchase' AND "reference_id" IS NOT NULL;
    `);
    await pool.query(`
      ALTER TABLE "expert_inquiries"
        ADD COLUMN IF NOT EXISTS "is_deleted_by_user" boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS "is_deleted_by_expert" boolean NOT NULL DEFAULT false;
    `);
    console.log(
      "[Migration] ✅ 0019 결제 이중충전 차단 + 문의 숨김 플래그 적용 완료",
    );

    // 0020: 회원 탈퇴 6개월 유예 (2026-08-08 사장님 확정)
    await pool.query(`
      ALTER TABLE "users"
        ADD COLUMN IF NOT EXISTS "deleted_at" timestamp;
    `);
    console.log("[Migration] ✅ 0020 users.deleted_at(탈퇴 유예) 적용 완료");

    // 0021: 외부 유료호출 카운터 (2026-08-23 사장님 승인 = €860 폭탄 재발 방지 = 배치 무료잔량 게이트 + 관제탑 계기판 1벌)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS "external_calls" (
        "id" serial PRIMARY KEY,
        "provider" text NOT NULL,
        "sku" text,
        "city_id" integer,
        "units" numeric NOT NULL DEFAULT 1,
        "tag" text,
        "created_at" timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX IF NOT EXISTS "external_calls_provider_created_idx"
        ON "external_calls" ("provider", "created_at");
    `);
    console.log(
      "[Migration] ✅ 0021 external_calls(외부호출 카운터) 적용 완료",
    );

    // 0022: 창고 상태 5컬럼 (2026-08-24 사장님 승인 = 새 창고 필터 1차 반영. 시뮬 정본 = worktrees/psr-filter-sim)
    await pool.query(`
      ALTER TABLE "place_seed_raw"
        ADD COLUMN IF NOT EXISTS "status" text NOT NULL DEFAULT 'active',
        ADD COLUMN IF NOT EXISTS "merged_into" integer,
        ADD COLUMN IF NOT EXISTS "business_status" text,
        ADD COLUMN IF NOT EXISTS "verified_at" timestamptz,
        ADD COLUMN IF NOT EXISTS "verify_source" text;
      CREATE INDEX IF NOT EXISTS "psr_status_idx" ON "place_seed_raw" ("status");
    `);
    console.log(
      "[Migration] ✅ 0022 place_seed_raw 상태 5컬럼(창고 필터) 적용 완료",
    );

    await pool.query(`
      ALTER TABLE "cities"
        ADD COLUMN IF NOT EXISTS "override_hero_place_id" integer,
        ADD COLUMN IF NOT EXISTS "override_highlight_place_ids" integer[],
        ADD COLUMN IF NOT EXISTS "override_video_id" integer;
    `);
    console.log("[Migration] ✅ 0023 cities 선별입력 override 3컬럼 적용 완료");

    // 0024: AI 성능 계측 3컬럼 (2026-08-25 사장님 승인 = 관제탑 "AI 성능" 카드 활성화)
    await pool.query(`
      ALTER TABLE "external_calls"
        ADD COLUMN IF NOT EXISTS "response_time_ms" integer,
        ADD COLUMN IF NOT EXISTS "success" boolean,
        ADD COLUMN IF NOT EXISTS "error_message" text;
    `);
    console.log(
      "[Migration] ✅ 0024 external_calls AI 성능 계측 3컬럼 적용 완료",
    );

    // 0025: place_seed_raw.best_rank (2026-08-27 사장님 승인 = 베스트&베스트 분류번호, 정의는 shared/schema/places.ts)
    await pool.query(`
      ALTER TABLE "place_seed_raw"
        ADD COLUMN IF NOT EXISTS "best_rank" integer;
    `);
    console.log("[Migration] ✅ 0025 place_seed_raw.best_rank 적용 완료");
  } catch (err) {
    console.warn("[Migration] 스킵 또는 실패:", (err as Error).message);
  }
}
