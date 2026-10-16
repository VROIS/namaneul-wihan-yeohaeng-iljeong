const { Client } = require("pg");
require("dotenv").config();

function hasBrokenEncoding(str) {
  if (!str) return false;
  return /[ÃÂìíëâêî]/.test(str) || /Ã/.test(str) || /Â/.test(str);
}

async function analyzeAndFixDB() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });

  try {
    await client.connect();
    console.log("DB connected\n");

    console.log("=".repeat(70));
    console.log("STEP 1: DB 인코딩 확인");
    console.log("=".repeat(70));

    const encoding = await client.query("SHOW server_encoding");
    const clientEncoding = await client.query("SHOW client_encoding");
    console.log("Server Encoding: " + encoding.rows[0].server_encoding);
    console.log("Client Encoding: " + clientEncoding.rows[0].client_encoding);

    await client.query("SET client_encoding TO 'UTF8'");
    console.log("Client encoding set to UTF8");

    console.log("\n" + "=".repeat(70));
    console.log("STEP 2: 테이블별 깨진 데이터 조사");
    console.log("=".repeat(70));

    const tablesToCheck = [
      { table: "data_collection_schedule", fields: ["description"] },
      {
        table: "tripadvisor_data",
        fields: ["recent_review_summary", "tripadvisor_category"],
      },
      {
        table: "youtube_place_mentions",
        fields: ["place_name", "city_name", "summary"],
      },
      { table: "youtube_videos", fields: ["title", "description"] },
      { table: "naver_blog_posts", fields: ["post_title", "blogger_name"] },
      { table: "place_prices", fields: ["price_label"] },
      { table: "reviews", fields: ["review_text", "reviewer_name"] },
      { table: "weather_cache", fields: ["weather_description"] },
      { table: "weather_forecast", fields: ["description"] },
      { table: "gemini_web_search_cache", fields: ["search_query"] },
    ];

    const brokenReport = [];

    for (const { table, fields } of tablesToCheck) {
      try {
        const count = await client.query(
          `SELECT COUNT(*) as cnt FROM "${table}"`,
        );
        const totalRows = parseInt(count.rows[0].cnt);

        let brokenCount = 0;
        for (const field of fields) {
          try {
            const sample = await client.query(
              `SELECT id, "${field}" FROM "${table}" WHERE "${field}" IS NOT NULL LIMIT 100`,
            );
            const broken = sample.rows.filter((r) =>
              hasBrokenEncoding(r[field]),
            );
            brokenCount += broken.length;
          } catch (e) {}
        }

        brokenReport.push({
          table,
          fields: fields.join(", "),
          totalRows,
          brokenCount,
          status: brokenCount > 0 ? "BROKEN" : "OK",
        });

        console.log(`\n[${table}] ${totalRows}행`);
        console.log(`  필드: ${fields.join(", ")}`);
        console.log(
          `  상태: ${brokenCount > 0 ? "❌ 깨짐 " + brokenCount + "개" : "✅ 정상"}`,
        );
      } catch (e) {
        console.log(`\n[${table}] 오류: ${e.message}`);
      }
    }

    console.log("\n" + "=".repeat(70));
    console.log("STEP 3: 깨진 데이터 삭제");
    console.log("=".repeat(70));

    const schedDel = await client.query(`
      DELETE FROM data_collection_schedule
      WHERE id NOT IN (SELECT MIN(id) FROM data_collection_schedule GROUP BY task_name)
    `);
    console.log(`\ndata_collection_schedule: ${schedDel.rowCount}개 중복 삭제`);

    const tripDel = await client.query(`
      DELETE FROM tripadvisor_data
      WHERE id NOT IN (SELECT MIN(id) FROM tripadvisor_data GROUP BY tripadvisor_url)
    `);
    console.log(`tripadvisor_data: ${tripDel.rowCount}개 중복 삭제`);

    const ytMentionsDel = await client.query(`
      DELETE FROM youtube_place_mentions
      WHERE id NOT IN (SELECT MIN(id) FROM youtube_place_mentions GROUP BY video_id, place_name)
    `);
    console.log(
      `youtube_place_mentions: ${ytMentionsDel.rowCount}개 중복 삭제`,
    );

    const ytVideosDel = await client.query(`
      DELETE FROM youtube_videos
      WHERE id NOT IN (SELECT MIN(id) FROM youtube_videos GROUP BY video_id)
    `);
    console.log(`youtube_videos: ${ytVideosDel.rowCount}개 중복 삭제`);

    const naverDel = await client.query(`
      DELETE FROM naver_blog_posts
      WHERE id NOT IN (SELECT MIN(id) FROM naver_blog_posts GROUP BY post_url)
    `);
    console.log(`naver_blog_posts: ${naverDel.rowCount}개 중복 삭제`);

    const priceDel = await client.query(`
      DELETE FROM place_prices
      WHERE id NOT IN (SELECT MIN(id) FROM place_prices GROUP BY place_id, price_type)
    `);
    console.log(`place_prices: ${priceDel.rowCount}개 중복 삭제`);

    const reviewDel = await client.query(`
      DELETE FROM reviews
      WHERE id NOT IN (SELECT MIN(id) FROM reviews GROUP BY place_id, review_text)
    `);
    console.log(`reviews: ${reviewDel.rowCount}개 중복 삭제`);

    console.log("\n" + "=".repeat(70));
    console.log("STEP 4: 최종 테이블 현황");
    console.log("=".repeat(70));

    const allTables = await client.query(`
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' ORDER BY table_name
    `);

    console.log("\n테이블 | 행수 | 상태");
    console.log("-".repeat(50));

    for (const row of allTables.rows) {
      try {
        const cnt = await client.query(
          `SELECT COUNT(*) as c FROM "${row.table_name}"`,
        );
        const count = cnt.rows[0].c;
        const status = count === "0" ? "빈 테이블" : count + "행";
        console.log(`${row.table_name}: ${status}`);
      } catch (e) {
        console.log(`${row.table_name}: 오류`);
      }
    }

    console.log("\n" + "=".repeat(70));
    console.log("DB 정리 완료!");
    console.log("=".repeat(70));
  } catch (error) {
    console.error("Error:", error.message);
    console.error(error.stack);
  } finally {
    await client.end();
  }
}

analyzeAndFixDB();
