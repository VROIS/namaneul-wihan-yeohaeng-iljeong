/**
 * 모든 테이블 한글 상태 점검
 */

const { Client } = require('pg');
require('dotenv').config();

async function checkAllTables() {
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  
  try {
    await client.connect();
    console.log('DB connected\n');
    console.log('='.repeat(70));
    console.log('ALL TABLES KOREAN STATUS CHECK');
    console.log('='.repeat(70));
    
    // 1. cities
    console.log('\n[1] CITIES TABLE');
    console.log('-'.repeat(50));
    const cities = await client.query('SELECT id, name, country FROM cities ORDER BY id LIMIT 50');
    cities.rows.forEach(r => {
      const broken = hasBrokenKorean(r.name) || hasBrokenKorean(r.country);
      console.log((broken ? 'X ' : '  ') + '[' + r.id + '] ' + r.name + ', ' + r.country);
    });
    console.log('Total: ' + cities.rows.length);
    
    // 2. places
    console.log('\n[2] PLACES TABLE');
    console.log('-'.repeat(50));
    const places = await client.query('SELECT id, name FROM places ORDER BY id LIMIT 50');
    places.rows.forEach(r => {
      const broken = hasBrokenKorean(r.name);
      console.log((broken ? 'X ' : '  ') + '[' + r.id + '] ' + r.name);
    });
    console.log('Total: ' + places.rows.length);
    
    // 3. youtube_channels
    console.log('\n[3] YOUTUBE_CHANNELS TABLE');
    console.log('-'.repeat(50));
    const ytChannels = await client.query('SELECT id, channel_id, channel_name FROM youtube_channels ORDER BY id LIMIT 50');
    ytChannels.rows.forEach(r => {
      const broken = hasBrokenKorean(r.channel_name);
      console.log((broken ? 'X ' : '  ') + '[' + r.id + '] ' + r.channel_name + ' (' + r.channel_id + ')');
    });
    console.log('Total: ' + ytChannels.rows.length);
    
    // 4. instagram_hashtags
    console.log('\n[4] INSTAGRAM_HASHTAGS TABLE');
    console.log('-'.repeat(50));
    const igHashtags = await client.query('SELECT id, hashtag FROM instagram_hashtags ORDER BY id LIMIT 50');
    igHashtags.rows.forEach(r => {
      const broken = hasBrokenKorean(r.hashtag);
      console.log((broken ? 'X ' : '  ') + '[' + r.id + '] ' + r.hashtag);
    });
    console.log('Total: ' + igHashtags.rows.length);
    
    // 5. blog_sources
    console.log('\n[5] BLOG_SOURCES TABLE');
    console.log('-'.repeat(50));
    const blogs = await client.query('SELECT id, source_name, platform, source_url FROM blog_sources ORDER BY id LIMIT 50');
    blogs.rows.forEach(r => {
      const broken = hasBrokenKorean(r.source_name);
      console.log((broken ? 'X ' : '  ') + '[' + r.id + '] ' + r.source_name + ' (' + r.platform + ')');
    });
    console.log('Total: ' + blogs.rows.length);
    
    // 6. naver_blog_posts
    console.log('\n[6] NAVER_BLOG_POSTS TABLE (sample)');
    console.log('-'.repeat(50));
    const naverPosts = await client.query('SELECT id, title, author FROM naver_blog_posts ORDER BY id LIMIT 20');
    naverPosts.rows.forEach(r => {
      const broken = hasBrokenKorean(r.title);
      console.log((broken ? 'X ' : '  ') + '[' + r.id + '] ' + (r.title || '').substring(0, 40) + '...');
    });
    const naverCount = await client.query('SELECT COUNT(*) as cnt FROM naver_blog_posts');
    console.log('Total: ' + naverCount.rows[0].cnt);
    
    // 7. youtube_videos
    console.log('\n[7] YOUTUBE_VIDEOS TABLE (sample)');
    console.log('-'.repeat(50));
    const ytVideos = await client.query('SELECT id, title FROM youtube_videos ORDER BY id LIMIT 20');
    ytVideos.rows.forEach(r => {
      const broken = hasBrokenKorean(r.title);
      console.log((broken ? 'X ' : '  ') + '[' + r.id + '] ' + (r.title || '').substring(0, 50) + '...');
    });
    const ytCount = await client.query('SELECT COUNT(*) as cnt FROM youtube_videos');
    console.log('Total: ' + ytCount.rows[0].cnt);
    
    // Summary
    console.log('\n' + '='.repeat(70));
    console.log('SUMMARY - Broken Korean Check');
    console.log('='.repeat(70));
    
    const brokenCities = cities.rows.filter(r => hasBrokenKorean(r.name) || hasBrokenKorean(r.country)).length;
    const brokenPlaces = places.rows.filter(r => hasBrokenKorean(r.name)).length;
    const brokenYT = ytChannels.rows.filter(r => hasBrokenKorean(r.channel_name)).length;
    const brokenIG = igHashtags.rows.filter(r => hasBrokenKorean(r.hashtag)).length;
    const brokenBlogs = blogs.rows.filter(r => hasBrokenKorean(r.source_name)).length;
    const brokenNaver = naverPosts.rows.filter(r => hasBrokenKorean(r.title)).length;
    const brokenVideos = ytVideos.rows.filter(r => hasBrokenKorean(r.title)).length;
    
    console.log('cities: ' + brokenCities + ' broken / ' + cities.rows.length + ' total');
    console.log('places: ' + brokenPlaces + ' broken / ' + places.rows.length + ' total');
    console.log('youtube_channels: ' + brokenYT + ' broken / ' + ytChannels.rows.length + ' total');
    console.log('instagram_hashtags: ' + brokenIG + ' broken / ' + igHashtags.rows.length + ' total');
    console.log('blog_sources: ' + brokenBlogs + ' broken / ' + blogs.rows.length + ' total');
    console.log('naver_blog_posts: ' + brokenNaver + ' broken / ' + naverPosts.rows.length + ' sample');
    console.log('youtube_videos: ' + brokenVideos + ' broken / ' + ytVideos.rows.length + ' sample');
    
  } catch (error) {
    console.error('Error:', error.message);
  } finally {
    await client.end();
  }
}

function hasBrokenKorean(str) {
  if (!str) return false;
  // Check for common broken UTF-8 patterns
  return /[ÃìíëÂ]/.test(str) || /Ã/.test(str);
}

checkAllTables();
