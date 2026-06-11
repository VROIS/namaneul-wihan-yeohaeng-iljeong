// ⚠️ 수정금지(승인필요) 2026-06-04 = fill/ts-photo-fill = #4 = TOP20(seed_category) 이미지 없는 행 → 관문으로 사진 채움
// = 관문 tsSearch(이름+좌표앵커) → top1.photoName → 관문 tsPhoto(PhotoMedia→Storage) → upsertPlace(imageUrl) = AI 손 0
// = 대상 = 6 비식당 카테고리 seed_category 랭킹 TOP20 중 image 없는 행만 (= 사용자 SSOT #4)
// 호출: npx tsx server/services/fill/ts-photo-fill.ts --city-id=19 [--apply] [--lang=fr] [--top=20]
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../..');
process.chdir(ROOT);
const envRaw = fs.readFileSync('.env', 'utf-8').replace(/^﻿/, '');
for (const line of envRaw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) { let v = m[2].trim(); if (/^['"]/.test(v)) v = v.slice(1, -1); process.env[m[1]] = v; }
}
const argv = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? 'true']));
const cityId = Number(argv['city-id'] || 0);
const apply = argv['apply'] === 'true';
const lang = argv['lang'] ? String(argv['lang']) : 'ko';
const top = Number(argv['top'] || 20);
const cats = ['heritage', 'hotspot', 'attraction', 'adventure', 'healing', 'shopping'];
if (!cityId) { console.error('Usage: --city-id=<N> [--apply] [--lang=fr] [--top=20]'); process.exit(1); }

const ANCHOR_M = 100;

(async () => {
  const { tsSearch, tsPhoto } = await import(pathToFileURL(path.join(ROOT, 'server/services/shared/ts-client.ts')).href);
  const { upsertPlace } = await import(pathToFileURL(path.join(ROOT, 'server/services/place-upsert.ts')).href);
  const pg = await import('pg');
  const c = new (pg as any).default.Client({ connectionString: process.env.SUPA_URL || process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const city = (await c.query('SELECT name_en, country_code FROM cities WHERE id=$1', [cityId])).rows[0];
  if (!city) { await c.end(); console.error(`✗ city ${cityId} 미존재 = 중단`); process.exit(1); }
  const keyRow = (await c.query(`SELECT key_value FROM api_keys WHERE key_name IN ('GOOGLE_MAPS_API_KEY','GOOGLE_PLACES_API_KEY') AND is_active=true ORDER BY key_name LIMIT 1`)).rows[0];
  const KEY = keyRow?.key_value || process.env.GOOGLE_MAPS_API_KEY || process.env.GOOGLE_PLACES_API_KEY;
  // ⚠️ 2026-06-04 = image-pool 검증 패턴 = SUPABASE_PUBLIC_URL 전체 URL (단일 프로젝트 = 모든 도시 공용) + SERVICE_ROLE
  const supaPublicUrl = process.env.SUPABASE_PUBLIC_URL || 'https://wxebceflvuythuodemro.supabase.co';
  const storageKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;
  if (!KEY) { await c.end(); console.error('Google key 미존재'); process.exit(1); }
  if (apply && (!supaPublicUrl || !storageKey)) { await c.end(); console.error(`Storage 설정 미비 (url=${supaPublicUrl}, key=${!!storageKey}) = 업로드 불가`); process.exit(1); }

  // ⚠️ 수정금지(승인필요) 2026-06-10 = PM(유료) 전 Storage 무료 재링크 = 결제된 고아 이미지 재활용 (storage-image-relink, §16 / [[feedback_internal_first_recover]])
  const { relinkStorageImages } = await import(pathToFileURL(path.join(ROOT, 'server/services/fill/storage-image-relink.ts')).href);
  const relink = await relinkStorageImages({ cityId, apply, client: c, categories: cats });
  if (relink.relinkable) console.log(`[재링크] storage 매칭 ${relink.relinkable}곳 ${apply ? `= ${relink.relinked} 무료 채움` : '(--apply 시 무료)'} → PM 대상 제외`);

  const rows = (await c.query(`
    WITH ranked AS (
      SELECT id, seed_category, name_en, name_local, latitude::float8 AS lat, longitude::float8 AS lng, google_place_id,
        image_url,
        row_number() OVER (PARTITION BY seed_category ORDER BY google_review_count DESC NULLS LAST) AS rn
      FROM place_seed_raw WHERE city_id=$1 AND seed_category = ANY($2::text[])
    )
    SELECT id, seed_category, name_en, name_local, lat, lng, google_place_id FROM ranked
    WHERE rn <= $3 AND image_url IS NULL
    ORDER BY seed_category`, [cityId, cats, top])).rows.filter((r: any) => !relink.matchedIds.has(r.id));

  console.log(`═══ ts-photo-fill (city ${cityId} ${city?.name_en}) = TOP${top} 이미지없음 ${rows.length}곳 = €${(rows.length * 0.037).toFixed(2)} ═══`);
  if (!apply) {
    const byCat: Record<string, number> = {};
    for (const r of rows) byCat[r.seed_category] = (byCat[r.seed_category] || 0) + 1;
    console.log(`[대상] ${Object.entries(byCat).map(([k, v]) => `${k} ${v}`).join(' / ')}`);
    console.log(`  ${rows.map((r: any) => r.name_local || r.name_en).join(' / ')}`);
    console.log(`\n=== DRY (--apply 로 실행) ===`); await c.end(); return;
  }

  let filled = 0, noPhoto = 0, err = 0;
  const report: string[] = [];
  for (const row of rows) {
    try {
      const ts = await tsSearch({
        apiKey: KEY, method: 'searchText', regionCode: city?.country_code || 'FR', languageCode: lang,
        cityId, rawTag: `photo-${row.name_local || row.name_en || row.id}`,
        nameLocal: row.name_local || row.name_en, latitude: row.lat ?? null, longitude: row.lng ?? null,
        anchorRadiusM: row.lat != null ? ANCHOR_M : undefined, maxResults: 1,
      });
      const top1 = ts[0];
      if (!top1 || !top1.photoName) { noPhoto++; report.push(`  ✗ 사진없음: ${row.name_local || row.name_en}`); continue; }
      const imageUrl = await tsPhoto({
        apiKey: KEY, photoName: top1.photoName, storageKey, supaPublicUrl,
        pathKey: `${cityId}/${row.seed_category}/${row.google_place_id || row.id}`, maxWidthPx: 800,
      });
      if (!imageUrl) { err++; report.push(`  ✗ 업로드실패: ${row.name_local || row.name_en}`); continue; }
      const r = await upsertPlace({
        cityId, seedCategory: row.seed_category, nameEn: row.name_en,
        googlePlaceId: row.google_place_id || top1.googlePlaceId || null,
        latitude: row.lat ?? top1.latitude, longitude: row.lng ?? top1.longitude,
        imageUrl,
      });
      if (r.action === 'updated' || r.action === 'inserted') { filled++; report.push(`  ✓ ${row.name_local || row.name_en} (${r.action})`); }
      else { err++; report.push(`  ⚠️ ${row.name_local || row.name_en} = ${r.action}(${r.matchedBy})`); }
    } catch (e: any) { err++; report.push(`  ✗ ERR ${row.name_local || row.name_en}: ${e.message}`); }
  }
  await c.end();
  console.log(report.join('\n'));
  console.log(`\n═══ 결과 = 이미지채움 ${filled} / 사진없음 ${noPhoto} / 실패 ${err} ═══`);
})();
