const { Client } = require('pg');
const fs = require('fs');
const path = require('path');

const connectionString = 'postgresql://postgres:Vrois%4075015@db.wxebceflvuythuodemro.supabase.co:5432/postgres';

function parseColumns(copyLine) {
  const match = copyLine.match(/COPY public\.(\w+)\s*\(([^)]+)\)/);
  if (!match) return { tableName: 'unknown', columns: [] };
  return {
    tableName: match[1],
    columns: match[2].split(',').map(c => c.trim())
  };
}

function escapeValue(val) {
  if (val === '\\N') return 'NULL';
  if (val === 't') return 'TRUE';
  if (val === 'f') return 'FALSE';
  // Escape single quotes
  const escaped = val.replace(/'/g, "''");
  return `'${escaped}'`;
}

async function main() {
  const client = new Client({ 
    connectionString,
    connectionTimeoutMillis: 30000
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
      const { tableName, columns } = parseColumns(line);
      const dataLines = [];
      i++;
      while (i < lines.length && lines[i] !== '\\.') {
        dataLines.push(lines[i]);
        i++;
      }
      tables.push({ tableName, columns, dataLines });
    }
  }

  console.log(`Found ${tables.length} tables`);
  console.log('Connecting...');
  
  try {
    await client.connect();
    console.log('Connected!\n');

    let totalRows = 0;
    
    for (const table of tables) {
      if (table.dataLines.length === 0) {
        console.log(`  ${table.tableName}: 0 rows`);
        continue;
      }

      // Process in batches
      const batchSize = 100;
      let inserted = 0;
      
      for (let i = 0; i < table.dataLines.length; i += batchSize) {
        const batch = table.dataLines.slice(i, i + batchSize);
        const values = batch.map(line => {
          const fields = line.split('\t').map(escapeValue);
          return `(${fields.join(', ')})`;
        });
        
        const sql = `INSERT INTO ${table.tableName} (${table.columns.join(', ')}) VALUES ${values.join(', ')} ON CONFLICT DO NOTHING`;
        
        try {
          await client.query(sql);
          inserted += batch.length;
        } catch (err) {
          // Try one by one
          for (const line of batch) {
            const fields = line.split('\t').map(escapeValue);
            const singleSql = `INSERT INTO ${table.tableName} (${table.columns.join(', ')}) VALUES (${fields.join(', ')}) ON CONFLICT DO NOTHING`;
            try {
              await client.query(singleSql);
              inserted++;
            } catch (e) {
              // Skip this row
            }
          }
        }
      }
      
      console.log(`  ${table.tableName}: ${inserted}/${table.dataLines.length} rows ✓`);
      totalRows += inserted;
    }

    console.log(`\n✅ Done! Total: ${totalRows} rows`);

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

main();
