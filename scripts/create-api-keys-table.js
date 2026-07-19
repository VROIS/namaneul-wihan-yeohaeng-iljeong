const { Client } = require("pg");

const connectionString =
  "postgresql://postgres:Vrois%4075015@db.wxebceflvuythuodemro.supabase.co:5432/postgres";

async function main() {
  const client = new Client({ connectionString });

  try {
    await client.connect();
    console.log("Connected to Supabase");

    // Create api_keys table
    await client.query(`
      CREATE TABLE IF NOT EXISTS api_keys (
        id SERIAL PRIMARY KEY,
        key_name TEXT NOT NULL UNIQUE,
        key_value TEXT NOT NULL,
        display_name TEXT NOT NULL,
        description TEXT,
        is_active BOOLEAN DEFAULT true,
        last_tested_at TIMESTAMP,
        last_test_result TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
      );
    `);
    console.log("✅ api_keys table created");

    // Insert default API key entries (with empty values)
    const defaultKeys = [
      {
        keyName: "GEMINI_API_KEY",
        displayName: "Gemini AI",
        description: "Google AI Studio에서 발급 (aistudio.google.com)",
      },
      {
        keyName: "GOOGLE_MAPS_API_KEY",
        displayName: "Google Maps/Places",
        description: "Google Cloud Console에서 발급",
      },
      {
        keyName: "YOUTUBE_API_KEY",
        displayName: "YouTube Data API",
        description: "Google Cloud Console에서 발급",
      },
      {
        keyName: "OPENWEATHER_API_KEY",
        displayName: "OpenWeather",
        description: "openweathermap.org에서 발급",
      },
      {
        keyName: "NAVER_CLIENT_ID",
        displayName: "Naver Client ID",
        description: "Naver Developers에서 발급",
      },
      {
        keyName: "NAVER_CLIENT_SECRET",
        displayName: "Naver Client Secret",
        description: "Naver Developers에서 발급",
      },
      {
        keyName: "NEWSAPI_KEY",
        displayName: "NewsAPI",
        description: "newsapi.org에서 발급",
      },
    ];

    for (const key of defaultKeys) {
      await client.query(
        `
        INSERT INTO api_keys (key_name, key_value, display_name, description)
        VALUES ($1, '', $2, $3)
        ON CONFLICT (key_name) DO NOTHING
      `,
        [key.keyName, key.displayName, key.description],
      );
    }
    console.log("✅ Default API key entries created");

    // Verify
    const result = await client.query(
      "SELECT key_name, display_name FROM api_keys ORDER BY id",
    );
    console.log("\n📋 API Keys in database:");
    result.rows.forEach((row) => {
      console.log(`  - ${row.key_name}: ${row.display_name}`);
    });
  } catch (error) {
    console.error("Error:", error.message);
  } finally {
    await client.end();
  }
}

main();
