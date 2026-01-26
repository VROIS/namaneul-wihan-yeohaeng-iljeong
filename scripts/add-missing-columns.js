/**
 * DB에 누락된 컬럼 추가 스크립트
 * birth_date 등 schema.ts에 정의되어 있지만 실제 DB에 없는 컬럼 추가
 */

import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/nubi'
});

async function addMissingColumns() {
  const client = await pool.connect();
  
  try {
    console.log('🔧 누락된 컬럼 추가 시작...\n');

    // users 테이블에 birth_date 컬럼 추가
    const columnsToAdd = [
      { table: 'users', column: 'birth_date', type: 'TEXT' },
      { table: 'users', column: 'preferred_vibes', type: 'JSONB DEFAULT \'[]\'::jsonb' },
      { table: 'users', column: 'preferred_companion_type', type: 'TEXT' },
      { table: 'users', column: 'preferred_travel_style', type: 'TEXT' },
      { table: 'users', column: 'marketing_consent', type: 'BOOLEAN DEFAULT false' },
      { table: 'itineraries', column: 'user_birth_date', type: 'TEXT' },
      { table: 'itineraries', column: 'user_gender', type: 'TEXT' },
    ];

    for (const { table, column, type } of columnsToAdd) {
      try {
        await client.query(`ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS ${column} ${type}`);
        console.log(`✅ ${table}.${column} 추가됨`);
      } catch (err) {
        if (err.code === '42701') {
          console.log(`⏭️ ${table}.${column} 이미 존재`);
        } else {
          console.error(`❌ ${table}.${column} 추가 실패:`, err.message);
        }
      }
    }

    console.log('\n✅ 완료!');
    
  } finally {
    client.release();
    await pool.end();
  }
}

addMissingColumns().catch(console.error);
