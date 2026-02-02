/**
 * itineraries 테이블에 video 관련 컬럼 추가
 */
require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function addVideoColumns() {
  const client = await pool.connect();
  try {
    console.log('🔗 Supabase 연결 성공');
    
    // 컬럼 존재 여부 확인
    const checkResult = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'itineraries' 
      AND column_name IN ('video_task_id', 'video_status', 'video_url')
    `);
    
    const existingColumns = checkResult.rows.map(r => r.column_name);
    console.log('📋 기존 컬럼:', existingColumns.length > 0 ? existingColumns.join(', ') : '없음');
    
    // 없는 컬럼만 추가
    if (!existingColumns.includes('video_task_id')) {
      await client.query('ALTER TABLE itineraries ADD COLUMN video_task_id TEXT');
      console.log('✅ video_task_id 컬럼 추가 완료');
    } else {
      console.log('⏭️ video_task_id 컬럼 이미 존재');
    }
    
    if (!existingColumns.includes('video_status')) {
      await client.query('ALTER TABLE itineraries ADD COLUMN video_status TEXT');
      console.log('✅ video_status 컬럼 추가 완료');
    } else {
      console.log('⏭️ video_status 컬럼 이미 존재');
    }
    
    if (!existingColumns.includes('video_url')) {
      await client.query('ALTER TABLE itineraries ADD COLUMN video_url TEXT');
      console.log('✅ video_url 컬럼 추가 완료');
    } else {
      console.log('⏭️ video_url 컬럼 이미 존재');
    }
    
    console.log('🎉 마이그레이션 완료!');
  } catch (err) {
    console.error('❌ 오류:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

addVideoColumns();
