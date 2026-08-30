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
