const { Client } = require("pg");
require("dotenv").config();

async function checkDBStatus() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });

  try {
    await client.connect();
    console.log("✅ DB 연결 성공\n");

    console.log("=".repeat(60));
    console.log("📊 테이블별 데이터 현황");
    console.log("=".repeat(60));

    const tableList = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name
    `);

    const tableStats = [];
    for (const row of tableList.rows) {
      try {
        const countResult = await client.query(
          `SELECT COUNT(*) as cnt FROM "${row.table_name}"`,
        );
        const count = parseInt(countResult.rows[0].cnt);
        tableStats.push({ name: row.table_name, count });
      } catch (e) {
        tableStats.push({ name: row.table_name, count: -1, error: e.message });
      }
    }

    const emptyTables = tableStats.filter((t) => t.count === 0);
    const dataTables = tableStats.filter((t) => t.count > 0);

    console.log("\n📦 데이터 있는 테이블:");
    dataTables
      .sort((a, b) => b.count - a.count)
      .forEach((t) => {
        console.log(`  ${t.name}: ${t.count}행`);
      });

    console.log(`\n📭 빈 테이블 (${emptyTables.length}개):`);
    emptyTables.forEach((t) => {
      console.log(`  - ${t.name}`);
    });

    console.log("\n" + "=".repeat(60));
    console.log("🔄 중복 데이터 확인");
    console.log("=".repeat(60));

    const cityDupes = await client.query(`
      SELECT name, country, COUNT(*) as cnt 
      FROM cities 
      GROUP BY name, country 
      HAVING COUNT(*) > 1
      ORDER BY cnt DESC
      LIMIT 10
    `);
    if (cityDupes.rows.length > 0) {
      console.log("\n🏙️ cities 중복:");
      cityDupes.rows.forEach((r) =>
        console.log(`  ${r.name}, ${r.country}: ${r.cnt}개`),
      );
    }

    const placeDupes = await client.query(`
      SELECT name, COUNT(*) as cnt 
      FROM places 
      GROUP BY name 
      HAVING COUNT(*) > 1
      ORDER BY cnt DESC
      LIMIT 10
    `);
    if (placeDupes.rows.length > 0) {
      console.log("\n📍 places 중복:");
      placeDupes.rows.forEach((r) => console.log(`  ${r.name}: ${r.cnt}개`));
    }

    const ytDupes = await client.query(`
      SELECT channel_id, COUNT(*) as cnt 
      FROM youtube_channels 
      GROUP BY channel_id 
      HAVING COUNT(*) > 1
      ORDER BY cnt DESC
      LIMIT 10
    `);
    if (ytDupes.rows.length > 0) {
      console.log("\n📺 youtube_channels 중복:");
      ytDupes.rows.forEach((r) => console.log(`  ${r.channel_id}: ${r.cnt}개`));
    }

    const igDupes = await client.query(`
      SELECT hashtag, COUNT(*) as cnt 
      FROM instagram_hashtags 
      GROUP BY hashtag 
      HAVING COUNT(*) > 1
      ORDER BY cnt DESC
      LIMIT 10
    `);
    if (igDupes.rows.length > 0) {
      console.log("\n📸 instagram_hashtags 중복:");
      igDupes.rows.forEach((r) => console.log(`  ${r.hashtag}: ${r.cnt}개`));
    }

    console.log("\n" + "=".repeat(60));
    console.log("🔤 한글 데이터 샘플 (깨짐 확인)");
    console.log("=".repeat(60));

    const citySample = await client.query(
      `SELECT id, name, country FROM cities LIMIT 5`,
    );
    console.log("\n🏙️ cities 샘플:");
    citySample.rows.forEach((r) =>
      console.log(`  [${r.id}] ${r.name}, ${r.country}`),
    );

    const placeSample = await client.query(
      `SELECT id, name, description FROM places LIMIT 5`,
    );
    console.log("\n📍 places 샘플:");
    placeSample.rows.forEach((r) =>
      console.log(
        `  [${r.id}] ${r.name}: ${(r.description || "").substring(0, 50)}...`,
      ),
    );

    const ytSample = await client.query(
      `SELECT id, channel_name FROM youtube_channels LIMIT 5`,
    );
    console.log("\n📺 youtube_channels 샘플:");
    ytSample.rows.forEach((r) => console.log(`  [${r.id}] ${r.channel_name}`));

    const blogSample = await client.query(
      `SELECT id, source_name, platform FROM blog_sources LIMIT 5`,
    );
    console.log("\n📝 blog_sources 샘플:");
    blogSample.rows.forEach((r) =>
      console.log(`  [${r.id}] ${r.source_name} (${r.platform})`),
    );

    console.log("\n" + "=".repeat(60));
    console.log("✅ DB 점검 완료");
    console.log("=".repeat(60));
  } catch (error) {
    console.error("❌ 오류:", error.message);
  } finally {
    await client.end();
  }
}

checkDBStatus();
