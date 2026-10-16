import * as dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const { Pool } = pg;

async function addRawDataColumn() {
  console.log(
    "🔍 [Migration] itineraries 테이블에 raw_data 컬럼 추가 확인 중...",
  );

  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL 환경변수가 없습니다.");
    process.exit(1);
  }

  console.log(
    "Using DATABASE_URL:",
    process.env.DATABASE_URL.substring(0, 20) + "...",
  );

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }, // Supabase 클라우드 DB용
  });

  try {
    const checkResult = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'itineraries' AND column_name = 'raw_data';
    `);

    if (checkResult.rows.length > 0) {
      console.log(
        "✅ [Migration] raw_data 컬럼이 이미 존재합니다. 스킵합니다.",
      );
    } else {
      console.log("➕ [Migration] raw_data 컬럼 추가 실행...");
      await pool.query(`
            ALTER TABLE itineraries 
            ADD COLUMN raw_data JSONB DEFAULT '{}'::jsonb;
        `);
      console.log("✅ [Migration] raw_data 컬럼 추가 완료!");
    }

    const verifyResult = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'itineraries' AND column_name = 'raw_data';
    `);

    if (verifyResult.rows.length > 0) {
      console.log(
        `✅ [Verification] 검증 성공: ${verifyResult.rows[0].column_name} (${verifyResult.rows[0].data_type})`,
      );
    } else {
      console.error("❌ [Verification] 검증 실패: 컬럼이 생성되지 않았습니다.");
      process.exit(1);
    }
  } catch (error) {
    console.error("❌ [Migration] 오류 발생:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

addRawDataColumn()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
