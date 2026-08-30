import * as dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const { Pool } = pg;

async function checkItineraries() {
  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL missing");
    return;
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    const res = await pool.query(
      "SELECT id, title, created_at FROM itineraries ORDER BY id DESC LIMIT 5",
    );
    console.log("📋 최근 생성된 일정 목록:");
    res.rows.forEach((row) => {
      console.log(
        `ID: ${row.id} | 제목: ${row.title} | 생성일: ${new Date(row.created_at).toLocaleString()}`,
      );
    });

    if (res.rows.length > 0) {
      console.log(`\n✅ 가장 최근 ID: ${res.rows[0].id}`);
    } else {
      console.log("\n⚠️ 저장된 일정이 없습니다.");
    }
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await pool.end();
  }
}

checkItineraries();
