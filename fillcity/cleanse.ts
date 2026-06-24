// ⚠️ 수정금지(승인필요) 2026-06-23 = fillCity 1단계-b = "오염 교정" 정제 (사장님 SSOT)
// = 1단계-a(cleanse=환각 삭제)와 짝 = 이건 "값 있는데 틀림"(오염) 교정. 발굴·#45 앞 선행.
// = 근원: #45 는 "결손(빈칸)"만 추출 → "오염(틀린 값)"은 사각지대(추출 제외) → 영구 안 고쳐짐.
//   예) 박물관 price_eur €13만(옛 gemini3 환각) = price 있으니 #45 결손 아님 = 제외 = 그대로.
// = 사장님 설계: ① AI(SQL)가 이상행 판별·추출 → ② 모아서 Gemini 1콜(geminiCurate) 정정 → ③ 전필드 새덮어쓰기.
//   = #45 행마다 호출 아님 = 이상행만 1콜 = 비용 최소(외부호출 = Gemini 1콜만, TS·PM 0).
//
// ┌─ [오염 판별 기준 = 사장님 SSOT 2026-06-23] ──────────────────────────────┐
// │ 가격 오염:                                                                  │
// │   - 비식당(박물관·쇼핑·공원·명소) price_eur > €200 = 오염 (입장료 상한 초과)      │
// │   - 식당 price_eur > €500 = 오염 (1인 식대 상한 초과)                          │
// │ 칸 오입력(형식 위반 = SQL 후보 + Gemini 판단):                                  │
// │   - name_en 이 숫자로 시작 (= 번지가 이름칸?)                                   │
// │   - name_local 이 주소형(쉼표+우편)                                           │
// │   - address 에 숫자 0 (= 번지·우편 없음 = 이름만?)                             │
// │ = Gemini 가 행 전체 보고 올바른 값 정정(그라운딩 ON = 정확). 애매하면 그대로 둠.    │
// └────────────────────────────────────────────────────────────────────────┘
//
// 호출:
//   npx tsx fillcity/cleanse.ts --city-id=24            # DRY = 오염행 목록만(외부호출 0)
//   npx tsx fillcity/cleanse.ts --city-id=24 --apply    # Gemini 1콜 정정 → 새덮어쓰기
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
process.chdir(ROOT);
const env = fs.readFileSync('.env', 'utf-8').replace(/^﻿/, '');
for (const line of env.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) { let v = m[2].trim(); if (/^['"]/.test(v)) v = v.slice(1, -1); process.env[m[1]] = v; }
}
const argv = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? 'true']));
const cityId = Number(argv['city-id'] || 0);
const apply = argv['apply'] === 'true';
const inputDate = new Date().toISOString().slice(0, 10);
if (!cityId) { console.error('Usage: --city-id=<N> [--apply]'); process.exit(1); }

