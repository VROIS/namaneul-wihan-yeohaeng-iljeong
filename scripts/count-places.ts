import 'dotenv/config';
import { db } from '../server/db';
import { places } from '@shared/schema';
import { sql } from 'drizzle-orm';

async function count() {
    const res = await db.select({ count: sql<number>`count(*)` }).from(places);
    console.log(`Total Places: ${res[0].count}`);
    process.exit(0);
}

count();
