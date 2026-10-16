const { Client } = require("pg");
require("dotenv").config();

async function cleanIG() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });

  try {
    await client.connect();
    console.log("DB connected\n");

    console.log("=== Delete non-Korean hashtags ===");

    const deleteNonKorean = await client.query(`
      DELETE FROM instagram_hashtags
      WHERE hashtag !~ '#[가-힣]'
    `);
    console.log("Deleted " + deleteNonKorean.rowCount + " non-Korean hashtags");

    console.log("\n=== Remove duplicates ===");
    const dupResult = await client.query(`
      DELETE FROM instagram_hashtags
      WHERE id NOT IN (
        SELECT MIN(id) FROM instagram_hashtags GROUP BY LOWER(hashtag)
      )
    `);
    console.log("Removed " + dupResult.rowCount + " duplicates");

    console.log("\n=== Final Result ===");
    const all = await client.query(
      "SELECT id, hashtag, category FROM instagram_hashtags ORDER BY hashtag",
    );
    console.log("Total: " + all.rows.length + " hashtags\n");
    all.rows.forEach((r) =>
      console.log("  " + r.hashtag + " (" + (r.category || "-") + ")"),
    );
  } catch (error) {
    console.error("Error:", error.message);
  } finally {
    await client.end();
  }
}

cleanIG();
