const { Client } = require("pg");
require("dotenv").config();

async function checkDBEncoding() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });

  try {
    await client.connect();
    console.log("=".repeat(70));
    console.log("DB 인코딩 전체 진단");
    console.log("=".repeat(70));

    const serverEnc = await client.query("SHOW server_encoding");
    console.log("\n[1] Server Encoding: " + serverEnc.rows[0].server_encoding);

    const clientEnc = await client.query("SHOW client_encoding");
    console.log("[2] Client Encoding: " + clientEnc.rows[0].client_encoding);

    const dbEnc = await client.query(`
      SELECT datname, pg_encoding_to_char(encoding) as encoding 
      FROM pg_database WHERE datname = current_database()
    `);
    console.log("[3] Database Encoding: " + dbEnc.rows[0].encoding);

    const locale = await client.query(`
      SELECT datcollate, datctype FROM pg_database WHERE datname = current_database()
    `);
    console.log("[4] LC_COLLATE: " + locale.rows[0].datcollate);
    console.log("[5] LC_CTYPE: " + locale.rows[0].datctype);

    console.log("\n" + "=".repeat(70));
    console.log("한글 입력 테스트");
    console.log("=".repeat(70));

    await client.query(`
      CREATE TABLE IF NOT EXISTS _encoding_test (
        id SERIAL PRIMARY KEY,
        korean_text TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    const testText = "서울 파리 도쿄 테스트";
    await client.query("INSERT INTO _encoding_test (korean_text) VALUES ($1)", [
      testText,
    ]);

    const readBack = await client.query(
      "SELECT korean_text FROM _encoding_test ORDER BY id DESC LIMIT 1",
    );
    const savedText = readBack.rows[0].korean_text;

    console.log("\n입력값: " + testText);
    console.log("저장값: " + savedText);
    console.log("일치: " + (testText === savedText ? "✅ 정상" : "❌ 깨짐"));

    await client.query("DROP TABLE IF EXISTS _encoding_test");

    console.log("\n" + "=".repeat(70));
    console.log("naver_blog_posts 현재 상태");
    console.log("=".repeat(70));

    const naverSample = await client.query(
      "SELECT id, post_title, description FROM naver_blog_posts LIMIT 5",
    );
    naverSample.rows.forEach((r) => {
      console.log("\n[ID " + r.id + "]");
      console.log("  title: " + (r.post_title || "NULL").substring(0, 60));
      console.log("  desc: " + (r.description || "NULL").substring(0, 60));
    });

    console.log("\n" + "=".repeat(70));
    console.log("진단 완료");
    console.log("=".repeat(70));
  } catch (error) {
    console.error("Error:", error.message);
  } finally {
    await client.end();
  }
}

checkDBEncoding();
