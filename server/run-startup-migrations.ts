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

    // 0004: place_seed_raw.price_eur, price_source, price_fetched_at
    await pool.query(`
      ALTER TABLE "place_seed_raw"
        ADD COLUMN IF NOT EXISTS "price_eur" real,
        ADD COLUMN IF NOT EXISTS "price_source" text,
        ADD COLUMN IF NOT EXISTS "price_fetched_at" timestamp;
    `);
    console.log("[Migration] ✅ 0004 price_eur/price_source/price_fetched_at 적용 완료");

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

    // 0010: user_providers (동일인 통합: provider 1순위, birth_date 2순위)
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
  } catch (err) {
    console.warn("[Migration] 스킵 또는 실패:", (err as Error).message);
  }
}
