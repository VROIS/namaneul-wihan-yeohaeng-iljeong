const { Client } = require('pg');
const { from: copyFrom } = require('pg-copy-streams');
const fs = require('fs');
const path = require('path');

// Supabase connection string (set via env)
const connectionString =
  process.env.SUPABASE_DATABASE_URL ||
  'postgresql://postgres:[YOUR-PASSWORD]@db.wxebceflvuythuodemro.supabase.co:5432/postgres';

async function importSQL() {
  const client = new Client({ connectionString });

  const sqlPath = path.join(__dirname, '..', 'backup_clean.sql');
  const raw = fs.readFileSync(sqlPath, 'utf8');
  const lines = raw.split(/\r?\n/);

  const flushBuffer = async (buf) => {
    const sql = buf.join('\n').trim();
    if (!sql) return;
    await client.query(sql);
  };

  try {
    console.log('Connecting to Supabase...');
    await client.connect();
    console.log('Connected successfully!');

    // Ensure clean slate inside the same session to avoid leftover objects
    console.log('Dropping known enum types if they exist...');
    await client.query(`
      DROP TYPE IF EXISTS public.data_source CASCADE;
      DROP TYPE IF EXISTS public.persona_type CASCADE;
      DROP TYPE IF EXISTS public.place_type CASCADE;
      DROP TYPE IF EXISTS public.verification_status CASCADE;
    `);
    console.log('Enum types dropped (if any).');

    console.log('Resetting public schema (DROP CASCADE)...');
    await client.query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
    console.log('Schema reset complete.');

    console.log(`Reading SQL file: ${sqlPath}`);
    console.log(`SQL file size: ${(raw.length / 1024 / 1024).toFixed(2)} MB`);

    console.log('Executing SQL with COPY streaming...');
    let buffer = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Handle COPY ... FROM stdin
      if (line.startsWith('COPY ')) {
        await flushBuffer(buffer);
        buffer = [];

        const copyCommand = line;
        const dataLines = [];
        i++; // move past COPY line
        while (i < lines.length && lines[i] !== '\\.') {
          dataLines.push(lines[i]);
          i++;
        }
        // i is at "\." terminator
        const copyData = dataLines.join('\n') + '\n';

        await new Promise((resolve, reject) => {
          const stream = client.query(copyFrom(copyCommand));
          stream.on('error', reject);
          stream.on('end', resolve);
          stream.write(copyData);
          stream.end();
        });

        continue;
      }

      buffer.push(line);
    }
    await flushBuffer(buffer);

    console.log('SQL executed successfully!');

    // Verify by counting tables
    const result = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    console.log(`\nCreated ${result.rows.length} tables:`);
    result.rows.forEach((row) => console.log(`  - ${row.table_name}`));
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

importSQL();
