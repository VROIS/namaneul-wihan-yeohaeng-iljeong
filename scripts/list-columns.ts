import "dotenv/config";
import { db } from "../server/db";
import { sql } from "drizzle-orm";

async function list() {
  console.log("--- place_images columns ---");
  const pi = await db.execute(
    sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'place_images'`,
  );
  console.table(pi.rows);

  console.log("\n--- instagram_photos columns ---");
  const ip = await db.execute(
    sql`SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'instagram_photos'`,
  );
  console.table(ip.rows);
  process.exit(0);
}

list();
