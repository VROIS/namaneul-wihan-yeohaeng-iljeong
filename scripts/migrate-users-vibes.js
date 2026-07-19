/**
 * users 테이블 마이그레이션 - 취향 저장 필드 추가
 *
 * 추가 필드:
 * - preferred_vibes: 선호 취향 (최대 3개, 순서 중요)
 * - preferred_companion_type: 자주 선택하는 동행 타입
 * - preferred_travel_style: 선호 여행 스타일
 * - marketing_consent: 마케팅 동의
 * - vibes_updated_at: 마지막 취향 업데이트 시간
 */

require("dotenv").config();
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function migrate() {
  const client = await pool.connect();

  try {
    console.log("🔄 users 테이블 마이그레이션 시작...");

    // 새 컬럼 추가 (이미 존재하면 무시)
    const alterStatements = [
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_vibes JSONB DEFAULT '[]'`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_companion_type TEXT`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS preferred_travel_style TEXT`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS marketing_consent BOOLEAN DEFAULT false`,
      `ALTER TABLE users ADD COLUMN IF NOT EXISTS vibes_updated_at TIMESTAMP`,
    ];

    for (const stmt of alterStatements) {
      try {
        await client.query(stmt);
        console.log(`✅ ${stmt.substring(0, 60)}...`);
      } catch (err) {
        if (!err.message.includes("already exists")) {
          console.error(`⚠️ ${err.message}`);
        }
      }
    }

    // 테이블 구조 확인
    const result = await client.query(`
      SELECT column_name, data_type, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'users'
      ORDER BY ordinal_position
    `);

    console.log("\n📊 users 테이블 컬럼:");
    result.rows.forEach((r) => {
      console.log(
        `  - ${r.column_name} (${r.data_type}) ${r.column_default ? `= ${r.column_default}` : ""}`,
      );
    });

    console.log("\n✅ 마이그레이션 완료!");
  } catch (error) {
    console.error("❌ 마이그레이션 실패:", error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

migrate().catch(console.error);
