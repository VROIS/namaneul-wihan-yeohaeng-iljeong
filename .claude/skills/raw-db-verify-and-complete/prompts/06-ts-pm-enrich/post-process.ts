// ⚠️ 수정금지(승인필요) 2026-05-20 = 06-ts-pm-enrich 후처리 = PhotoMedia + Storage + DB UPDATE
// = TS 응답 candidates 읽음 → photo 다운 → Supabase Storage 업로드 → upsertPlace UPDATE
//
// 호출:
//   npx tsx .../06-ts-pm-enrich/post-process.ts --city-id=19 --date=2026-05-20 --apply-status=ok [--photo]
//
// --photo 명시 시 = PhotoMedia 다운 + Storage 업로드 (= 추가 비용 $0.007/행)
// --photo 없으면 = TS 메타만 (= price/review/pid/mapsUri) UPDATE
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../../../..');
process.chdir(ROOT);

const argv = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? 'true']));
const cityId = Number(argv['city-id'] || 0);
const date = String(argv['date'] || new Date().toISOString().slice(0, 10));
const applyStatus = (argv['apply-status'] || '').split(',').filter(Boolean);
const applyIds = (argv['apply-ids'] || '').split(',').filter(Boolean).map(Number);
const downloadPhoto = argv['photo'] === 'true';
const apply = applyStatus.length > 0 || applyIds.length > 0;
if (!cityId) { console.error('Usage: --city-id=<N> --date=<YYYY-MM-DD> --apply-status=ok [--photo] [--apply-ids=N,N,...]'); process.exit(1); }

(async () => {
  const envRaw = fs.readFileSync('.env', 'utf-8').replace(/^﻿/, '');
  for (const line of envRaw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
    if (m && !process.env[m[1]]) {
      let v = m[2].trim();
      if (/^['"]/.test(v)) v = v.slice(1, -1);
      process.env[m[1]] = v;
    }
  }

  const inPath = path.join(ROOT, 'docs', 'raw', String(cityId), `06-ts-pm-enrich-candidates-${date}.json`);
  if (!fs.existsSync(inPath)) { console.error(`✗ ${inPath} 미존재 = run.ts 먼저 실행`); process.exit(1); }
  const j = JSON.parse(fs.readFileSync(inPath, 'utf-8'));
  const candidates = (j.results || []).filter((r: any) =>
    applyStatus.includes(r.status) || applyIds.includes(r.id)
  );

  console.log(`═══ 06-ts-pm-enrich post-process ═══`);
  console.log(`city_id = ${cityId}, date = ${date}, photo download = ${downloadPhoto}`);
  console.log(`적용 대상 = ${candidates.length} 행`);

  if (!apply) {
    console.log('\n--- DRY-RUN = --apply-status 또는 --apply-ids 명시 후 실행 ---');
    process.exit(0);
  }

  const pg = await import('pg');
  const c = new (pg as any).default.Client({ connectionString: process.env.SUPA_URL || process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const keyRow = downloadPhoto
    ? (await c.query(`SELECT key_value FROM api_keys WHERE key_name='GOOGLE_PLACES_API_KEY' AND is_active=true`)).rows[0]
    : null;
  const PLACES_KEY = keyRow?.key_value;

  const { upsertPlace } = await import(path.join(ROOT, 'server/services/place-upsert.ts'));

  // Supabase Storage 업로드용 (= REST API 직접 호출 = supabase-js 의존 회피)
  const SUPA_PROJECT = (process.env.SUPA_URL || '').match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
  const STORAGE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY;

  async function downloadAndUpload(photoName: string, rowId: number): Promise<string | null> {
    if (!PLACES_KEY || !SUPA_PROJECT || !STORAGE_KEY) return null;
    try {
      const photoUrl = `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=800&key=${PLACES_KEY}`;
      const pr = await fetch(photoUrl, { signal: AbortSignal.timeout(30000) });
      if (!pr.ok) return null;
      const buf = Buffer.from(await pr.arrayBuffer());

      const ts = Date.now();
      const filePath = `${cityId}/${rowId}-${ts}.jpg`;
      const upUrl = `https://${SUPA_PROJECT}.supabase.co/storage/v1/object/place-photos/${filePath}`;
      const ur = await fetch(upUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${STORAGE_KEY}`,
          'Content-Type': 'image/jpeg',
          'x-upsert': 'true',
        },
        body: buf,
      });
      if (!ur.ok) return null;
      return `https://${SUPA_PROJECT}.supabase.co/storage/v1/object/public/place-photos/${filePath}`;
    } catch (e) {
      return null;
    }
  }

  let updated = 0, photo_ok = 0, errors = 0;
  for (const r of candidates) {
    try {
      let imageUrl: string | null = null;
      if (downloadPhoto && r.ts?.photo_name) {
        imageUrl = await downloadAndUpload(r.ts.photo_name, r.id);
        if (imageUrl) photo_ok++;
      }

      const result = await upsertPlace({
        cityId,
        seedCategory: r.category,
        nameEn: r.name,
        nameKo: r.ts?.display_name_ko || null,
        address: r.ts?.address || null,
        latitude: r.ts?.lat ?? null,
        longitude: r.ts?.lng ?? null,
        googlePlaceId: r.ts?.place_id || null,
        googleMapsUri: r.ts?.google_maps_uri || null,
        googleReviewCount: r.ts?.review_count ?? null,
        priceEur: r.ts?.price_eur ?? null,
        imageUrl: imageUrl || undefined,  // = undefined = COALESCE 옛 우선
        collectionPhase: 'gemini3-2026-05',
      });
      if (result.action === 'updated' || result.action === 'inserted') updated++;
      console.log(`✓ id=${r.id} ${r.name} = ${result.action} ${imageUrl ? '+photo' : ''}`);
    } catch (e: any) {
      errors++;
      console.error(`  ✗ id=${r.id} ${r.name}: ${e.message}`);
    }
  }
  await c.end();

  console.log(`\n═══ 결과 ═══`);
  console.log(`updated = ${updated} / photo_ok = ${photo_ok} / errors = ${errors}`);
})();