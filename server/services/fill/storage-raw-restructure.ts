// ⚠️ 영구 컴포넌트 2026-06-15 사장님 SSOT = raw-responses 버킷 옛 객체 → 표준 구조 재배치 (= 장독 안 정비).
//   = 표준: {cityId}/{YYYY-MM-DD}_{source}-{tag}.json (= save-raw.ts 신규 저장과 동형 = 로컬 docs/raw 와 도일화).
//   = 옛 형식 3종 통합: ① docs-raw/{city}/{NN}-{내용}-{날짜}.json  ② ts|gemini/{city}/{tag}-{ISO}.json  ③ ts|gemini/runtime/{tag}-{ISO}.json(도시ID 없음=raw 좌표로 cities 최근접 복구).
//   = 도시단서 없는 runtime(존재판정/빈응답) = runtime/ 보존. 1회용/실험(sim/test/pretty/100km) = {city}/_archive/ 분리.
//   = 이동 = 다운→재PUT(표준경로)→옛 삭제. x-upsert=true = 같은 표준키 = 덮어쓰기(중복 2번 저장 0). best-effort 개별.
// 호출: npx tsx server/services/fill/storage-raw-restructure.ts [--apply]   (없으면 DRY = 매핑·충돌만, 이동 0)
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
const apply = process.argv.includes('--apply');
const BUCKET = 'raw-responses';
const STEP: Record<string, string> = { '01': 'discover-6cats', '02': 'enrich-place', '03': 'downtown-restaurant', '04': 'outskirt-restaurant', '06': 'ts-pm-enrich', '07': 'merge-dups', '08': 'wk-image-fill', '12': 'ts-discover', '13': 'restaurant-summary' };

