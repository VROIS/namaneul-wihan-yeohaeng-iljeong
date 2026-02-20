/**
 * 서버 시작 시 DB 마이그레이션 자동 실행
 * - mcp_phases 등 누락 컬럼 추가 (배포 DB와 스키마 동기화)
 */
import { pool } from "./db";

export async function runStartupMigrations(): Promise<void> {
  if (!pool) return;

  try {
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
  } catch (err) {
    console.warn("[Migration] 스킵 또는 실패:", (err as Error).message);
  }
}
