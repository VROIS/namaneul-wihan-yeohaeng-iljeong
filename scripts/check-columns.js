const { Client } = require('pg');
require('dotenv').config();

async function checkColumns() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  
  const tables = ['places', 'instagram_hashtags'];
  
  for (const table of tables) {
    console.log('\n=== ' + table + ' columns ===');
    const result = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = $1
      ORDER BY ordinal_position
    `, [table]);
    result.rows.forEach(r => console.log('  ' + r.column_name + ': ' + r.data_type));
  }
  
  await client.end();
}
checkColumns();