const hav = (a1: number, o1: number, a2: number, o2: number): number => {
  const R = 6371, r = (d: number) => (d * Math.PI) / 180;
  const dl = r(a2 - a1), dn = r(o2 - o1);
  const h = Math.sin(dl / 2) ** 2 + Math.cos(r(a1)) * Math.cos(r(a2)) * Math.sin(dn / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
};

// docs-raw 옛 파일명 → 표준 ({date}_{NN-step}_{content}.json) = 로컬 raw-filename.ts 와 동일 규칙
function localStd(base: string): string | null {
  let mm = base.match(/^wk-image-fill-(.+)-(\d{4}-\d{2}-\d{2})\.json$/);
  if (mm) return std('08', 'wk-image-fill-' + mm[1], mm[2]);
  const m = base.match(/^(\d{2})-(.+)-(\d{4}-\d{2}-\d{2})\.json$/);
  return m ? std(m[1], m[2], m[3]) : null;
}
function std(nn: string, mid: string, date: string): string {
  let step = STEP[nn] || nn, rest = mid;
  if (nn === '05') {
    if (rest.startsWith('restaurant-reverify')) { step = 'restaurant-reverify'; rest = rest.slice(step.length); }
    else if (rest.startsWith('text-recategorize')) { step = 'text-recategorize'; rest = rest.slice(step.length); }
  } else if (STEP[nn] && rest.startsWith(STEP[nn])) rest = rest.slice(STEP[nn].length);
  const content = rest.replace(/^-/, '').trim();
  return `${date}_${nn}-${step}${content ? '_' + content : ''}.json`;
}
// ts|gemini {tag}-{ISO}.json → {date}_{source}-{tag}.json
function callStd(src: string, tail: string): string | null {
  const m = tail.match(/^(.+)-(\d{4}-\d{2}-\d{2})T[\d-]+Z\.json$/);
  if (!m) return null;
  const tag = m[1].replace(/[^0-9a-zA-Z]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'call';
  return `${m[2]}_${src}-${tag}.json`;
}
// 1회용/실험 = archive 대상
const isArchive = (base: string) =>
  /^restfill-sim-|^dup-deep-scan-|-test-|-100km-|^04-sim[AB]-|\.pretty\.json$|^05-text-recategorize-input-/.test(base);

(async () => {
  const pg = await import('pg');
  const c = new (pg as any).default.Client({ connectionString: process.env.SUPA_URL || process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  const cities = (await c.query(`SELECT id, name_en, latitude::float8 AS lat, longitude::float8 AS lng FROM cities WHERE latitude IS NOT NULL`)).rows;
  const objs = (await c.query(`SELECT name FROM storage.objects WHERE bucket_id='${BUCKET}' ORDER BY name`)).rows.map((r: any) => r.name);
  await c.end();

  const SUPA = process.env.SUPABASE_PUBLIC_URL || 'https://wxebceflvuythuodemro.supabase.co';
  const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_KEY;
  const get = (name: string) => fetch(`${SUPA}/storage/v1/object/${BUCKET}/${encodeURI(name)}`, { headers: { Authorization: `Bearer ${KEY}` }, signal: AbortSignal.timeout(20000) });

  const plan: any[] = [];
  for (const name of objs) {
    const parts = name.split('/'); const top = parts[0]; const seg2 = parts[1]; const base = parts.slice(2).join('/') || parts.slice(1).join('/');
    // 도시ID 폴더가 명시된 경우 (docs-raw|ts|gemini / {cityId} / ...)
    if (/^\d+$/.test(seg2)) {
      const baseName = parts.slice(2).join('/');
      if (top === 'docs-raw') {
        const s = isArchive(baseName) ? null : localStd(baseName);
        plan.push({ from: name, to: s ? `${seg2}/${s}` : `${seg2}/_archive/${baseName}`, act: s ? 'rename' : 'archive', city: seg2 });
      } else {
        const s = callStd(top, baseName);
        plan.push({ from: name, to: s ? `${seg2}/${s}` : `${seg2}/_archive/${baseName}`, act: s ? 'rename' : 'archive', city: seg2 });
      }
    } else if (seg2 === 'runtime') {
      // 도시ID 없음 = raw 좌표로 cities 최근접 복구 (= 사장님 SSOT: 응답 내용에 주소/좌표 있음)
      let coord: any = null;
      try {
        const j = await (await get(name)).json();
        const p = j.raw?.places?.[0];
        if (p?.location) coord = { lat: p.location.latitude, lng: p.location.longitude };
        else if (j.request?.latitude && j.request?.longitude) coord = { lat: j.request.latitude, lng: j.request.longitude };
      } catch { /* */ }
      if (coord) {
        let best: any = null, bk = 1e9;
        for (const ct of cities) { const km = hav(coord.lat, coord.lng, ct.lat, ct.lng); if (km < bk) { bk = km; best = ct; } }
        const s = callStd(top, parts.slice(2).join('/'));
        if (best && bk <= 80 && s) { plan.push({ from: name, to: `${best.id}/${s}`, act: 'rt-recover', city: String(best.id), cityName: best.name_en, km: Math.round(bk) }); continue; }
      }
      plan.push({ from: name, to: name, act: 'rt-keep' }); // 도시단서 없음 = runtime 보존
    } else {
      plan.push({ from: name, to: name, act: 'skip-unknown' });
    }
  }

  // ⚠️ 수정금지(승인필요) 2026-06-15 사장님 SSOT = 표준키 충돌 = 버전 순번 (= tag 로 구별 안 되는 다른 호출 = _1,_2 보존, 손실 0).
  //   = 단 내용 완전동일(rawHash 같음) = 진짜 중복 = 1개만 (= "같으면 삭제"). rawHash 다름 = 다른 호출 = 순번 분리 보존.
  //   = 같은날 같은 tag 여러 호출(Gemini 비결정 verify 4회 등)을 1개로 덮어 손실내던 게으른 분류 교정.
  const toGroups = new Map<string, any[]>();
  for (const p of plan) { if (p.act === 'rt-keep' || p.act === 'skip-unknown') continue; (toGroups.get(p.to) || toGroups.set(p.to, []).get(p.to))!.push(p); }
  for (const [to, group] of toGroups) {
    if (group.length <= 1) continue;
    // 충돌 그룹 = 내용(rawHash)으로 dedup → 고유 내용만 순번. rawHash 는 from 객체를 열어 계산(이동 전 1회).
    const withHash: any[] = [];
    for (const p of group) {
      try { const j = await (await get(p.from)).json(); const crypto = await import('crypto'); p._hash = crypto.createHash('md5').update(JSON.stringify(j.raw ?? {})).digest('hex'); }
      catch { p._hash = p.from; } // 못 열면 from 으로 고유 취급(보존)
      withHash.push(p);
    }
    const seen = new Map<string, number>(); // hash → 부여된 순번
    let uniqIdx = 0;
    const m = to.match(/^(.*)\.json$/)!;
    for (const p of withHash) {
      if (seen.has(p._hash)) { p.act = 'dup-skip'; p.to = `(중복=${to})`; continue; } // 내용 동일 = 진짜 중복 = 1개만
      uniqIdx++;
      seen.set(p._hash, uniqIdx);
      p.to = `${m[1]}_${uniqIdx}.json`; // 버전 순번 (날짜_source-tag_1.json ...)
    }
  }

  // 충돌 검증 (= 순번 부여 후 = 0 이어야 함)
  const tos = plan.filter((p) => p.act !== 'rt-keep' && p.act !== 'skip-unknown' && p.act !== 'dup-skip').map((p) => p.to);
  const dupes = [...new Set(tos.filter((t, i) => tos.indexOf(t) !== i))];
  const cnt = (a: string) => plan.filter((p) => p.act === a).length;
  console.log(`═══ storage-raw-restructure ${apply ? '(APPLY)' : '(DRY)'} = 총 ${plan.length} ═══`);
  console.log(`rename ${cnt('rename')} / archive ${cnt('archive')} / rt복구이동 ${cnt('rt-recover')} / rt보존 ${cnt('rt-keep')} / 중복삭제 ${cnt('dup-skip')} / unknown ${cnt('skip-unknown')}`);
  console.log(`충돌(순번부여 후 잔여 dupes) = ${dupes.length}`);
  // 순번 부여된(버전) 항목 표시
  const versioned = plan.filter((p) => /_\d+\.json$/.test(p.to || '') && p.act !== 'dup-skip');
  if (versioned.length) { console.log(`\n[버전 순번 부여] ${versioned.length}건 (= tag 구별 안 되는 다른 호출):`); versioned.forEach((p) => console.log(`  ${p.from.split('/').pop()}\n   → ${p.to}`)); }
  const dupSkipped = plan.filter((p) => p.act === 'dup-skip');
  if (dupSkipped.length) { console.log(`\n[내용동일 중복삭제] ${dupSkipped.length}건:`); dupSkipped.forEach((p) => console.log(`  ${p.from.split('/').pop()} ${p.to}`)); }
  dupes.slice(0, 10).forEach((d) => console.log('  ⚠️ DUP:', d));
  for (const act of ['rename', 'archive', 'rt-recover', 'rt-keep']) {
    const ex = plan.filter((p) => p.act === act).slice(0, 3);
    if (ex.length) { console.log(`\n[${act}] 샘플:`); ex.forEach((p) => console.log(`  ${p.from}\n   → ${p.to}${p.cityName ? ` (${p.cityName} ${p.km}km)` : ''}`)); }
  }

  if (!apply) { console.log(`\n=== DRY 완료 (--apply 로 이동) ===`); return; }
  if (dupes.length) { console.error(`\n✗ 충돌 ${dupes.length}건 = 중단 (수동 확인 필요)`); return; }

  // 집행 = 다운 → 표준경로 PUT → 옛 삭제
  let moved = 0, err = 0;
  for (const p of plan) {
    if (p.act === 'rt-keep' || p.act === 'skip-unknown' || p.from === p.to) continue;
    try {
      const body = Buffer.from(await (await get(p.from)).arrayBuffer());
      const put = await fetch(`${SUPA}/storage/v1/object/${BUCKET}/${encodeURI(p.to)}`, {
        method: 'PUT', headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', 'x-upsert': 'true' }, body, signal: AbortSignal.timeout(20000),
      });
      if (!put.ok) { err++; console.error(`  ✗ PUT ${p.to}: ${put.status}`); continue; }
      const del = await fetch(`${SUPA}/storage/v1/object/${BUCKET}/${encodeURI(p.from)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${KEY}` }, signal: AbortSignal.timeout(20000) });
      if (!del.ok) { console.error(`  ⚠️ PUT ok but DEL 실패 ${p.from}: ${del.status}`); }
      moved++;
    } catch (e: any) { err++; console.error(`  ✗ ${p.from}: ${e.message}`); }
  }
  console.log(`\n═══ 이동 ${moved} / 실패 ${err} (rt보존 ${cnt('rt-keep')}) ═══`);
})();
