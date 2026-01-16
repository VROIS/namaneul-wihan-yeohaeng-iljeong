const { Client } = require('pg');
require('dotenv').config();

async function fix() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query("SET client_encoding TO 'UTF8'");
  
  // 현재 상태 확인
  const before = await client.query('SELECT id, task_name FROM data_collection_schedule ORDER BY task_name, id');
  console.log('현재 상태:');
  before.rows.forEach(r => console.log('  [' + r.id + '] ' + r.task_name));
  
  // 중복 삭제 (task_name 기준 최소 id만 유지)
  const del = await client.query(`
    DELETE FROM data_collection_schedule 
    WHERE id NOT IN (
      SELECT MIN(id) FROM data_collection_schedule GROUP BY task_name
    )
  `);
  console.log('\n삭제된 중복: ' + del.rowCount + '개');
  
  // 최종 상태
  const after = await client.query('SELECT id, task_name, description FROM data_collection_schedule ORDER BY id');
  console.log('\n최종 상태:');
  after.rows.forEach(r => console.log('  [' + r.id + '] ' + r.task_name + ': ' + r.description));
  
  await client.end();
}
fix();
