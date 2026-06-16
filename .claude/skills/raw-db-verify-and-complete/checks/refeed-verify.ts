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
  // ⚠️ 수정금지(승인필요) — raw 파일명 표준+버전순번 정합(2026-06-16 SSOT, 1번 누락분) = 발굴 raw 4종(12-ts-discover/01/03/04) 재입력. 날짜앞 표준 {date}_{NN-step}_... 앵커(옛 {step 시작} 앵커=신규파일 0건 매칭=리더 침묵 버그) + latestVersionedByBase 로 base별 최신 _N 1개 축약(같은 발굴 중복집계 0)
  const { latestVersionedByBase } = await import(pathToFileURL(path.join(ROOT, 'server/services/shared/raw-filename.ts')).href);
  const files = latestVersionedByBase(fs.readdirSync(dir)
    .filter((f) => /\.json$/.test(f)
      && /^\d{4}-\d{2}-\d{2}_(12-ts-discover|01-discover-6cats|03-downtown-restaurant|04-outskirt-restaurant)/.test(f)
      && !/report|pretty|sim/.test(f)));

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

  // ⚠️ 2026-06-13 = 매처미스 분류 정밀화 = DB 의 PID 집합 (= raw PID 가 DB 에 실재하는지 교차확인)
  //   = 옛 결함: 매칭 실패 항목을 "이름 부분일치"로만 dup 판정 → PID 다른 동명 다른 장소(Loulou/Le Marais 등)를
  //     "고칠 중복"으로 거짓 양성. matcher 는 URI veto 로 다른장소 판정했는데 보고가 오분류. (⚠️ 수정금지(승인필요) — PID veto 제거 텍스트 정합(2026-06-15 SSOT))
  //   = 신규칙: raw PID 가 DB 에 실재 = 진짜 매처미스(고칠 구멍) / raw PID 가 DB 에 없음(또는 PID 무) = 정상신규(동명 다른 장소).
  const dbPidSet = new Set<string>(existing.map((e: any) => e.googlePlaceId).filter(Boolean));

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
      // ⚠️ 2026-06-13 = 매칭 실패 분류 = PID 실재 여부 (= 이름 부분일치 폐기 = PID veto 무시 거짓양성 제거).
      //   = raw PID 가 DB 에 실재하는데 match 실패 = 🔴진짜 매처미스(같은 PID 못 잡음 = 고칠 구멍).
      //   = raw PID 가 DB 에 없음(또는 PID 무) = 정상신규(= 동명 다른 장소 = Google 이 다른 PID 부여 = 합치면 안 됨).
      if (pl.googlePlaceId && dbPidSet.has(pl.googlePlaceId)) {
        const dupRow = existing.find((e: any) => e.googlePlaceId === pl.googlePlaceId);
        miss++; missList.push(`${f}: "${pl.nameLocal || pl.nameEn}" PID=${pl.googlePlaceId} → DB id=${dupRow?.id} (PID 동일인데 매칭 실패)`);
      } else {
        nw++; newList.push(`${f}: "${pl.nameLocal || pl.nameEn}" (${pl.address || '주소X'}${pl.googlePlaceId ? `, PID=${pl.googlePlaceId} DB무` : ', PID무'})`);
      }
    }
    tPlaces += places.length; tMatch += m; tMiss += miss; tNew += nw;
    console.log(`${f.replace(`-${argv['date'] || ''}`, '').slice(0, 42).padEnd(44)} | ${String(places.length).padStart(4)} | ${String(m).padStart(4)} | ${String(miss).padStart(4)} | ${String(nw).padStart(4)}`);
  }
  console.log(`\n═══ 합계 = 장소 ${tPlaces} / 병합 ${tMatch} / 🔴매처미스 ${tMiss} / 정상신규 ${tNew} ═══`);
  console.log(`= 목표 = 🔴매처미스 0 (= DB에 있는데 못 합쳐 새로 만드는 것 = 무결점). 정상신규 ${tNew} = DB에 진짜 없음(실험/필터 미입력).`);
  if (tMiss && (verbose || tMiss <= 40)) { console.log(`\n[🔴 매처미스 목록 = 고칠 중복]`); missList.forEach((m) => console.log(`  - ${m}`)); }
  if (tNew && (verbose || tNew <= 40)) { console.log(`\n[정상신규 목록 = DB에 진짜 없음 = 검증용]`); newList.forEach((m) => console.log(`  - ${m}`)); }
})();
