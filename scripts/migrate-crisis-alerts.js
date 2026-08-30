const { Client } = require("pg");
require("dotenv").config();

async function migrateCrisisAlerts() {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    await client.connect();
    console.log("✅ 데이터베이스 연결 성공");

    const alterQueries = [
      `ALTER TABLE crisis_alerts ADD COLUMN IF NOT EXISTS city TEXT DEFAULT 'Paris'`,

      `ALTER TABLE crisis_alerts ADD COLUMN IF NOT EXISTS type TEXT DEFAULT 'strike'`,

      `ALTER TABLE crisis_alerts ADD COLUMN IF NOT EXISTS title_ko TEXT`,

      `ALTER TABLE crisis_alerts ADD COLUMN IF NOT EXISTS date TEXT NOT NULL DEFAULT '2026-01-15'`,
      `ALTER TABLE crisis_alerts ADD COLUMN IF NOT EXISTS end_date TEXT`,

      `ALTER TABLE crisis_alerts ADD COLUMN IF NOT EXISTS affected JSONB DEFAULT '[]'`,

      `ALTER TABLE crisis_alerts ADD COLUMN IF NOT EXISTS recommendation TEXT`,
      `ALTER TABLE crisis_alerts ADD COLUMN IF NOT EXISTS recommendation_ko TEXT`,

      `ALTER TABLE crisis_alerts ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'GDELT + Gemini'`,
    ];

    for (const query of alterQueries) {
      try {
        await client.query(query);
        console.log(`✅ 실행 완료: ${query.substring(0, 60)}...`);
      } catch (err) {
        if (err.code === "42701") {
          console.log(`ℹ️  이미 존재: ${query.substring(0, 60)}...`);
        } else {
          console.error(`❌ 오류: ${err.message}`);
        }
      }
    }

    await client.query(`
      UPDATE crisis_alerts 
      SET city = 'Paris', 
          type = COALESCE(alert_type, 'strike'),
          date = COALESCE(TO_CHAR(start_date, 'YYYY-MM-DD'), '2026-01-15')
      WHERE city IS NULL OR city = ''
    `);
    console.log("✅ 기존 데이터 기본값 설정 완료");

    const result = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'crisis_alerts' 
      ORDER BY ordinal_position
    `);

    console.log("\n📋 crisis_alerts 테이블 컬럼:");
    result.rows.forEach((row) => {
      console.log(`  - ${row.column_name}: ${row.data_type}`);
    });

    console.log("\n✅ 마이그레이션 완료!");
  } catch (error) {
    console.error("❌ 마이그레이션 실패:", error);
  } finally {
    await client.end();
  }
}

migrateCrisisAlerts();
