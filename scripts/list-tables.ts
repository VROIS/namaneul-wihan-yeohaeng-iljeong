import 'dotenv/config';
import { db } from '../server/db';
import { sql } from 'drizzle-orm';

async function list() {
    const res = await db.execute(sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public'`);
    console.table(res.rows);
    process.exit(0);
}

list();
