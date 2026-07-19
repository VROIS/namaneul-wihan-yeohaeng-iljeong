import { sql } from "drizzle-orm";
import { db } from "../server/db";
async function checkSpace() {
  const query = sql`SELECT sum(pg_total_relation_size(relid)) as total_size FROM pg_catalog.pg_statio_user_tables;`;
  const res = await db.execute(query);
  console.log("Total DB Size (bytes):", res.rows[0].total_size);
  process.exit(0);
}
checkSpace().catch(console.error);
