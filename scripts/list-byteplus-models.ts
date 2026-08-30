import * as dotenv from "dotenv";
import pg from "pg";

dotenv.config();

const { Pool } = pg;
const BYTEPLUS_BASE_URL = "https://ark.ap-southeast.bytepluses.com/api/v3";

async function getApiKey(pool: pg.Pool) {
  const res = await pool.query(
    "SELECT key_value FROM api_keys WHERE key_name = 'SEEDANCE_API_KEY'",
  );
  return res.rows[0]?.key_value;
}

async function listModels() {
  console.log("🔍 Fetching BytePlus Models...");

  if (!process.env.DATABASE_URL) {
    console.error("❌ DATABASE_URL missing");
    return;
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });

  try {
    const apiKey = await getApiKey(pool);
    if (!apiKey) {
      console.error("❌ API Key not found in DB");
      return;
    }

    console.log(`🔑 Using API Key: ${apiKey.substring(0, 5)}...`);

    const response = await fetch(`${BYTEPLUS_BASE_URL}/models`, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
    });

    if (!response.ok) {
      console.error(`❌ API Error: ${response.status} ${response.statusText}`);
      console.error(await response.text());
      return;
    }

    const data = await response.json();
    console.log("✅ Models found:", JSON.stringify(data, null, 2));
  } catch (error) {
    console.error("❌ Error:", error);
  } finally {
    await pool.end();
  }
}

listModels();
