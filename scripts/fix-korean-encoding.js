// 한글 인코딩 깨진 데이터 수정 스크립트
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
require('dotenv').config();

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('DATABASE_URL이 설정되지 않았습니다.');
  process.exit(1);
}

async function fixEncodingWithSQL() {
  
  const pool = new Pool({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log('📦 exports 파일에서 데이터 로드 중...');
    
    // YouTube 채널 데이터 로드
    const youtubeData = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'exports/youtube_channels.json'), 'utf8')
    );
    
    // 블로그 소스 데이터 로드
    const blogData = JSON.parse(
      fs.readFileSync(path.join(process.cwd(), 'exports/blog_sources.json'), 'utf8')
    );

    console.log(`✅ YouTube 채널: ${youtubeData.length}개`);
    console.log(`✅ 블로그 소스: ${blogData.length}개`);

    // 기존 데이터 삭제 후 재삽입
    console.log('\n🗑️ 기존 깨진 데이터 삭제 중...');
    await pool.query('DELETE FROM youtube_channels');
    await pool.query('DELETE FROM blog_sources');

    console.log('\n📝 올바른 한글 데이터 삽입 중...');

    // YouTube 채널 삽입
    for (const channel of youtubeData) {
      await pool.query(`
        INSERT INTO youtube_channels (
          id, channel_id, channel_name, channel_url, thumbnail_url,
          subscriber_count, video_count, category, trust_weight, is_active,
          last_video_sync_at, total_videos_synced, total_places_mentioned,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
      `, [
        channel.id, channel.channel_id, channel.channel_name, channel.channel_url,
        channel.thumbnail_url, channel.subscriber_count, channel.video_count,
        channel.category, channel.trust_weight, channel.is_active,
        channel.last_video_sync_at, channel.total_videos_synced, 
        channel.total_places_mentioned, channel.created_at, channel.updated_at
      ]);
    }
    console.log(`  ✅ YouTube 채널 ${youtubeData.length}개 삽입 완료`);

    // 블로그 소스 삽입
    for (const blog of blogData) {
      await pool.query(`
        INSERT INTO blog_sources (
          id, platform, source_name, source_url, author_name, category,
          language, trust_weight, is_active, last_sync_at, total_posts_synced,
          created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      `, [
        blog.id, blog.platform, blog.source_name, blog.source_url,
        blog.author_name, blog.category, blog.language, blog.trust_weight,
        blog.is_active, blog.last_sync_at, blog.total_posts_synced,
        blog.created_at, blog.updated_at
      ]);
    }
    console.log(`  ✅ 블로그 소스 ${blogData.length}개 삽입 완료`);

    // 시퀀스 재설정
    const maxYoutubeId = Math.max(...youtubeData.map(c => c.id));
    const maxBlogId = Math.max(...blogData.map(b => b.id));
    
    await pool.query(`SELECT setval('youtube_channels_id_seq', $1, true)`, [maxYoutubeId]);
    await pool.query(`SELECT setval('blog_sources_id_seq', $1, true)`, [maxBlogId]);

    console.log('\n🎉 한글 인코딩 수정 완료!');
    console.log('   관리자 대시보드를 새로고침하세요: http://localhost:5000/admin');

  } catch (error) {
    console.error('❌ 오류:', error.message);
  } finally {
    await pool.end();
  }
}

fixEncodingWithSQL();
