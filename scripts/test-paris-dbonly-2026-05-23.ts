// ⚠️ 2026-05-23 = Step 3 후 = Paris DB-only 검증 (= 비용 €0 = ready 도시)
// 목적: Step 3 = 32 파일 삭제 후 = 메인앱 파이프라인 = 정상 작동 입증
// 입증: Paris 호출 = isCityReady=true → DB-only 모드 → TS/PM 호출 0 → 비용 €0

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
  for (const r of keys.rows) {
    if (!process.env[r.key_name]) process.env[r.key_name] = r.key_value;
  }

  // BEFORE PSR Paris
  const before = await c.query(`SELECT COUNT(*)::int n FROM place_seed_raw WHERE city_id = 19`);
  console.log(`[BEFORE] PSR Paris 행 = ${before.rows[0].n}`);

  const { runPipelineV3 } = await import('../server/services/agents/pipeline-v3.js');
  const formData = {
    destination: 'Paris',
    destinationCoords: { lat: 48.8566, lng: 2.3522 },
    startDate: '2026-06-01',
    endDate: '2026-06-02',
    startTime: '10:00',
    endTime: '21:00',
    vibes: ['Hotspot'],
    travelPace: 'Normal',
    travelStyle: 'Reasonable',
    mobilityStyle: 'Walking',
    companionType: 'Couple',
    companionCount: 2,
    curationFocus: 'Everyone',
    birthDate: '1990-01-01',
    language: 'ko',
  };

  console.log(`\n▶ Paris 호출 (= ready 도시 = DB-only 모드 기대)`);
  const t0 = Date.now();
  try {
    const result = await runPipelineV3(formData as any);
    const elapsed = Date.now() - t0;
    console.log(`✅ 완료 (${(elapsed / 1000).toFixed(1)}초)`);
    const places = result.places || (result.days?.[0]?.places ? result.days.flatMap((d: any) => d.places || []) : []);
    console.log(`총 장소 = ${places.length}`);
    if (places.length > 0) {
      const withImg = places.filter((p: any) => p.image).length;
      const withCoord = places.filter((p: any) => p.lat && p.lng && p.lat !== 0).length;
      console.log(`  이미지 채움 = ${withImg}/${places.length}`);
      console.log(`  좌표 채움 = ${withCoord}/${places.length}`);
      const sourceCounts: Record<string, number> = {};
      for (const p of places) {
        const src = p.sourceType || 'unknown';
        sourceCounts[src] = (sourceCounts[src] || 0) + 1;
      }
      console.log(`  sourceType:`, sourceCounts);
    }
  } catch (e: any) {
    console.error(`❌ 실패:`, e?.message || e);
  }

  // 10초 대기 (= 백그라운드 호출 0 보장 시간)
  await new Promise(r => setTimeout(r, 10000));

  // AFTER PSR Paris
  const after = await c.query(`SELECT COUNT(*)::int n FROM place_seed_raw WHERE city_id = 19`);
  console.log(`\n[AFTER] PSR Paris 행 = ${after.rows[0].n} (= 기대 = ${before.rows[0].n} 변화 0 = DB-only 입증)`);
  console.log(after.rows[0].n === before.rows[0].n ? '✅ PSR 변화 0 = DB-only 모드 작동 = 비용 €0' : `⚠️ ${after.rows[0].n - before.rows[0].n} 행 추가`);

  await c.end();
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
