const fs = require('fs');
const path = require('path');

// Supabase config - 환경변수에서만 로드
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

// Use service key if available, otherwise anon key
const API_KEY = SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY;

async function uploadTable(tableName, data) {
  if (!data || data.length === 0) {
    console.log(`  ${tableName}: 0 rows (empty)`);
    return 0;
  }

  const url = `${SUPABASE_URL}/rest/v1/${tableName}`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': API_KEY,
        'Authorization': `Bearer ${API_KEY}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(data)
    });

    if (response.ok) {
      console.log(`  ${tableName}: ${data.length} rows ✓`);
      return data.length;
    } else {
      const error = await response.text();
      console.error(`  ${tableName}: ERROR ${response.status} - ${error.substring(0, 100)}`);
      return 0;
    }
  } catch (error) {
    console.error(`  ${tableName}: ERROR - ${error.message}`);
    return 0;
  }
}

async function main() {
  if (!API_KEY) {
    console.error('Error: SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY required');
    console.log('Set it with: $env:SUPABASE_SERVICE_ROLE_KEY = "your-key"');
    process.exit(1);
  }

  const exportsDir = path.join(__dirname, '..', 'exports');
  const files = fs.readdirSync(exportsDir).filter(f => f.endsWith('.json'));
  
  console.log(`Found ${files.length} JSON files to upload\n`);
  
  let totalRows = 0;
  
  for (const file of files) {
    const tableName = file.replace('.json', '');
    const filePath = path.join(exportsDir, file);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    
    const rows = await uploadTable(tableName, data);
    totalRows += rows;
  }
  
  console.log(`\n✅ Upload complete! Total: ${totalRows} rows`);
}

main().catch(console.error);
