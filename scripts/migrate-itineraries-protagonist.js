/**
 * itineraries 테이블 마이그레이션 - 주인공 필드 추가
 *
 * 추가 필드:
 * - curation_focus: 누구를 위한 (Kids, Parents, Everyone, Self)
 * - companion_type: 누구랑
 * - companion_count: 인원 수
 * - companion_ages: 동반자 나이
 * - vibes: 바이브 선택
 * - travel_pace: 여행 밀도
 * - mobility_style: 이동 스타일
 * - meal_level: 식사 레벨
 * - protagonist_sentence: 주인공 문장 (Gemini 프롬프트용)
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
    console.log("🔄 itineraries 테이블 마이그레이션 시작...");

    // 새 컬럼 추가 (이미 존재하면 무시)
    const alterStatements = [
      `ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS curation_focus TEXT DEFAULT 'Everyone'`,
      `ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS companion_type TEXT DEFAULT 'Couple'`,
      `ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS companion_count INTEGER DEFAULT 2`,
      `ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS companion_ages TEXT`,
      `ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS vibes JSONB DEFAULT '[]'`,
      `ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS travel_pace TEXT DEFAULT 'Normal'`,
      `ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS mobility_style TEXT DEFAULT 'Moderate'`,
      `ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS meal_level TEXT DEFAULT 'Local'`,
      `ALTER TABLE itineraries ADD COLUMN IF NOT EXISTS protagonist_sentence TEXT`,
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
      WHERE table_name = 'itineraries'
      ORDER BY ordinal_position
    `);

    console.log("\n📊 itineraries 테이블 컬럼:");
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