(async () => {
  const pg = await import('pg');
  const c = new (pg as any).default.Client({ connectionString: process.env.SUPA_URL || process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const city = (await c.query('SELECT name_en FROM cities WHERE id=$1', [cityId])).rows[0];
  if (!city) { await c.end(); console.error(`X city ${cityId} 미존재`); process.exit(1); }

  // [1 오염행 추출] = 가격오염(카테고리별 임계) + 칸오입력(형식위반). BTS 제외.
  const rows = (await c.query(`
    SELECT id, name_local, name_en, name_ko, address,
           latitude::float8 AS lat, longitude::float8 AS lng,
           price_eur::float8 AS price_eur, google_review_count AS rc, seed_category
    FROM place_seed_raw
    WHERE city_id=$1 AND seed_category NOT LIKE 'bts%'
    ORDER BY seed_category, id`, [cityId])).rows;
  // ⚠️ 수정금지(승인필요) 2026-06-23 사장님 SSOT = 정제 = "전체 행 통째 Gemini 재검증" (= 오염추출 SQL 폐기, §19).
  //   = 근거: 어떤 게 오염인지 SQL 패턴(price>200 등)으로 추리는 건 AI 임의 = Gemini 가 행 전체 보고 판단해야 정확.
  //     Gemini 1콜=120곳 입증 → 한 도시 전체(130~450) = 2~4콜(geminiCurate 자동 배치). 어차피 비용 = 전체 재검증 가치.
  //   = #45 이전 독립 단계(섞지 말 것). 정제 후 #45 = 결손률↓ + 가격오류·이상행 미리잡힘 = 이중체크.

  console.log(`=== #1b 정제(전체 재검증) (city ${cityId} ${city.name_en}) = 전체 ${rows.length}곳 ${apply ? '(APPLY)' : '(DRY)'} ===`);
  if (!rows.length) { console.log('= 행 0 = 종료'); await c.end(); return; }
  console.log(`[계획] 전체 ${rows.length}곳 → Gemini 재검증(이름·가격·칸오입력 교정) → 전필드 새덮어쓰기. 배치 = geminiCurate 자동(~120/콜).`);

  if (!apply) { console.log(`\n=== DRY = 외부호출 0. --apply 로 Gemini 재검증(전체) ===`); await c.end(); return; }

  // [2 Gemini 1콜 정정] = geminiCurate(#45 와 동일 배치 1콜) = 행 전체 보고 올바른 값. 출입증 발급.
  const { issueApiKey } = await import(pathToFileURL(path.join(ROOT, 'server/services/shared/issue-api-key.ts')).href);
  const geminiKey = await issueApiKey(c, 'GEMINI_API_KEY', cityId, inputDate, true);
  const { geminiCurate } = await import(pathToFileURL(path.join(ROOT, 'server/services/shared/gemini-curate.ts')).href);
  const curated = await geminiCurate(city.name_en, cityId, rows.map((r: any) => ({
    id: r.id, nameEn: r.name_en, nameLocal: r.name_local, nameKo: r.name_ko,
    address: r.address, latitude: r.lat, longitude: r.lng,
  })), { apiKey: geminiKey });
  const gById = new Map<number, any>(curated.map((g: any) => [g.id, g]));

  // [3 전필드 새덮어쓰기] = #45 와 동일 = id 직행 UPDATE = COALESCE 새우선(셀렉 X = 전 필드).
  //   = shopping price=null 정합. Gemini 가 올바른 값 주면 오염 덮임 / 안 주면 기존 보존.
  let done = 0;
  for (const r of rows) {
    const g = gById.get(r.id);
    if (!g) { console.log(`  ! Gemini 응답없음 id=${r.id} ${r.name_en}`); continue; }
    // ⚠️ shopping price NULL 강제 = SQL CASE($12) 단일 처리 (TS 삼항 중복 제거 = /simplify 2026-06-23).
    const u = await c.query(`UPDATE place_seed_raw SET
        name_local = COALESCE(NULLIF($2,''), name_local),
        name_en = COALESCE(NULLIF($3,''), name_en),
        name_ko = COALESCE(NULLIF($4,''), name_ko),
        address = COALESCE(NULLIF($5,''), address),
        latitude = COALESCE($6::real, latitude),
        longitude = COALESCE($7::real, longitude),
        summary_ko = COALESCE(NULLIF($8,''), summary_ko),
        editorial_summary = COALESCE(NULLIF($9,''), editorial_summary),
        -- ⚠️ 수정금지(승인필요) 2026-06-23 사장님 SSOT = shopping = price 강제 NULL (§15 = 쇼핑 1인가격 개념없음).
        --   = $12(isShopping) true 면 무조건 NULL SET / false 면 Gemini값 새우선 COALESCE.
        price_eur = CASE WHEN $12::boolean THEN NULL ELSE COALESCE($10::real, price_eur) END,
        distance_km_from_center = COALESCE($11::numeric, distance_km_from_center),
        updated_at = NOW()
      WHERE id=$1`,
      [r.id, g.nameLocal ?? null, g.nameEn ?? null, g.nameKo ?? null, g.address ?? null,
       g.latitude ?? null, g.longitude ?? null, g.summaryKo ?? null, g.editorialSummary ?? null,
       g.priceEur ?? null, g.distanceKmFromCenter ?? null, r.seed_category === 'shopping']);
    if (u.rowCount) done++;
    console.log(`  + 교정 id=${r.id} ${g.nameEn || r.name_en} (price €${r.price_eur}→€${r.seed_category === 'shopping' ? 'NULL' : (g.priceEur ?? '?')})`);
  }
  console.log(`\n=== #1b 정제 결과 = 전체 ${rows.length}곳 → Gemini 재검증 정정 ${done}곳 (외부호출 = Gemini만, TS·PM 0) ===`);
  await c.end();
})();
