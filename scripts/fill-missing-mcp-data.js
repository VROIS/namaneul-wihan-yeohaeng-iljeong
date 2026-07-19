const { Client } = require("pg");
require("dotenv").config();

// MCP 수집 서비스 로직을 직접 구현하거나 모듈을 호출해야 함.
// 여기서는 간단하게 DB에서 누락된 대상을 찾아 리스트업하고,
// 필요시 실제 수집 함수를 호출하는 구조로 작성합니다.

async function enrichMissingData() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });

  try {
    await client.connect();
    console.log("✅ DB 연결 성공");

    // 1. 가격이나 이미지가 누락된 시티/카테고리 조합 찾기
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

    // 2. 누락된 대상에 대해 1단계 재수집 권장 (또는 직접 호출 로직 추가 가능)
    // 실제 서비스 코드가 TS이므로, 여기서 직접 호출하기보다는
    // 어떤 대상을 다시 돌려야 하는지 명확히 리포트하거나
    // npx tsx를 통해 특정 옵션으로 runMcpRawStage1을 호출하도록 가이드합니다.

    for (const row of res.rows) {
      console.log(
        `📌 [도시 ID: ${row.city_id}, 카테고리: ${row.seed_category}] - 누락 건수: ${row.missing_count}`,
      );
      // 실제 자동 보완을 원할 경우 여기서 해당 시티/카테고리에 대해 Stage 1 재요청 로직 수행
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
