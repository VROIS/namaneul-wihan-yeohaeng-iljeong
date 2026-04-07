// P0: 배포본 Neon DB → Supabase 데이터 이전
const { Client } = require('pg');

const PROD_URL = 'postgresql://neondb_owner:npg_Q1oAhm6WuEHC@ep-billowing-frost-a6vwrbu1.us-west-2.aws.neon.tech:5432/neondb?sslmode=require';
const SUPA_URL = 'postgresql://postgres:Vrois%4075015@db.wxebceflvuythuodemro.supabase.co:5432/postgres';

async function migrate(src, dst, name, query, insertFn) {
  const { rows } = await src.query(query);
  if (!rows.length) { console.log(`SKIP: ${name} (0건)`); return 0; }
  let ok = 0, fail = 0;
  for (const r of rows) {
    try { await insertFn(dst, r); ok++; }
    catch(e) {
      if (e.message.includes('duplicate')) ok++;
      else { fail++; if (fail <= 3) console.log(`  ERR ${name}: ${e.message.substring(0,80)}`); }
    }
  }
  console.log(`OK: ${name} — ${ok}건 (${fail}건 실패)`);
  return ok;
}

async function run() {
  const src = new Client({ connectionString: PROD_URL });
  const dst = new Client({ connectionString: SUPA_URL });
  await src.connect();
  await dst.connect();

  // 1. users (65명 → nubi 27명과 병합)
  await migrate(src, dst, 'users (65)',
    'SELECT * FROM users',
    async (db, r) => {
      await db.query(`
        INSERT INTO users (id, username, password, display_name, preferred_language,
          email, profile_image_url, provider, location_enabled, ai_content_enabled,
          credits, is_admin, referred_by, referral_code, subscription_status,
          subscription_canceled_at, account_status, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
        ON CONFLICT (id) DO UPDATE SET
          email = COALESCE(EXCLUDED.email, users.email),
          credits = GREATEST(EXCLUDED.credits, users.credits),
          is_admin = EXCLUDED.is_admin OR users.is_admin,
          profile_image_url = COALESCE(EXCLUDED.profile_image_url, users.profile_image_url),
          provider = COALESCE(EXCLUDED.provider, users.provider),
          referral_code = COALESCE(EXCLUDED.referral_code, users.referral_code),
          updated_at = COALESCE(EXCLUDED.updated_at, CURRENT_TIMESTAMP)
      `, [
        r.id,
        r.email || r.id,
        'guide_prod',
        [r.first_name, r.last_name].filter(Boolean).join(' ') || null,
        r.preferred_language || 'ko',
        r.email,
        r.profile_image_url,
        r.provider,
        r.location_enabled,
        r.ai_content_enabled,
        r.credits || 0,
        r.is_admin || false,
        r.referred_by,
        r.referral_code,
        r.subscription_status || 'active',
        r.subscription_canceled_at,
        r.account_status || 'active',
        r.created_at,
        r.updated_at
      ]);
    }
  );

  // 2. guides (207건)
  await migrate(src, dst, 'guides (207)',
    'SELECT * FROM guides',
    async (db, r) => {
      await db.query(`
        INSERT INTO guides (id, local_id, user_id, title, description, image_url,
          latitude, longitude, location_name, ai_generated_content, tags,
          view_count, language, voice_lang, voice_name, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
        ON CONFLICT (id) DO NOTHING
      `, [r.id, r.local_id, r.user_id, r.title, r.description, r.image_url,
          r.latitude, r.longitude, r.location_name, r.ai_generated_content, r.tags,
          r.view_count, r.language, r.voice_lang, r.voice_name, r.created_at, r.updated_at]);
    }
  );

  // 3. shared_html_pages (15건)
  await migrate(src, dst, 'shared_html_pages (15)',
    'SELECT * FROM shared_html_pages',
    async (db, r) => {
      await db.query(`
        INSERT INTO shared_html_pages (id, user_id, name, html_content, html_file_path,
          template_version, guide_ids, thumbnail, sender, location, date,
          featured, featured_order, download_count, is_active, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
        ON CONFLICT (id) DO NOTHING
      `, [r.id, r.user_id, r.name, r.html_content, r.html_file_path,
          r.template_version, r.guide_ids, r.thumbnail, r.sender, r.location, r.date,
          r.featured, r.featured_order, r.download_count, r.is_active, r.created_at, r.updated_at]);
    }
  );

  // 4. credit_transactions (121건)
  await migrate(src, dst, 'credit_transactions (121)',
    'SELECT * FROM credit_transactions',
    async (db, r) => {
      await db.query(`
        INSERT INTO credit_transactions (id, user_id, type, amount, description, reference_id, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING
      `, [r.id, r.user_id, r.type, r.amount, r.description, r.reference_id, r.created_at]);
    }
  );

  // 5. api_logs (271건)
  await migrate(src, dst, 'api_logs (271)',
    'SELECT * FROM api_logs',
    async (db, r) => {
      await db.query(`
        INSERT INTO api_logs (id, type, user_id, response_time, tokens_used, estimated_cost, status_code, error_message, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO NOTHING
      `, [r.id, r.type, r.user_id, r.response_time, r.tokens_used, r.estimated_cost, r.status_code, r.error_message, r.created_at]);
    }
  );

  // 6. notifications (33건)
  await migrate(src, dst, 'notifications (33)',
    'SELECT * FROM notifications',
    async (db, r) => {
      await db.query(`
        INSERT INTO notifications (id, user_id, type, title, message, icon, link, is_read, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO NOTHING
      `, [r.id, r.user_id, r.type, r.title, r.message, r.icon, r.link, r.is_read, r.created_at]);
    }
  );

  // 7. prompts (18건)
  await migrate(src, dst, 'prompts (18)',
    'SELECT * FROM prompts',
    async (db, r) => {
      await db.query(`
        INSERT INTO prompts (id, language, type, content, is_active, version, created_by, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING
      `, [r.id, r.language, r.type, r.content, r.is_active, r.version, r.created_by, r.created_at]);
    }
  );

  // 8. user_activity_logs (1544건)
  await migrate(src, dst, 'user_activity_logs (1544)',
    'SELECT * FROM user_activity_logs',
    async (db, r) => {
      await db.query(`
        INSERT INTO user_activity_logs (id, user_id, session_id, device_type, browser, user_agent, session_duration, page_views, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO NOTHING
      `, [r.id, r.user_id, r.session_id, r.device_type, r.browser, r.user_agent, r.session_duration, r.page_views, r.created_at]);
    }
  );

  // 9. push_subscriptions (2건)
  await migrate(src, dst, 'push_subscriptions (2)',
    'SELECT * FROM push_subscriptions',
    async (db, r) => {
      await db.query(`
        INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, user_agent, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (id) DO NOTHING
      `, [r.id, r.user_id, r.endpoint, r.p256dh, r.auth, r.user_agent, r.created_at]);
    }
  );

  // 검증
  const verify = await dst.query(`
    SELECT 'users' as t, count(*) as c FROM users
    UNION ALL SELECT 'guides', count(*) FROM guides
    UNION ALL SELECT 'shared_html_pages', count(*) FROM shared_html_pages
    UNION ALL SELECT 'credit_transactions', count(*) FROM credit_transactions
    UNION ALL SELECT 'api_logs', count(*) FROM api_logs
    UNION ALL SELECT 'notifications', count(*) FROM notifications
    UNION ALL SELECT 'user_activity_logs', count(*) FROM user_activity_logs
    UNION ALL SELECT 'prompts', count(*) FROM prompts
    ORDER BY t
  `);
  console.log('\n=== Supabase 최종 현황 ===');
  verify.rows.forEach(r => console.log(`${r.t}: ${r.c}건`));

  await src.end();
  await dst.end();
  console.log('\nProd migration done!');
}

run().catch(e => console.error(e));
