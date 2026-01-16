const { Client } = require('pg');
const { from: copyFrom } = require('pg-copy-streams');
const fs = require('fs');
const path = require('path');

const connectionString =
  process.env.SUPABASE_DATABASE_URL ||
  'postgresql://postgres:Vrois%4075015@db.wxebceflvuythuodemro.supabase.co:5432/postgres';

async function importTable(tableName, copyCommand, dataLines) {
  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    
    if (dataLines.length === 0) {
      console.log(`  ${tableName}: 0 rows (empty)`);
      return 0;
    }
    
    const copyData = dataLines.join('\n') + '\n';
    
    await new Promise((resolve, reject) => {
      const stream = client.query(copyFrom(copyCommand));
      stream.on('error', reject);
      stream.on('end', resolve);
      stream.write(copyData);
      stream.end();
    });
    
    console.log(`  ${tableName}: ${dataLines.length} rows ✓`);
    return dataLines.length;
    
  } catch (error) {
    console.error(`  ${tableName}: ERROR - ${error.message}`);
    return 0;
  } finally {
    await client.end();
  }
}

async function main() {
  const sqlPath = path.join(__dirname, '..', 'backup_clean.sql');
  let raw = fs.readFileSync(sqlPath, 'utf8');
  raw = raw.replace(/^\uFEFF/, '');
  const lines = raw.split(/\r?\n/);
  
  console.log('Parsing SQL file...');
  console.log(`Total lines: ${lines.length}`);
  
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
  
  console.log(`Found ${tables.length} tables to import\n`);
  
  let totalRows = 0;
  for (const table of tables) {
    const rows = await importTable(table.tableName, table.copyCommand, table.dataLines);
    totalRows += rows;
  }
  
  console.log(`\n✅ Import complete! Total: ${totalRows} rows`);
}

main().catch(console.error);
