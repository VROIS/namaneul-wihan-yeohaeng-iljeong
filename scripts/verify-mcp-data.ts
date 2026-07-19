import { db } from "../server/db";
import { placeSeedRaw } from "../shared/schema";
import { sql } from "drizzle-orm";

async function checkData() {
  console.log("🔍 Checking place_seed_raw data population...");

  const stats = await db
    .select({
      total: sql<number>`count(*)`,
      withImage: sql<number>`count(image_url)`,
      withPrice: sql<number>`count(price_eur)`,
      withBoth: sql<number>`count(*) filter (where image_url is not null and price_eur > 0)`,
    })
    .from(placeSeedRaw);

  console.log("========================================");
  console.log(`Total Rows: ${stats[0].total}`);
  console.log(`Rows with Image: ${stats[0].withImage}`);
  console.log(`Rows with Price: ${stats[0].withPrice}`);
  console.log(`Rows with Both: ${stats[0].withBoth}`);
  console.log("========================================");

  if (stats[0].withBoth > 0) {
    const samples = await db
      .select()
      .from(placeSeedRaw)
      .where(sql`image_url is not null and price_eur > 0`)
      .limit(5);
    console.log("📄 Samples (Both populated):");
    samples.forEach((s) => {
      console.log(
        `- ${s.nameKo} (${s.nameEn}): Price=${s.priceEur}EUR, Image=${s.imageUrl?.substring(0, 50)}...`,
      );
    });
  } else {
    console.log("⚠️ No rows found with both price and image yet.");
  }
}

checkData()
  .catch(console.error)
  .finally(() => process.exit());
