// ⚠️ 수정금지(승인필요) 2026-06-02 = 외곽 TS풀 이미지(PhotoMedia) = 최후 단계 = 지역별 fill-to-10 만
// = 지역 편중 방지 = 명소별 (eco≤4 + premium≤2 + 나머지 reason 채움) = 10곳/명소 (소도시는 있는 만큼)
// = 발굴 raw(12-ts-discover)의 photo_name 재사용 → PhotoMedia → Storage → image_url UPDATE (= TS 추가호출 0)
// 호출:
//   npx tsx .../12-ts-discover-pool/image-pool.ts --city-id=19 --date=2026-06-02 [--target=10] [--apply]
//   (--apply 없으면 = dry-run = 대상 목록만, 쓰기·PM 0)
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';  // ⚠️ 수정금지(승인필요) — raw 파일명 표준+버전순번 정합(2026-06-16 SSOT, 1번 누락분) = latestVersionedByBase 동적 import 용 pathToFileURL 추가
import { DISCOVERY_ZONES } from './destinations';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../../../..');
process.chdir(ROOT);
const envRaw = fs.readFileSync('.env', 'utf-8').replace(/^﻿/, '');
for (const line of envRaw.split(/\r?\n/)) { const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m && !process.env[m[1]]) { let v = m[2].trim(); if (/^['"]/.test(v)) v = v.slice(1, -1); process.env[m[1]] = v; } }
const argv = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? 'true']));
const cityId = Number(argv['city-id'] || 0);
const date = String(argv['date'] || new Date().toISOString().slice(0, 10));
const zone = String(argv['zone'] || 'outskirt');
const TARGET = Number(argv['target'] || 10);
// ⚠️ 수정금지(승인필요) 2026-06-02 = 시내(downtown) = 가격대별 RC 상위 quota (= FE 노출분만 PM = 사용자 SSOT). 외곽은 명소별 fill-to-target.
const Q = { eco: Number(argv['eco'] || 20), reason: Number(argv['reason'] || 40), premium: Number(argv['premium'] || 20) };
const apply = argv['apply'] === 'true';
const pmLimit = argv['limit'] ? Number(argv['limit']) : null; // = PM 건당 과금 = 소량 먼저 검증용
if (!cityId) { console.error('Usage: --city-id=<N> --date=<YYYY-MM-DD> [--zone=outskirt|downtown] [--target=10] [--eco=20 --reason=40 --premium=20] [--apply]'); process.exit(1); }

const hkm = (a: any, b: any) => {
  const R = 6371, dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
};
const tier = (p: number | null) => p == null ? 'reason' : p <= 24 ? 'eco' : p <= 60 ? 'reason' : 'premium';

