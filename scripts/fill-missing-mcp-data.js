const { Client } = require("pg");
require("dotenv").config();

async function enrichMissingData() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });

  try {
    await client.connect();
    console.log("✅ DB 연결 성공");

    const res = await client.query(`
      SELECT city_id, seed_category, COUNT(*) as missing_count
      FROM place_seed_raw
      WHERE price_eur IS NULL OR price_eur = 0 OR image_url IS NULL
      GROUP BY city_id, seed_category
      ORDER BY missing_count DESC
    `);

    if (res.rows.length === 0) {
      console.log("✅ 모든 데이터가 이미 채워져 있습니다.");
      return;
    }

    console.log(
      `📊 총 ${res.rows.length}개의 시티/카테고리 조합에서 누락 발견.`,
    );

    for (const row of res.rows) {
      console.log(
        `📌 [도시 ID: ${row.city_id}, 카테고리: ${row.seed_category}] - 누락 건수: ${row.missing_count}`,
      );
    }

    console.log(
      "\n💡 위 리스트에 대해 npx tsx dev/run-mcp-stage1.ts --cityId=X --category=Y 형태의 명령어로 재수집을 권장합니다.",
    );
    console.log(
      "이미 개선된 Stage 1 로직이 배포되었으므로, 재수집 시 빈칸이 채워질 것입니다.",
    );
  } catch (error) {
    console.error("❌ 오류 발생:", error);
  } finally {
    await client.end();
  }
}

enrichMissingData();
