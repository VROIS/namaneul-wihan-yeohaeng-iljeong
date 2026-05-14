import fs from 'fs';
import pg from 'pg';
async function main() {
  const env = fs.readFileSync('.env', 'utf-8').replace(/^﻿/, '');
  for (const line of env.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) {
      let v = m[2].trim();
      if (/^['"]/.test(v)) v = v.slice(1, -1);
      process.env[m[1]] = v;
    }
  }
  const c = new pg.Client({ connectionString: process.env.SUPA_URL || process.env.SUPABASE_DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const keys = await c.query(`SELECT key_name, key_value FROM api_keys WHERE is_active=true`);
  for (const r of keys.rows) if (!process.env[r.key_name]) process.env[r.key_name] = r.key_value;
  await c.end();
  const { runPipeline } = await import('../server/services/agents/orchestrator.js');
  const result = await runPipeline({
    destination: 'Paris',
    destinationCoords: { lat: 48.8566, lng: 2.3522 },
    startDate: '2026-06-01', endDate: '2026-06-03',
    startTime: '10:00', endTime: '21:00',
    vibes: ['Foodie', 'Healing', 'Culture'],
    travelPace: 'Normal', travelStyle: 'Reasonable',
    mobilityStyle: 'Walking', companionType: 'Couple',
    companionCount: 2, curationFocus: 'Everyone',
    birthDate: '1990-01-01', companionAges: '30s', language: 'ko',
  } as any);
  fs.writeFileSync('docs/changed-2026-05-06/paris-debug.json', JSON.stringify(result, null, 2));
  console.log('saved');
}
main().catch(e => { console.error(e); process.exit(1); });
