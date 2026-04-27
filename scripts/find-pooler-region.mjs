// 모든 pooler region 시도 → tenant 매칭 region 찾기
import 'dotenv/config';
import pg from 'pg';

const RAW = process.env.DATABASE_URL || '';
const m = RAW.match(/postgresql:\/\/postgres:([^@]+)@db\.([^.]+)\.supabase\.co:5432/);
if (!m) { console.error('parse fail'); process.exit(1); }
const [, pwd, ref] = m;

const regions = [
  'eu-west-3','eu-west-2','eu-west-1','eu-central-1','eu-north-1',
  'us-east-1','us-east-2','us-west-1','us-west-2',
  'ap-northeast-1','ap-northeast-2','ap-south-1','ap-southeast-1','ap-southeast-2',
  'sa-east-1','ca-central-1'
];

for (const r of regions) {
  const url = `postgresql://postgres.${ref}:${encodeURIComponent(pwd)}@aws-0-${r}.pooler.supabase.com:6543/postgres`;
  const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  try {
    await c.connect();
    const rs = await c.query('SELECT current_database() AS db');
    await c.end();
    console.log(`✅ ${r} = OK / db=${rs.rows[0].db}`);
    console.log(`POOLER_URL=${url.replace(/:([^:@]+)@/, ':***@')}`);
    process.exit(0);
  } catch (e) {
    console.log(`❌ ${r}: ${e.code || e.message.slice(0, 60)}`);
    try { await c.end(); } catch {}
  }
}
console.error('모든 region 실패');
process.exit(1);
