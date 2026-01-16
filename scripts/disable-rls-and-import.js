const { Client } = require('pg');
const { from: copyFrom } = require('pg-copy-streams');
const fs = require('fs');
const path = require('path');

const connectionString = 'postgresql://postgres:Vrois%4075015@db.wxebceflvuythuodemro.supabase.co:5432/postgres';

async function main() {
  const client = new Client({ 
    connectionString,
    connectionTimeoutMillis: 60000,
    statement_timeout: 120000
  });

  const sqlPath = path.join(__dirname, '..', 'backup_clean.sql');
  let raw = fs.readFileSync(sqlPath, 'utf8');
  raw = raw.replace(/^\uFEFF/, '');
  const lines = raw.split(/\r?\n/);

  console.log('Parsing SQL file...');
  
  // Collect all COPY statements
  const tables = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('COPY ')) {
      const copyCommand = line;
      const tableName = line.match(/COPY public\.(\w+)/)?.[1] || 'unknown';
      const dataLines = [];
      i++;
      while (i < lines.length && lines[i] !== '\\.') {
        dataLines.push(lines[i]);
        i++;
      }
      tables.push({ tableName, copyCommand, dataLines });
    }
  }

  console.log(`Found ${tables.length} tables`);
  console.log('Connecting...');
  
  try {
    await client.connect();
    console.log('Connected!');

    // Disable RLS for all tables
    console.log('\nDisabling RLS...');
    for (const table of tables) {
      try {
        await client.query(`ALTER TABLE ${table.tableName} DISABLE ROW LEVEL SECURITY`);
      } catch (e) {
        // Ignore errors
      }
    }
    console.log('RLS disabled.\n');

    let totalRows = 0;
    
    for (const table of tables) {
      if (table.dataLines.length === 0) {
        console.log(`  ${table.tableName}: 0 rows`);
        continue;
      }

      const copyData = table.dataLines.join('\n') + '\n';
      
      try {
        await new Promise((resolve, reject) => {
          const stream = client.query(copyFrom(table.copyCommand));
          stream.on('error', reject);
          stream.on('finish', resolve);
          stream.write(copyData);
          stream.end();
        });
        console.log(`  ${table.tableName}: ${table.dataLines.length} rows ✓`);
        totalRows += table.dataLines.length;
      } catch (err) {
        console.error(`  ${table.tableName}: ERROR - ${err.message}`);
      }
    }

    console.log(`\n✅ Done! Total: ${totalRows} rows`);

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
    console.log('Connection closed.');
  }
}

main();
