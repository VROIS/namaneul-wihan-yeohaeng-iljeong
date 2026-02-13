/**
 * place_nubi_reasons 테이블 확인
 */
import "dotenv/config";

async function main() {
  const { pool } = await import("../server/db");

  if (!pool) {
    console.error("DB 연결 없음");
    process.exit(1);
  }

  const cols = await pool.query(`
    SELECT column_name, data_type FROM information_schema.columns
    WHERE table_name = 'place_nubi_reasons' ORDER BY ordinal_position
  `);
  console.log("place_nubi_reasons 컬럼:", cols.rows);

  const cnt = await pool.query("SELECT COUNT(*) as n FROM place_nubi_reasons");
  console.log("저장된 행 수:", cnt.rows[0]?.n);
  process.exit(0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
