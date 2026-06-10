// ⚠️ 영구 컴포넌트 2026-06-10 = 재입력 회귀 검증 = 저장된 모든 발굴 raw → 단일 matcher.ts(matchCandidate) 재입력 시뮬.
//   = 목표(사용자 SSOT) = 이미 입력된 정보를 다시 넣으면 "매처미스(=DB에 있는데 새로 만듦) = 0" (무결점). 샘플 아님 = 전체 파일.
//   = 쓰기 0 · 외부호출 0 (저장 raw 만 읽음). "정상신규"(DB에 진짜 없음=실험/필터로 미입력) 와 "매처미스"(고칠 중복) 분리 보고.
// 호출: npx tsx .claude/skills/raw-db-verify-and-complete/checks/refeed-verify.ts --city-id=37 [--verbose]
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../../../..');
process.chdir(ROOT);
const envRaw = fs.readFileSync('.env', 'utf-8').replace(/^﻿/, '');
for (const line of envRaw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) { let v = m[2].trim(); if (/^['"]/.test(v)) v = v.slice(1, -1); process.env[m[1]] = v; }
}
const argv = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, '').split('=')).map(([k, v]) => [k, v ?? 'true']));
const cityId = Number(argv['city-id'] || 0);
const verbose = argv['verbose'] === 'true';
if (!cityId) { console.error('Usage: --city-id=<N> [--verbose]'); process.exit(1); }

const num = (v: any): number | null => (v == null || v === '' ? null : Number(v));

// Gemini raw_text → JSON (= 절단 복구, 01/03/04 post-process parse 와 동일 취지)
function parseGemini(t: string): any | null {
  if (!t) return null;
  const start = t.indexOf('{');
  if (start < 0) return null;
  try { return JSON.parse(t.slice(start, t.lastIndexOf('}') + 1)); } catch {}
  for (let e = t.length - 1; e > start; e--) {
    if (t[e] !== '}') continue;
    const body = t.slice(start, e + 1);
    for (const suf of [']}}', ']}', '}', '']) { try { const p = JSON.parse(body + suf); if (p.results) return p; } catch {} }
  }
  return null;
}

(async () => {
  const { matchCandidate } = await import(pathToFileURL(path.join(ROOT, 'server/services/shared/matcher.ts')).href);
  const pg = await import('pg');
  const c = new (pg as any).default.Client({ connectionString: process.env.SUPA_URL || process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const existing = (await c.query(
    `SELECT id, city_id AS "cityId", name_en AS "nameEn", name_local AS "nameLocal", name_ko AS "nameKo", address,
            latitude::float8 AS latitude, longitude::float8 AS longitude, google_place_id AS "googlePlaceId", google_maps_uri AS "googleMapsUri"
     FROM place_seed_raw WHERE city_id=$1`, [cityId])).rows;
  await c.end();

  const dir = path.join(ROOT, 'docs', 'raw', String(cityId));
  const files = fs.readdirSync(dir)
    .filter((f) => /\.json$/.test(f)
      && /^(12-ts-discover|01-discover-6cats|03-downtown-restaurant|04-outskirt-restaurant)/.test(f)
      && !/report|pretty|sim/.test(f))
    .sort();

  // 한 파일 → 후보 장소 배열 (= matcher.ts MatchInput 형)
  const placesOf = (file: string): any[] => {
    const j = JSON.parse(fs.readFileSync(path.join(dir, file), 'utf-8'));
    const out: any[] = [];
    if (Array.isArray(j.zones)) {                       // 12-ts-discover
      for (const z of j.zones) for (const p of (z.places || []))
        out.push({ cityId, googlePlaceId: p.place_id || null, googleMapsUri: p.google_maps_uri || null, address: p.address || null,
          latitude: num(p.lat), longitude: num(p.lng), nameEn: p.name || p.name_local || null, nameLocal: p.name_local || p.name || null, nameKo: null });
    } else if (j.raw_text) {                            // 01/03/04 Gemini
      const g = parseGemini(j.raw_text);
      for (const arr of Object.values(g?.results || {})) if (Array.isArray(arr)) for (const p of arr as any[])
        out.push({ cityId, googlePlaceId: null, googleMapsUri: null, address: p.address || null,
          latitude: num(p.lat ?? p.latitude), longitude: num(p.lng ?? p.longitude),
          nameEn: p.name_en || p.name || null, nameLocal: p.name_local || null, nameKo: p.name_ko || null });
    }
    return out;
  };

  let tPlaces = 0, tMatch = 0, tMiss = 0, tNew = 0;
  const missList: string[] = [];
  const newList: string[] = [];
  console.log(`═══ 재입력 회귀 (city ${cityId}, 단일 matcher.ts, 쓰기0·외부호출0) = 발굴 파일 ${files.length}개 ═══`);
  console.log(`파일 | 장소 | 병합(이미있음) | 🔴매처미스 | 정상신규`);
  for (const f of files) {
    const places = placesOf(f);
    let m = 0, miss = 0, nw = 0;
    for (const pl of places) {
      if (!(pl.nameEn || pl.nameLocal)) continue;
      const r = matchCandidate(pl, existing);
      if (r.match) { m++; continue; }
      const key = String(pl.nameLocal || pl.nameEn || '').toLowerCase().trim();
      const dup = key.length >= 4 ? existing.find((e: any) => [e.nameEn, e.nameLocal, e.nameKo]
        .some((n: any) => n && (String(n).toLowerCase().includes(key) || key.includes(String(n).toLowerCase())))) : null;
      if (dup) { miss++; missList.push(`${f}: "${pl.nameLocal || pl.nameEn}" → DB id=${dup.id} "${dup.nameLocal || dup.nameEn}"`); }
      else { nw++; newList.push(`${f}: "${pl.nameLocal || pl.nameEn}" (${pl.address || '주소X'})`); }
    }
    tPlaces += places.length; tMatch += m; tMiss += miss; tNew += nw;
    console.log(`${f.replace(`-${argv['date'] || ''}`, '').slice(0, 42).padEnd(44)} | ${String(places.length).padStart(4)} | ${String(m).padStart(4)} | ${String(miss).padStart(4)} | ${String(nw).padStart(4)}`);
  }
  console.log(`\n═══ 합계 = 장소 ${tPlaces} / 병합 ${tMatch} / 🔴매처미스 ${tMiss} / 정상신규 ${tNew} ═══`);
  console.log(`= 목표 = 🔴매처미스 0 (= DB에 있는데 못 합쳐 새로 만드는 것 = 무결점). 정상신규 ${tNew} = DB에 진짜 없음(실험/필터 미입력).`);
  if (tMiss && (verbose || tMiss <= 40)) { console.log(`\n[🔴 매처미스 목록 = 고칠 중복]`); missList.forEach((m) => console.log(`  - ${m}`)); }
  if (tNew && (verbose || tNew <= 40)) { console.log(`\n[정상신규 목록 = DB에 진짜 없음 = 검증용]`); newList.forEach((m) => console.log(`  - ${m}`)); }
})();
