// baseline 측정 = 코드 변경 X 상태에서 = 메인앱 여정 생성 결과 캡처
// 도시 1: Paris (= 발굴 끝, 우리 DB 풍부)
// 도시 2: Nice (= 미발굴, Google fallback 의존)
// 결과 = JSON 저장 + 매칭 통계 + 식당 분석

import fs from 'fs';
import pg from 'pg';

async function main() {
// 1. .env 로드
const env = fs.readFileSync('.env', 'utf-8').replace(/^﻿/, '');
for (const line of env.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) {
    let v = m[2].trim();
    if (/^['"]/.test(v)) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}

// 2. DB 에서 API key 로드 → process.env 주입
const c = new pg.Client({
  connectionString: process.env.SUPA_URL || process.env.SUPABASE_DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});
await c.connect();
const keys = await c.query(`SELECT key_name, key_value FROM api_keys WHERE is_active=true`);
for (const r of keys.rows) {
  if (!process.env[r.key_name]) process.env[r.key_name] = r.key_value;
}
console.log(`✅ API keys 주입: ${keys.rows.map((r: any) => r.key_name).join(', ')}`);

// 3. orchestrator 동적 import (= env 주입 후)
const { runPipeline } = await import('../server/services/agents/orchestrator.js');

// 4. 도시별 테스트
const TEST_CASES = [
  {
    label: 'Paris (= 발굴 도시)',
    formData: {
      destination: 'Paris',
      destinationCoords: { lat: 48.8566, lng: 2.3522 },
      startDate: '2026-06-01',
      endDate: '2026-06-03',
      startTime: '10:00',
      endTime: '21:00',
      vibes: ['Foodie', 'Healing', 'Culture'],
      travelPace: 'Normal',
      travelStyle: 'Reasonable',
      mobilityStyle: 'Walking',
      companionType: 'Couple',
      companionCount: 2,
      curationFocus: 'Everyone',
      birthDate: '1990-01-01',
      companionAges: '30s',
      language: 'ko',
    },
  },
  {
    label: 'Geneva (= 미발굴 = 스위스)',
    formData: {
      destination: 'Geneva',
      destinationCoords: { lat: 46.2044, lng: 6.1432 },
      startDate: '2026-06-01',
      endDate: '2026-06-03',
      startTime: '10:00',
      endTime: '21:00',
      vibes: ['Foodie', 'Healing', 'Culture'],
      travelPace: 'Normal',
      travelStyle: 'Reasonable',
      mobilityStyle: 'Walking',
      companionType: 'Couple',
      companionCount: 2,
      curationFocus: 'Everyone',
      birthDate: '1990-01-01',
      companionAges: '30s',
      language: 'ko',
    },
  },
];

// 출력 디렉터리 = 명령행 인자 OR 기본 baseline
const argLabel = process.argv[2] || 'baseline';
const outDir = `docs/${argLabel}-` + new Date().toISOString().slice(0, 10);
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

const summary: any[] = [];

for (const tc of TEST_CASES) {
  console.log('\n' + '='.repeat(60));
  console.log(`▶ ${tc.label}`);
  console.log('='.repeat(60));

  const t0 = Date.now();
  try {
    const result = await runPipeline(tc.formData as any);
    const elapsed = Date.now() - t0;

    // 저장
    const safeName = tc.formData.destination.toLowerCase().replace(/[^a-z]/g, '_');
    const filePath = `${outDir}/${safeName}-baseline.json`;
    fs.writeFileSync(filePath, JSON.stringify(result, null, 2));
    console.log(`✅ 저장: ${filePath}`);

    // 분석
    const places = result.places || [];
    const total = places.length;
    const restaurants = places.filter((p: any) => p.tags?.includes('restaurant') || p.tags?.includes('food'));
    const restaurantCount = restaurants.length;

    const sourceCounts: Record<string, number> = {};
    for (const p of places) {
      const src = p.sourceType || 'unknown';
      sourceCounts[src] = (sourceCounts[src] || 0) + 1;
    }

    const validCoords = places.filter((p: any) => p.lat && p.lng && p.lat !== 0).length;
    const withImage = places.filter((p: any) => p.image && p.image.length > 0).length;

    const restaurantWithImage = restaurants.filter((p: any) => p.image && p.image.length > 0).length;
    const restaurantWithCoords = restaurants.filter((p: any) => p.lat && p.lng && p.lat !== 0).length;

    const stat = {
      label: tc.label,
      destination: tc.formData.destination,
      elapsed_ms: elapsed,
      total_places: total,
      restaurant_count: restaurantCount,
      activity_count: total - restaurantCount,
      with_valid_coords: `${validCoords}/${total}`,
      with_image: `${withImage}/${total}`,
      restaurant_with_image: `${restaurantWithImage}/${restaurantCount}`,
      restaurant_with_coords: `${restaurantWithCoords}/${restaurantCount}`,
      source_breakdown: sourceCounts,
      file: filePath,
    };

    summary.push(stat);
    console.log('통계:', JSON.stringify(stat, null, 2));
  } catch (e: any) {
    console.error(`❌ ${tc.label} 실패:`, e.message);
    summary.push({ label: tc.label, error: e.message });
  }
}

// 최종 보고서
console.log('\n' + '='.repeat(60));
console.log('📊 BASELINE 요약');
console.log('='.repeat(60));
console.table(summary);

fs.writeFileSync(`${outDir}/summary.json`, JSON.stringify(summary, null, 2));
console.log(`✅ 요약: ${outDir}/summary.json`);

// 백그라운드 saveNewPlacesToDB (= setTimeout 100ms) 가 완료되기 까지 대기
console.log('⏳ 백그라운드 자동 저장 대기 (5 초)...');
await new Promise(r => setTimeout(r, 5000));
console.log('✅ 자동 저장 완료');

await c.end();
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
