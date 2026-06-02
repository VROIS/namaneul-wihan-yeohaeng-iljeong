// ⚠️ 수정금지(승인필요) 2026-06-02 = 외곽 TS풀 이미지(PhotoMedia) = 최후 단계 = 지역별 fill-to-10 만
// = 지역 편중 방지 = 명소별 (eco≤4 + premium≤2 + 나머지 reason 채움) = 10곳/명소 (소도시는 있는 만큼)
// = 발굴 raw(12-ts-discover)의 photo_name 재사용 → PhotoMedia → Storage → image_url UPDATE (= TS 추가호출 0)
// 호출:
//   npx tsx .../12-ts-discover-pool/image-pool.ts --city-id=19 --date=2026-06-02 [--target=10] [--apply]
//   (--apply 없으면 = dry-run = 대상 목록만, 쓰기·PM 0)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DISCOVERY_ZONES } from './destinations';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../../../..');
process.chdir(ROOT);
const envRaw = fs.readFileSync('.env', 'utf-8').replace(/^﻿/, '');
for (const line of envRaw.split(/\r?\n/)) { const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/); if (m && !process.env[m[1]]) { let v = m[2].trim(); if (/^['"]/.test(v)) v = v.slice(1, -1); process.env[m[1]] = v; } }
const argv = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? 'true']));
const cityId = Number(argv['city-id'] || 0);
const date = String(argv['date'] || new Date().toISOString().slice(0, 10));
const TARGET = Number(argv['target'] || 10);
const apply = argv['apply'] === 'true';
const pmLimit = argv['limit'] ? Number(argv['limit']) : null; // = PM 건당 과금 = 소량 먼저 검증용
if (!cityId) { console.error('Usage: --city-id=<N> --date=<YYYY-MM-DD> [--target=10] [--apply]'); process.exit(1); }

const hkm = (a: any, b: any) => {
  const R = 6371, dLat = (b.lat - a.lat) * Math.PI / 180, dLng = (b.lng - a.lng) * Math.PI / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * Math.PI / 180) * Math.cos(b.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
};
const tier = (p: number | null) => p == null ? 'reason' : p <= 24 ? 'eco' : p <= 60 ? 'reason' : 'premium';

(async () => {
  const dests = DISCOVERY_ZONES[cityId]?.outskirt;
  if (!dests?.length) { console.error(`city ${cityId} outskirt config 없음`); process.exit(1); }

  // 발굴 raw → place_id → photo_name
  const rawPath = path.join(ROOT, 'docs', 'raw', String(cityId), `12-ts-discover-outskirt-${date}.json`);
  if (!fs.existsSync(rawPath)) { console.error(`✗ ${rawPath} 미존재`); process.exit(1); }
  const raw = JSON.parse(fs.readFileSync(rawPath, 'utf-8'));
  const photoByPid = new Map<string, string>();
  for (const z of raw.zones) for (const p of z.places) if (p.place_id && p.photo_name) photoByPid.set(p.place_id, p.photo_name);

  const pg = await import('pg');
  const c = new (pg as any).default.Client({ connectionString: process.env.SUPA_URL || process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const pool = (await c.query(
    `SELECT id, name_en, google_place_id AS pid, latitude AS lat, longitude AS lng, price_eur::float8 AS price, google_review_count AS rc,
            (image_url IS NOT NULL AND image_url<>'') AS has_img
     FROM place_seed_raw
     WHERE city_id=$1 AND seed_category='restaurant' AND 'ts-pool-${date}'=ANY(phase_tags) AND latitude IS NOT NULL`, [cityId])).rows;

  // 명소 배정 (= 최근접) + 명소별 fill-to-10
  for (const p of pool) p._dest = dests.reduce((best, d) => {
    const dist = hkm(d, p); return dist < best.dist ? { name: d.name, dist } : best;
  }, { name: '', dist: Infinity }).name;
  const byDest: Record<string, any[]> = {};
  for (const p of pool) (byDest[p._dest] ||= []).push(p);

  const selected: any[] = [];
  for (const [d, arr] of Object.entries(byDest)) {
    const t: Record<string, any[]> = { eco: [], reason: [], premium: [] };
    for (const p of arr) t[tier(p.price)].push(p);
    for (const k of Object.keys(t)) t[k].sort((a, b) => (b.rc || 0) - (a.rc || 0));
    const eco = t.eco.slice(0, 4), prem = t.premium.slice(0, 2);
    const reason = t.reason.slice(0, Math.max(0, TARGET - eco.length - prem.length));
    const sel = [...eco, ...prem, ...reason];
    sel.forEach(p => { p._destFinal = d; selected.push(p); });
  }
  const needPm = selected.filter(p => !p.has_img && photoByPid.has(p.pid));
  const noPhoto = selected.filter(p => !p.has_img && !photoByPid.has(p.pid));

  console.log(`═══ image-pool (city=${cityId}, target=${TARGET}/명소) ═══`);
  for (const [d, arr] of Object.entries(byDest)) {
    const sel = selected.filter(p => p._destFinal === d);
    console.log(`  ${d}: 배정 ${arr.length} → 선정 ${sel.length} (이미지필요 ${sel.filter(p => !p.has_img && photoByPid.has(p.pid)).length})`);
  }
  console.log(`\n선정 ${selected.length}곳 / PM 필요 ${needPm.length}곳 (€${(needPm.length * 0.007).toFixed(2)}) / 이미 이미지 ${selected.filter(p => p.has_img).length} / photo_name 없음 ${noPhoto.length}`);

  if (!apply) { console.log(`\n=== DRY-RUN (PM·쓰기 0) === 실행: --apply`); await c.end(); return; }

  // ⚠️ 2026-06-02 = ag3 작동 패턴(PERPIGNAN 22/22) 그대로 = 버킷 place-images + PUT + SUPABASE_ANON_KEY
  const keyRow = (await c.query(`SELECT key_value FROM api_keys WHERE key_name IN ('GOOGLE_MAPS_API_KEY','GOOGLE_PLACES_API_KEY') AND is_active=true ORDER BY key_name LIMIT 1`)).rows[0];
  const GOOGLE_KEY = keyRow?.key_value || process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY;
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