(async () => {
  const dests = DISCOVERY_ZONES[cityId]?.[zone];
  if (!dests?.length) { console.error(`city ${cityId} zone '${zone}' config 없음`); process.exit(1); }

  // ⚠️ 2026-06-02 = zone 의 모든 변형 raw(nearby/text/premium/무label) 병합 = photo_name 수집
  const rawDir = path.join(ROOT, 'docs', 'raw', String(cityId));
  // ⚠️ 수정금지(승인필요) — raw 파일명 표준+버전순번 정합(2026-06-16 SSOT, 1번 누락분) = post-process.ts:132(식당모드)와 동일 패턴 = 날짜앞 {date}_12-ts-discover_{zone}(-label) startsWith + latestVersionedByBase 로 base(zone-label)별 최신 _N 1개 축약(중복집계 0)
  const { latestVersionedByBase } = await import(pathToFileURL(path.join(ROOT, 'server/services/shared/raw-filename.ts')).href);
  const rawFiles = latestVersionedByBase(fs.readdirSync(rawDir).filter((f) => f.startsWith(`${date}_12-ts-discover_${zone}`) && f.endsWith('.json')));
  if (!rawFiles.length) { console.error(`✗ ${rawDir}/${date}_12-ts-discover_${zone}*.json 미존재`); process.exit(1); }
  const photoByPid = new Map<string, string>();
  for (const f of rawFiles) { const raw = JSON.parse(fs.readFileSync(path.join(rawDir, f), 'utf-8')); for (const z of raw.zones) for (const p of z.places) if (p.place_id && p.photo_name) photoByPid.set(p.place_id, p.photo_name); }

  const pg = await import('pg');
  const c = new (pg as any).default.Client({ connectionString: process.env.SUPA_URL || process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  // ⚠️ 2026-06-02 = zone 분리 = downtown(시내=core/null) vs outskirt(외곽) = 같은 ts-pool 태그 공유라 day_zone 로 구분
  const dzFilter = zone === 'downtown' ? "(day_zone='core' OR day_zone IS NULL)" : "day_zone='outskirt'";
  const pool = (await c.query(
    `SELECT id, name_en, google_place_id AS pid, latitude AS lat, longitude AS lng, price_eur::float8 AS price, google_review_count AS rc,
            (image_url IS NOT NULL AND image_url<>'') AS has_img
     FROM place_seed_raw
     WHERE city_id=$1 AND seed_category='restaurant' AND 'ts-pool-${date}'=ANY(phase_tags) AND ${dzFilter} AND latitude IS NOT NULL`, [cityId])).rows;

  // ⚠️ 수정금지(승인필요) 2026-06-02 = 선정 = 시내(가격대별 RC 상위 quota) / 외곽(명소별 fill-to-target) = 둘 다 FE 노출분만 PM
  const selected: any[] = [];
  if (zone === 'downtown') {
    // 시내 = 단일 구역 = 가격대별 RC 내림차순 상위 (eco/reason/premium quota)
    const t: Record<string, any[]> = { eco: [], reason: [], premium: [] };
    for (const p of pool) t[tier(p.price)].push(p);
    for (const k of Object.keys(t)) t[k].sort((a, b) => (b.rc || 0) - (a.rc || 0));
    selected.push(...t.eco.slice(0, Q.eco), ...t.reason.slice(0, Q.reason), ...t.premium.slice(0, Q.premium));
    console.log(`═══ image-pool (city=${cityId}, zone=downtown, quota eco${Q.eco}/reason${Q.reason}/premium${Q.premium}) ═══`);
    for (const k of ['eco', 'reason', 'premium']) {
      const sel = selected.filter((p) => tier(p.price) === k);
      console.log(`  ${k}: 후보 ${t[k].length} → 선정 상위 ${sel.length}/${(Q as any)[k]} (이미지필요 ${sel.filter((p) => !p.has_img && photoByPid.has(p.pid)).length})`);
    }
  } else {
    // 외곽 = 명소별 (eco≤4 + premium≤2 + reason 채움) = TARGET/명소
    for (const p of pool) p._dest = dests.reduce((best: any, d: any) => {
      const dist = hkm(d, p); return dist < best.dist ? { name: d.name, dist } : best;
    }, { name: '', dist: Infinity }).name;
    const byDest: Record<string, any[]> = {};
    for (const p of pool) (byDest[p._dest] ||= []).push(p);
    for (const [d, arr] of Object.entries(byDest)) {
      const t: Record<string, any[]> = { eco: [], reason: [], premium: [] };
      for (const p of arr) t[tier(p.price)].push(p);
      for (const k of Object.keys(t)) t[k].sort((a, b) => (b.rc || 0) - (a.rc || 0));
      const eco = t.eco.slice(0, 4), prem = t.premium.slice(0, 2);
      const reason = t.reason.slice(0, Math.max(0, TARGET - eco.length - prem.length));
      [...eco, ...prem, ...reason].forEach((p) => { p._destFinal = d; selected.push(p); });
    }
    console.log(`═══ image-pool (city=${cityId}, zone=outskirt, target=${TARGET}/명소) ═══`);
    for (const [d, arr] of Object.entries(byDest)) {
      const sel = selected.filter((p) => p._destFinal === d);
      console.log(`  ${d}: 배정 ${arr.length} → 선정 ${sel.length} (이미지필요 ${sel.filter((p) => !p.has_img && photoByPid.has(p.pid)).length})`);
    }
  }
  const needPm = selected.filter((p) => !p.has_img && photoByPid.has(p.pid));
  const noPhoto = selected.filter((p) => !p.has_img && !photoByPid.has(p.pid));
  console.log(`\n선정 ${selected.length}곳 / PM 필요 ${needPm.length}곳 (€${(needPm.length * 0.007).toFixed(2)}) / 이미 이미지 ${selected.filter((p) => p.has_img).length} / photo_name 없음 ${noPhoto.length}`);

  if (!apply) { console.log(`\n=== DRY-RUN (PM·쓰기 0) === 실행: --apply`); await c.end(); return; }

  // ⚠️ 2026-06-02 = ag3 작동 패턴(PERPIGNAN 22/22) 그대로 = 버킷 place-images + PUT + SUPABASE_ANON_KEY
  // ⚠️ 2026-06-18 사장님 SSOT = 출입증 관문 issue_api_key() 경유 (= 직독 폐기). PM 이미지 = 채움 = 도시 있음 + 행 있음(true).
  // = 출입증(키이름·도시id·날짜·행있음) 검문 통과해야만 키 발급. 미달 = throw = 외부호출 불가.
  const { issueApiKey } = await import(pathToFileURL(path.join(ROOT, 'server/services/shared/issue-api-key.ts')).href);
  const GOOGLE_KEY = await issueApiKey(c, 'GOOGLE_MAPS_API_KEY', cityId, date, true);
  // ⚠️ 2026-06-02 = 로컬 .env = SERVICE_ROLE 만 설정(ANON 미설정) = SERVICE_ROLE 우선 (디버그 입증)
  const SUPA_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || '';
  const SUPA_PUB = process.env.SUPABASE_PUBLIC_URL || 'https://wxebceflvuythuodemro.supabase.co';

  // ⚠️ 동시 10개 다운로드 (= I/O 병렬 = 빠른 확보). DB UPDATE 는 순차(단일 pg 커넥션).
  const pmList = pmLimit ? needPm.slice(0, pmLimit) : needPm;
  console.log(`\n=== APPLY = PM ${pmList.length}곳 (동시 ${10})${pmLimit ? ' [테스트 ' + pmLimit + ']' : ''} ===`);
  let ok = 0, fail = 0;
  const CONC = 10;
  async function dlup(p: any): Promise<{ id: number; url: string } | null> {
    try {
      const pr = await fetch(`https://places.googleapis.com/v1/${photoByPid.get(p.pid)}/media?key=${GOOGLE_KEY}&maxHeightPx=800&maxWidthPx=1200`, { signal: AbortSignal.timeout(30000) });
      if (!pr.ok) return null;
      const binary = Buffer.from(await pr.arrayBuffer());
      const fileName = `${cityId}/restaurant/${p.pid}.jpg`;
      const ur = await fetch(`${SUPA_PUB}/storage/v1/object/place-images/${fileName}`, {
        method: 'PUT', headers: { Authorization: `Bearer ${SUPA_KEY}`, 'Content-Type': 'image/jpeg', 'x-upsert': 'true' }, body: binary,
      });
      if (!ur.ok) return null;
      return { id: p.id, url: `${SUPA_PUB}/storage/v1/object/public/place-images/${fileName}` };
    } catch { return null; }
  }
  for (let i = 0; i < pmList.length; i += CONC) {
    const res = await Promise.all(pmList.slice(i, i + CONC).map(dlup));
    for (const r of res) {
      if (!r) { fail++; continue; }
      await c.query(`UPDATE place_seed_raw SET image_url=$2, image_attribution='Photo via Google Places', image_updated_at=NOW() WHERE id=$1 AND (image_url IS NULL OR image_url='')`, [r.id, r.url]);
      ok++;
    }
    console.log(`  ${Math.min(i + CONC, pmList.length)}/${pmList.length}...`);
  }
  await c.end();
  console.log(`✓ 이미지 ${ok}곳 / 실패 ${fail}`);
})();
