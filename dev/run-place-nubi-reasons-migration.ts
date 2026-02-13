/**
 * place_nubi_reasons 테이블 생성 (단일 마이그레이션)
 */
import "dotenv/config";
import { db } from "../server/db";
import { sql } from "drizzle-orm";

async function main() {
  if (!db) {
    console.error("DB 연결 없음");
    process.exit(1);
  }
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS place_nubi_reasons (
      id serial PRIMARY KEY,
      place_id integer NOT NULL UNIQUE,
      city_id integer NOT NULL,
      place_name text NOT NULL,
      source_rank integer NOT NULL,
      source_type text NOT NULL,
      nubi_reason text NOT NULL,
      evidence_url text,
      verified boolean DEFAULT false,
      fetched_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL,
      created_at timestamp DEFAULT CURRENT_TIMESTAMP NOT NULL
    )
  `);
  console.log("[Migration] place_nubi_reasons 테이블 생성 완료");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
