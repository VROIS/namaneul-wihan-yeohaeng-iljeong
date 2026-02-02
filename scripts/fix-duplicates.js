const { Client } = require('pg');

const connectionString = 'postgresql://postgres:Vrois%4075015@db.wxebceflvuythuodemro.supabase.co:5432/postgres';

async function main() {
  const client = new Client({ connectionString });

  try {
    await client.connect();
    console.log('Connected!');

    // 1. 중복 행 삭제 (같은 id 중 나중에 생성된 것 삭제)
    const delResult = await client.query(`
      DELETE FROM guide_prices a
      USING guide_prices b
      WHERE a.id = b.id AND a.ctid > b.ctid
    `);
    console.log(`중복 삭제됨: ${delResult.rowCount}개 행`);

    // 2. id=6의 service_type 수정 (깨진 한글 -> walking)
    await client.query(`UPDATE guide_prices SET service_type = 'walking' WHERE id = 6`);
    console.log('id=6 service_type 수정 완료');

    // 3. 결과 확인
    const result = await client.query('SELECT id, service_type, service_name FROM guide_prices ORDER BY id');
    console.log('\n현재 데이터:');
    result.rows.forEach(r => console.log(`  ${r.id}: ${r.service_type} - ${r.service_name}`));

    console.log('\n✅ 완료!');

  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

main();
