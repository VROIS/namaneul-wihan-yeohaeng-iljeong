const { Client } = require('pg');

const connectionString =
  process.env.SUPABASE_DATABASE_URL ||
  'postgresql://postgres:Vrois%4075015@db.wxebceflvuythuodemro.supabase.co:5432/postgres';

async function checkTables() {
  const client = new Client({ connectionString });
  
  try {
    await client.connect();
    console.log('Connected to Supabase!');
    
    const result = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);
    
    console.log(`\nFound ${result.rows.length} tables:`);
    result.rows.forEach(row => console.log(`  - ${row.table_name}`));
    
    // Check row counts for key tables
    const counts = await client.query(`
      SELECT 
        (SELECT COUNT(*) FROM places) as places,
        (SELECT COUNT(*) FROM cities) as cities,
        (SELECT COUNT(*) FROM users) as users
    `);
    
    console.log('\nRow counts:');
    console.log(`  - places: ${counts.rows[0].places}`);
    console.log(`  - cities: ${counts.rows[0].cities}`);
    console.log(`  - users: ${counts.rows[0].users}`);
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

checkTables();
