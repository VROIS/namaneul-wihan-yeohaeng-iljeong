// ⚠️ 영구 컴포넌트 2026-06-10 = Storage 고아 이미지 정리(삭제) = row 가 참조하지 않는 place-images 객체 제거(용량/비용 절약)
// = 고아 = image_url 로 아무 row 도 가리키지 않는 객체. 원인 = 멀티태그 타폴더 재PM / 07-merge·삭제로 부모 row 사라짐.
// = ⚠️ 반드시 storage-image-relink(재링크) 를 먼저 = 부모가 결손인 고아를 복구한 뒤 = 남은 진짜 불필요분만 삭제.
// = ⚠️ 비가역(파일 삭제) = --apply 명시 필요. DRY = 삭제 대상 수/분류(부모有중복·부모無죽은)만.
// 호출: npx tsx server/services/fill/storage-orphan-cleanup.ts --city-id=37 [--apply]
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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
if (!cityId) { console.error('Usage: --city-id=<N> [--apply]'); process.exit(1); }
const BUCKET = 'place-images';

(async () => {
  const supaPublicUrl = process.env.SUPABASE_PUBLIC_URL || 'https://wxebceflvuythuodemro.supabase.co';
  const storageKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;
  if (apply && !storageKey) { console.error('✗ SUPABASE_SERVICE_ROLE_KEY 미존재 = 삭제 불가'); process.exit(1); }
  const pg = await import('pg');
  const c = new (pg as any).default.Client({ connectionString: process.env.SUPA_URL || process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();

  // 고아 = place-images 의 {cityId}/ 객체 중 어떤 row 의 image_url 도 참조하지 않는 것
  //   has_parent = 그 PID 의 row 는 있으나(다른 이미지 보유=중복) / 없으면(부모無=죽은 고아)
  const orphans = (await c.query(`
    SELECT o.name,
      EXISTS(SELECT 1 FROM place_seed_raw p
        WHERE p.city_id=$1 AND p.google_place_id = regexp_replace(split_part(o.name,'/',3),'\\.[a-z]+$','')) AS has_parent
    FROM storage.objects o
    WHERE o.bucket_id=$2 AND o.name LIKE $1::text || '/%'
      AND NOT EXISTS(SELECT 1 FROM place_seed_raw p WHERE p.city_id=$1 AND (
        p.image_url LIKE '%' || o.name || '%'
        OR p.best_image_url LIKE '%' || o.name || '%'
        OR p.photo_urls::text LIKE '%' || o.name || '%'
      ))
  `, [cityId, BUCKET])).rows;
  await c.end();

  const dup = orphans.filter((o: any) => o.has_parent).length;
  const dead = orphans.length - dup;
  console.log(`═══ storage-orphan-cleanup (city ${cityId}) = 고아 ${orphans.length} (부모有중복 ${dup} / 부모無죽은 ${dead}) ═══`);
  if (!apply) {
    console.log(`[샘플] ${orphans.slice(0, 10).map((o: any) => o.name).join(' / ')}`);
    console.log(`\n=== DRY (--apply 로 삭제, 비가역) ===`);
    return;
  }

  // 배치 삭제 = Storage API DELETE /object/{bucket} body{prefixes:[...]} (최대 100/배치)
  const names = orphans.map((o: any) => o.name);
  let del = 0, err = 0;
  for (let i = 0; i < names.length; i += 100) {
    const batch = names.slice(i, i + 100);
    const r = await fetch(`${supaPublicUrl}/storage/v1/object/${BUCKET}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${storageKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prefixes: batch }),
      signal: AbortSignal.timeout(30000),
    });
    if (r.ok) del += batch.length; else { err += batch.length; console.log(`  ✗ batch ${i}: ${r.status} ${(await r.text()).slice(0, 100)}`); }
  }
  console.log(`\n═══ 결과 = 삭제 ${del} / 실패 ${err} ═══`);
})();
