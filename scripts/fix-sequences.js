const { Client } = require("pg");

const connectionString =
  "postgresql://postgres:Vrois%4075015@db.wxebceflvuythuodemro.supabase.co:5432/postgres";

async function main() {
  const client = new Client({ connectionString });

  try {
    await client.connect();
    console.log("Connected!");

    const seqResult = await client.query(`
      SELECT sequence_name 
      FROM information_schema.sequences 
      WHERE sequence_schema = 'public'
    `);

    console.log(`Found ${seqResult.rows.length} sequences to fix\n`);

    for (const row of seqResult.rows) {
      const seqName = row.sequence_name;
      const tableName = seqName.replace("_id_seq", "");

      try {
        await client.query(`
          SELECT setval('${seqName}', COALESCE((SELECT MAX(id) FROM ${tableName}), 0) + 1, false)
        `);
        console.log(`  ✓ ${seqName}`);
      } catch (e) {
        console.log(`  ✗ ${seqName}: ${e.message}`);
      }
    }

    console.log("\n✅ Sequences fixed!");
  } catch (error) {
    console.error("Error:", error.message);
  } finally {
    await client.end();
  }
}

main();
