// P0-2/P0-3: Supabase DB 마이그레이션 — 가이드 통합 + bts_event_info
const { Client } = require('pg');

async function run() {
  const client = new Client({
    connectionString: 'postgresql://postgres:Vrois%4075015@db.wxebceflvuythuodemro.supabase.co:5432/postgres'
  });
  await client.connect();

  const queries = [
    ['ALTER users (가이드 컬럼 추가)', `
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS email VARCHAR UNIQUE,
        ADD COLUMN IF NOT EXISTS profile_image_url TEXT,
        ADD COLUMN IF NOT EXISTS location_enabled BOOLEAN DEFAULT TRUE,
        ADD COLUMN IF NOT EXISTS ai_content_enabled BOOLEAN DEFAULT TRUE,
        ADD COLUMN IF NOT EXISTS credits INTEGER DEFAULT 0,
        ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE,
        ADD COLUMN IF NOT EXISTS referred_by VARCHAR,
        ADD COLUMN IF NOT EXISTS referral_code VARCHAR UNIQUE,
        ADD COLUMN IF NOT EXISTS subscription_status VARCHAR DEFAULT 'active',
        ADD COLUMN IF NOT EXISTS subscription_canceled_at TIMESTAMP,
        ADD COLUMN IF NOT EXISTS account_status VARCHAR DEFAULT 'active',
        ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP;
    `],
    ['CREATE guides', `
      CREATE TABLE IF NOT EXISTS guides (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        local_id VARCHAR,
        user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        description TEXT,
        image_url TEXT,
        latitude DECIMAL(10,8),
        longitude DECIMAL(11,8),
        location_name TEXT,
        ai_generated_content TEXT,
        tags TEXT[],
        view_count INTEGER DEFAULT 0,
        language VARCHAR DEFAULT 'ko',
        voice_lang VARCHAR DEFAULT 'ko-KR',
        voice_name VARCHAR,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `],
    ['CREATE share_links', `
      CREATE TABLE IF NOT EXISTS share_links (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        guide_ids TEXT[] NOT NULL,
        include_location BOOLEAN DEFAULT TRUE,
        include_audio BOOLEAN DEFAULT FALSE,
        view_count INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT TRUE,
        featured BOOLEAN DEFAULT FALSE,
        featured_order INTEGER,
        html_file_path TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `],
    ['CREATE credit_transactions', `
      CREATE TABLE IF NOT EXISTS credit_transactions (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type VARCHAR NOT NULL,
        amount INTEGER NOT NULL,
        description TEXT NOT NULL,
        reference_id VARCHAR,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `],
    ['CREATE cashback_requests', `
      CREATE TABLE IF NOT EXISTS cashback_requests (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        credits_amount INTEGER NOT NULL,
        cash_amount INTEGER NOT NULL,
        payment_method VARCHAR NOT NULL,
        payment_info TEXT NOT NULL,
        status VARCHAR NOT NULL DEFAULT 'pending',
        admin_note TEXT,
        processed_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `],
    ['CREATE api_logs', `
      CREATE TABLE IF NOT EXISTS api_logs (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        type VARCHAR NOT NULL,
        user_id VARCHAR REFERENCES users(id) ON DELETE SET NULL,
        response_time INTEGER,
        tokens_used INTEGER,
        estimated_cost DECIMAL(10,6),
        status_code INTEGER,
        error_message TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `],
    ['CREATE user_activity_logs', `
      CREATE TABLE IF NOT EXISTS user_activity_logs (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR REFERENCES users(id) ON DELETE SET NULL,
        session_id VARCHAR,
        device_type VARCHAR,
        browser VARCHAR,
        user_agent TEXT,
        session_duration INTEGER,
        page_views INTEGER DEFAULT 1,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `],
    ['CREATE shared_html_pages', `
      CREATE TABLE IF NOT EXISTS shared_html_pages (
        id VARCHAR PRIMARY KEY,
        user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        html_content TEXT,
        html_file_path TEXT,
        template_version VARCHAR DEFAULT 'v1',
        guide_ids TEXT[] NOT NULL,
        thumbnail TEXT,
        sender TEXT,
        location TEXT,
        date TEXT,
        featured BOOLEAN DEFAULT FALSE,
        featured_order INTEGER,
        download_count INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT TRUE,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `],
    ['CREATE notifications', `
      CREATE TABLE IF NOT EXISTS notifications (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR REFERENCES users(id) ON DELETE CASCADE,
        type VARCHAR NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        icon VARCHAR DEFAULT 'bell',
        link TEXT,
        is_read BOOLEAN DEFAULT FALSE,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `],
    ['CREATE push_subscriptions', `
      CREATE TABLE IF NOT EXISTS push_subscriptions (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        endpoint TEXT NOT NULL,
        p256dh TEXT NOT NULL,
        auth TEXT NOT NULL,
        user_agent TEXT,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `],
    ['CREATE voice_configs', `
      CREATE TABLE IF NOT EXISTS voice_configs (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        lang_code VARCHAR NOT NULL,
        platform VARCHAR NOT NULL,
        voice_priorities TEXT[] NOT NULL,
        exclude_voices TEXT[],
        is_active BOOLEAN DEFAULT TRUE,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `],
    ['CREATE prompts', `
      CREATE TABLE IF NOT EXISTS prompts (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
        language VARCHAR NOT NULL,
        type VARCHAR NOT NULL,
        content TEXT NOT NULL,
        is_active BOOLEAN DEFAULT TRUE,
        version INTEGER DEFAULT 1,
        created_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `],
    ['CREATE bts_event_info', `
      CREATE TABLE IF NOT EXISTS bts_event_info (
        id SERIAL PRIMARY KEY,
        city_id INTEGER REFERENCES cities(id) ON DELETE CASCADE,
        concert_date TEXT NOT NULL,
        concert_end_date TEXT,
        concert_venue TEXT,
        venue_capacity INTEGER,
        fan_zone_location TEXT,
        fan_zone_hours TEXT,
        outdoor_screen_location TEXT,
        merch_pop_up_address TEXT,
        merch_pop_up_hours TEXT,
        live_viewing_cinemas JSONB DEFAULT '[]',
        special_notes TEXT,
        source TEXT,
        verified BOOLEAN DEFAULT FALSE,
        updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `],
  ];

  for (const [name, query] of queries) {
    try {
      await client.query(query);
      console.log('OK:', name);
    } catch (e) {
      console.log('ERR:', name, '-', e.message);
    }
  }

  // 검증: 테이블 수 확인
  const res = await client.query(`
    SELECT count(*) as cnt FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
  `);
  console.log('\nTotal tables:', res.rows[0].cnt);

  await client.end();
  console.log('Migration done!');
}

run().catch(e => console.error(e));
