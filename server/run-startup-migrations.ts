/**
 * 서버 시작 시 DB 마이그레이션 자동 실행
 * - mcp_phases 등 누락 컬럼 추가 (배포 DB와 스키마 동기화)
 */
import { pool } from "./db";

export async function runStartupMigrations(): Promise<void> {
  if (!pool) return;

  try {
    // users REPLICA IDENTITY (Supabase publication에서 UPDATE 허용)
    await pool.query(`ALTER TABLE "users" REPLICA IDENTITY FULL;`);
    console.log("[Migration] ✅ users REPLICA IDENTITY FULL 적용 완료");

    // 0004: place_seed_raw.price_eur (= 단일 SSOT, 2026-05-15 사용자 결정)
    // ⚠️ price_source / price_fetched_at = 영구 폐기 (= SSOT §14 + 제15조 = price_eur 단일)
    await pool.query(`
      ALTER TABLE "place_seed_raw"
        ADD COLUMN IF NOT EXISTS "price_eur" real;
    `);
    console.log("[Migration] ✅ 0004 price_eur 적용 완료");

    // 0006: cities.mcp_phases, place_seed_raw.collection_phase, image_url
    await pool.query(`
      ALTER TABLE "cities"
        ADD COLUMN IF NOT EXISTS "mcp_phases" jsonb DEFAULT '[]'::jsonb;
    `);
    await pool.query(`
      ALTER TABLE "place_seed_raw"
        ADD COLUMN IF NOT EXISTS "collection_phase" text,
        ADD COLUMN IF NOT EXISTS "image_url" text;
    `);
    console.log("[Migration] ✅ 0006 mcp_phases/collection_phase/image_url 적용 완료");

    // 0007: cities.bts_rank (BTS 2026 공연 도시 1~34)
    await pool.query(`
      ALTER TABLE "cities"
        ADD COLUMN IF NOT EXISTS "bts_rank" integer;
    `);
    console.log("[Migration] ✅ 0007 bts_rank 적용 완료");

    // 0008: place_seed_raw.place_id (places 브릿지, 가격·이미지 직연결)
    await pool.query(`
      ALTER TABLE "place_seed_raw"
        ADD COLUMN IF NOT EXISTS "place_id" integer;
    `);
    console.log("[Migration] ✅ 0008 place_seed_raw.place_id 적용 완료");

    // 0009: place_seed_raw.google_place_id (바코드: places 테이블 100% 정확 연결)
    await pool.query(`
      ALTER TABLE "place_seed_raw"
        ADD COLUMN IF NOT EXISTS "google_place_id" text;
    `);
    console.log("[Migration] ✅ 0009 place_seed_raw.google_place_id 적용 완료");

    // 0010: user_providers (동일인 통합) — 별도 try-catch (실패해도 이후 migration 계속)
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
      await pool.query(`CREATE INDEX IF NOT EXISTS "user_providers_user_id_idx" ON "user_providers"("user_id");`);
      await pool.query(`CREATE INDEX IF NOT EXISTS "user_providers_provider_provider_id_idx" ON "user_providers"("provider", "provider_id");`);
      await pool.query(`
        INSERT INTO "user_providers" ("user_id", "provider", "provider_id")
        SELECT "id", "provider", "provider_id"
        FROM "users"
        WHERE "provider" IS NOT NULL AND "provider_id" IS NOT NULL
        ON CONFLICT ("provider", "provider_id") DO NOTHING;
      `);
      console.log("[Migration] ✅ 0010 user_providers 적용 완료");
    } catch (e010) {
      console.warn("[Migration] 0010 user_providers 스킵:", (e010 as Error).message);
    }
    // 0011: 다국어 장소명
    await pool.query("ALTER TABLE place_seed_raw ADD COLUMN IF NOT EXISTS name_local text, ADD COLUMN IF NOT EXISTS names_i18n jsonb; ALTER TABLE places ADD COLUMN IF NOT EXISTS name_local text, ADD COLUMN IF NOT EXISTS names_i18n jsonb;");
    console.log("[Migration] 0011 name_local/names_i18n 적용 완료");
    // 0012: SSoT 통합 - place_seed_raw에 좌표/평점/리뷰수/사진 컬럼 추가
    await pool.query("ALTER TABLE place_seed_raw ADD COLUMN IF NOT EXISTS latitude real, ADD COLUMN IF NOT EXISTS longitude real, ADD COLUMN IF NOT EXISTS google_rating real, ADD COLUMN IF NOT EXISTS google_review_count integer, ADD COLUMN IF NOT EXISTS photo_urls jsonb, ADD COLUMN IF NOT EXISTS opening_hours jsonb, ADD COLUMN IF NOT EXISTS editorial_summary text;");
    console.log("[Migration] 0012 SSoT 통합 컬럼 적용 완료");

    // 0013: DB 정리 + SSoT 인앱 링크 컬럼
    // (a) 죽은 테이블 DROP (모두 0건)
    await pool.query(`
      DROP TABLE IF EXISTS vibe_analysis CASCADE;
      DROP TABLE IF EXISTS itinerary_items CASCADE;
      DROP TABLE IF EXISTS reality_checks CASCADE;
      DROP TABLE IF EXISTS conversations CASCADE;
      DROP TABLE IF EXISTS messages CASCADE;
    `);
    console.log("[Migration] 0013a 죽은 테이블 5개 DROP 완료");

    // (b) 깨진 URL 정리 — Google API/인스타 CDN/example.com
    const cleanupResult = await pool.query(`
      UPDATE place_seed_raw SET best_image_url = NULL
        WHERE best_image_url LIKE '%places.googleapis.com%'
           OR best_image_url LIKE '%fbcdn.net%'
           OR best_image_url LIKE '%cdninstagram.com%';
      UPDATE place_seed_raw SET image_url = NULL
        WHERE image_url LIKE '%places.googleapis.com%'
           OR image_url LIKE '%fbcdn.net%'
           OR image_url LIKE '%cdninstagram.com%';
      DELETE FROM place_images WHERE url LIKE '%example.com%';
      DELETE FROM place_images WHERE source_type = 'instagram'
        AND (url LIKE '%fbcdn.net%' OR url LIKE '%cdninstagram.com%');
      DELETE FROM celebrity_place_evidence
        WHERE (post_url IS NULL OR post_url = '')
          AND (image_url IS NULL OR image_url = '');
    `);
    console.log("[Migration] 0013b 깨진 URL 정리 완료");

    // (c) SSoT 인앱 링크 컬럼 추가
    await pool.query(`
      ALTER TABLE place_seed_raw
        ADD COLUMN IF NOT EXISTS instagram_post_url text,
        ADD COLUMN IF NOT EXISTS tiktok_post_url text;
    `);
    console.log("[Migration] 0013c instagram_post_url/tiktok_post_url 컬럼 추가 완료");

    // 0014: multi-tag SSOT + 이미지 메타 + gemini3 표준화 17필드
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
        ADD COLUMN IF NOT EXISTS google_primary_type text,
        ADD COLUMN IF NOT EXISTS gemini_rank integer;
    `);
    console.log("[Migration] 0014 multi-tag/image-meta/gemini3 컬럼 10개 추가 완료");

    // 0015: google_maps_uri (= 2026-05-15 사용자 13 번째 SSOT 요소 = 최후의 보루)
    await pool.query(`
      ALTER TABLE place_seed_raw
        ADD COLUMN IF NOT EXISTS google_maps_uri text;
    `);
    console.log("[Migration] 0015 google_maps_uri 컬럼 추가 완료");

    // 0016: celeb_mention 컬럼 추가 (= Replit Agent 작업 보존, schema.ts 동기화)
    await pool.query(`
      ALTER TABLE place_seed_raw
        ADD COLUMN IF NOT EXISTS celeb_mention text;
    `);
    console.log("[Migration] 0016 celeb_mention 컬럼 추가 완료");
  } catch (err) {
    console.warn("[Migration] 스킵 또는 실패:", (err as Error).message);
  }
}
