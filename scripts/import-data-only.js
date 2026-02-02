const { Client } = require('pg');
const { from: copyFrom } = require('pg-copy-streams');
const fs = require('fs');
const path = require('path');

// Supabase connection string (set via env)
const connectionString =
  process.env.SUPABASE_DATABASE_URL ||
  'postgresql://postgres:Vrois%4075015@db.wxebceflvuythuodemro.supabase.co:5432/postgres';

async function importData() {
  const client = new Client({ connectionString });

  const sqlPath = path.join(__dirname, '..', 'backup_clean.sql');
  let raw = fs.readFileSync(sqlPath, 'utf8');
  // Remove BOM if present
  raw = raw.replace(/^\uFEFF/, '');
  const lines = raw.split(/\r?\n/);

  try {
    console.log('Connecting to Supabase...');
    await client.connect();
    console.log('Connected successfully!');

    console.log(`Reading SQL file: ${sqlPath}`);
    console.log(`Total lines: ${lines.length}`);

    let copyCount = 0;
    let totalRows = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Handle COPY ... FROM stdin
      if (line.startsWith('COPY ')) {
        const copyCommand = line;
        const tableName = line.match(/COPY public\.(\w+)/)?.[1] || 'unknown';
        const dataLines = [];
        i++; // move past COPY line
        while (i < lines.length && lines[i] !== '\\.') {
          dataLines.push(lines[i]);
          i++;
        }
        // i is at "\." terminator

        if (dataLines.length === 0) {
          console.log(`  [${++copyCount}] ${tableName}: 0 rows (empty)`);
          continue;
        }

        const copyData = dataLines.join('\n') + '\n';

        try {
          await new Promise((resolve, reject) => {
            const stream = client.query(copyFrom(copyCommand));
            stream.on('error', reject);
            stream.on('end', resolve);
            stream.write(copyData);
            stream.end();
          });
          console.log(`  [${++copyCount}] ${tableName}: ${dataLines.length} rows`);
          totalRows += dataLines.length;
        } catch (err) {
          console.error(`  [${++copyCount}] ${tableName}: ERROR - ${err.message}`);
        }
      }
    }

    console.log(`\n✅ Import complete! Total: ${totalRows} rows across ${copyCount} tables`);

    // Verify by counting some tables
    const result = await client.query(`
      SELECT 
        (SELECT COUNT(*) FROM places) as places,
        (SELECT COUNT(*) FROM cities) as cities,
        (SELECT COUNT(*) FROM reviews) as reviews,
        (SELECT COUNT(*) FROM instagram_hashtags) as instagram_hashtags
    `);
    console.log('\nVerification counts:');
    console.log(`  - places: ${result.rows[0].places}`);
    console.log(`  - cities: ${result.rows[0].cities}`);
    console.log(`  - reviews: ${result.rows[0].reviews}`);
    console.log(`  - instagram_hashtags: ${result.rows[0].instagram_hashtags}`);

  } catch (error) {
    console.error('Error:', error.message);
    if (error.position) {
      console.error('Error position:', error.position);
    }
  } finally {
    await client.end();
    console.log('\nConnection closed.');
  }
}

importData();
