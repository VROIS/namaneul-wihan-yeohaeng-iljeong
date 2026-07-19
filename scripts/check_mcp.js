const { Client } = require("pg");
require("dotenv").config();

async function check() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  const res = await client.query(`
    SELECT name_ko, name_en, price_eur, image_url 
    FROM place_seed_raw 
    WHERE image_url IS NOT NULL OR price_eur > 0
    ORDER BY created_at DESC 
    LIMIT 10
  `);

  console.log("--- MCP 수집 데이터 현황 (최근 10개) ---");
  if (res.rows.length === 0) {
    console.log("데이터가 없습니다.");
  } else {
    res.rows.forEach((r) => {
      console.log(
        `[${r.name_ko || r.name_en}] 가격: ${r.price_eur} EUR, 이미지: ${r.image_url ? "OK" : "NULL"}`,
      );
    });
  }

  const counts = await client.query(`
    SELECT 
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE image_url IS NOT NULL) as has_image,
      COUNT(*) FILTER (WHERE price_eur > 0) as has_price
    FROM place_seed_raw
  `);
  console.log("\n--- 통계 ---");
  console.log(counts.rows[0]);

  await client.end();
}

check().catch(console.error);
