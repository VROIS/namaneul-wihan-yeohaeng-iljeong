// ⚠️ 수정금지(승인필요) 2026-08-27 사장님 SSOT = 사장님 확정("PID 가 있으니 구글맵을 열어 내용을 입력하면 될 일 — TS 다시 하지 마라") = PID 행을 구글맵 공개 페이지(place_id 링크)로 채움·재확인(유료 API 0). 기본 = 현지어이름·주소 빈 행만 채움 / --verify(2026-08-28 사장님 확정) = 도시의 전 PID 행 오염 재확인 모드 = 풀주소·영어명(빈 칸만)·좌표·리뷰수·영업상태 최신화(사진은 PM 담당 = 여기서 안 함).
// = 사장님 확정 범위(2026-08-28): "사진은 PM(PID)로. 풀주소·영어명/정식이름·좌표·리뷰수·영업상태만 가져오고, 제일 중요한 건 우리 행의 PID 가 같은 장소를 가리키는지(오염 재확인). 그것만 가져와 해당 컬럼을 채운다."
// = 대상: 기본 모드 = PID 있음 + name_local 빈값 + address 빈값 + bts_* 제외(bts2026 6월 배치 1,295행/35도시 등). --verify = PID 있음 + bts_* 제외 전 행. --ids/--limit 은 두 모드 공통.
//   관문 트리거(prevent_dup)는 주소·현지명으로 같은 장소를 판정하므로 빈 행은 raw 변형(보고타 "Santa Clara Museum" ↔ #60651 "Museo Santa Clara")을 영원히 흡수 못 함 = 그래서 채움.
// = 방법: Playwright(chromium headless, node_modules 동봉) 로 https://www.google.com/maps/place/?q=place_id:<PID>&hl=<현지어> 1장을 열어
//   h1 → name_local, button[data-item-id="address"] aria-label → address, URL @lat,lng → 좌표, div.F7nice 안 aria-label("14,572 reviews"/"4.3 stars") → 리뷰수(google_review_count)·별점(기록만),
//   본문 "Permanently closed/Temporarily closed"(현지어 동의어 포함) → business_status(OPERATIONAL|CLOSED_PERMANENTLY|CLOSED_TEMPORARILY), 카테고리 라벨 = 기록만(DB 안 씀).
//   &hl=en 페이지 = 우리 name_en 이 빈 행(→ name_en 채움) 또는 현지어 h1 과 이름이 안 겹친 행(영어 정식명으로 재대조)에서만 1장 더. &hl=ko 페이지 = 기본 모드에서만(name_ko 한글 표기), --verify 는 생략(시간 절약).
//   동의 인터스티셜(consent.google.com) = "모두 수락" 계열 버튼 1회 클릭(브라우저 1개·컨텍스트 1개 재사용 = 이후 페이지는 안 뜸).
// = 관문(sanity gate, 두 모드 동일): h1 빈값·동의창 제목 = 스킵 / 이름 관문 = 우리 name_en 과 페이지 h1(현지어, 안 겹치면 영어 h1 재대조)을 토큰화(소문자·악센트 제거·3자+·불용어 제외)해 공통 토큰 0 = 이름 불일치. name_en 이 한글(레거시 음역, 예 "안젤리나")이면 문자체계가 달라 절대 안 겹치므로 name_en 빈 행과 동일하게 대조 불가(좌표 관문만) 처리(2026-08-28 사장님 지시, Paris #67731 등 9행 오탐 수리).
//   ⚠️ 2026-08-28 사장님 지시 = 주소 빈값은 더 이상 단독 스킵이 아님(광장·거리·구역은 구글이 번지주소를 안 줘도 실재 장소, 예 Place de la Concorde). 이름·좌표 관문을 먼저 판정 → 통과하면 ok(no-address)(쓰기함, address 는 null 로 넘겨 COALESCE 로 기존값 보존) / 그 판정도 실패(name-mismatch·coord-mismatch·coord-corrected 였을 행)면 address-empty-ambiguous(끝에 id 목록, 안 씀).
//   토큰 공통 판정(2026-08-28 사장님 지시) = 같거나 앞 5글자+ 공통 접두(planetari|planetario 같은 영어·현지어 어미 차이 = 같은 장소).
//   ⚠️ 2026-08-28 사장님 지시 = 구글 페이지가 진실 = 이름 강일치(name_match=strong) + 행 좌표 vs 페이지 @lat,lng 2km 초과 = coord-corrected = "우리 좌표 오염" = 페이지 좌표로 덮어 씀(+나머지 컬럼) = "좌표 교정" 목록(old→new 거리).
//   ⚠️ 2026-08-28 사장님 지시(시카고 #60631 사고 수리) = 이름 일치 강도 = strong(공통 토큰 2개+ / 작은 쪽 토큰 집합(2개+)의 60%+ / 정규화 이름 한쪽이 다른 쪽을 포함) · weak(공통 토큰 1개뿐). 2km 이내 = weak 도 통과(같은 장소의 번역 변형) / 2km 초과 = strong 만 coord-corrected, weak = coord-mismatch(안 씀, "이름 약일치").
//   이름 관문 실패 = 좌표 2km 이내면 name-mismatch / 2km 초과면 coord-mismatch = 둘 다 "오매칭 의심"(DB 안 씀). URL 에 좌표 안 뜨면 ok(coord-unverified) 로 기록만·쓰기는 진행. 폐업(CLOSED_*) 행 = 쓰기 대상이면 business_status 를 쓰고 "폐업·휴업" 목록으로 따로 보고(서빙 관문 제외 근거).
//   ⚠️ 2026-08-28 사장님 지시(서울 hl=ko 191행 사고 2건 수리) = ① 리뷰수 = 언어별 단어 패턴(reviews/리뷰 N개/件のクチコミ/条评价…)으로만 읽고 별점(4.6→46)·"(N)" 소수 오독은 거부(rc_unparsed = RC 안 씀) / 우리 RC 의 1/5 미만 급락(우리 RC≥200, 1000 단위 가짜 시드 제외) = rc_suspicious = RC 안 씀 = 둘 다 목록 보고.
//   ② 페이지 @lat,lng 가 도시 중심(cities.latitude/longitude) 150km 초과 = 지도 기본(세계) 뷰 좌표 = page-coord-invalid = 좌표만 안 쓰고 나머지 컬럼은 씀(coord-corrected 절대 아님) = 목록 보고. coord-corrected = 2km < 거리 ≤ 150km + 이름 강일치(strong)만.
// = 쓰기 = --apply 시에만(ok·coord-corrected 행), upsertPlace(targetRowId 직행, §14 COALESCE 새것 우선) 로 name_local·address·name_ko·latitude·longitude·google_review_count·business_status + name_en(우리 값 없을 때만 페이지 영어명). 이미지·가격·PID 안 넘김 = 뼈대 보존. phase_tags = gmaps-pid-verify-<오늘>.
// = 산출표 = docs/b1-reports/{cityId}/{YYYY-MM-DD}_gmaps-pid-identity.json (shared/raw-filename versionedName·rawHash = B1 동일 패턴) = 사장님 검수용. DRY 도 저장. 요약 = ok / name-mismatch / coord-corrected / coord-mismatch / closed / errors + RC 갱신 n행(평균 변화) + address-empty-ambiguous id 목록.
// = 언어: --lang 명시 > cities.primary_language > 'en'.
// CLI: npx tsx server/services/fill/gmaps-pid-identity.ts --city-id=125 [--verify] [--apply] [--limit=3] [--ids=60648,60651] [--lang=es]
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { chromium } from "playwright";
import { BROWSER_UA } from "./gmaps-pid-identity/page-reader";
import {
  evaluateRow,
  initResult,
  isWritable,
  nameTokens,
  type Result,
  type Row,
} from "./gmaps-pid-identity/gates";
import { writeRow } from "./gmaps-pid-identity/apply";
import { printAndSaveReport } from "./gmaps-pid-identity/report";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");
process.chdir(ROOT);
const envRaw = fs.readFileSync(".env", "utf-8").replace(/^﻿/, "");
for (const line of envRaw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) {
    let v = m[2].trim();
    if (/^['"]/.test(v)) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}
const argv = Object.fromEntries(
  process.argv
    .slice(2)
    .map((a) => a.replace(/^--/, "").split("="))
    .map(([k, v]) => [k, v ?? "true"]),
);
const cityId = Number(argv["city-id"] || 0);
const apply = argv["apply"] === "true";
// ⚠️ 수정금지(승인필요) 2026-08-28 사장님 확정 = --verify = 도시의 전 PID 행(bts_* 제외) 오염 재확인 + 리뷰수·영업상태·좌표 최신화 모드.
const verify = argv["verify"] === "true";
const limit = argv["limit"] ? Number(argv["limit"]) : 0;
const ids = argv["ids"]
  ? String(argv["ids"])
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0)
  : [];
if (!cityId) {
  console.error(
    "Usage: --city-id=<N> [--verify] [--apply] [--limit=K] [--ids=1,2,3] [--lang=es]",
  );
  process.exit(1);
}

(async () => {
  const { upsertPlace } = await import(
    pathToFileURL(path.join(ROOT, "server/services/place-upsert.ts")).href
  );
  const { distanceKmFromCoords } = await import(
    pathToFileURL(path.join(ROOT, "server/services/shared/pool-radius.ts")).href
  );
  const pg = await import("pg");
  const c = new (pg as any).default.Client({
    connectionString: process.env.SUPA_URL || process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const city = (
    await c.query(
      "SELECT name_en, country_code, primary_language, latitude::float8 AS lat, longitude::float8 AS lng FROM cities WHERE id=$1",
      [cityId],
    )
  ).rows[0];
  if (!city) {
    await c.end();
    console.error(`✗ city ${cityId} 미존재`);
    process.exit(1);
  }
  // ⚠️ 수정금지(승인필요) 2026-08-28 사장님 지시 = 도시 중심 1회 로드 = 페이지 좌표 150km 유효 관문 기준.
  const cityLat: number | null = city.lat != null ? Number(city.lat) : null;
  const cityLng: number | null = city.lng != null ? Number(city.lng) : null;
  const lang = String(argv["lang"] || city.primary_language || "en");
  // 도시명 토큰 = 이름 관문 불용어에 추가(예: "Bogotá" 가 양쪽에 있어도 같은 장소 증거가 아님)
  const cityStop = nameTokens(city.name_en, new Set());

  // ⚠️ 수정금지(승인필요) 2026-08-28 사장님 확정 = 대상 = 기본: PID 있음 + name_local 빈값 + address 빈값 + bts_* 제외(채움 대상만) / --verify: PID 있음 + bts_* 제외 전 행(오염 재확인·최신화).
  const params: any[] = [cityId];
  let where = `city_id=$1 AND google_place_id IS NOT NULL AND google_place_id <> ''
       AND seed_category NOT LIKE 'bts_%'`;
  if (!verify) {
    where += `
       AND (name_local IS NULL OR name_local = '')
       AND (address IS NULL OR address = '')`;
  }
  if (ids.length) {
    params.push(ids);
    where += ` AND id = ANY($${params.length}::int[])`;
  }
  let rows: Row[] = (
    await c.query(
      `SELECT id, seed_category, name_en, google_place_id AS pid,
              latitude::float8 AS lat, longitude::float8 AS lng,
              google_review_count AS rc
         FROM place_seed_raw WHERE ${where} ORDER BY id`,
      params,
    )
  ).rows;
  if (limit > 0) rows = rows.slice(0, limit);
  console.log(
    `═══ gmaps-pid-identity (city ${cityId} ${city.name_en}, hl=${lang}) = ${verify ? "VERIFY(전 PID 행 재확인)" : "FILL(빈 행 채움)"} · 대상 ${rows.length}행 · ${apply ? "APPLY" : "DRY"} · 유료 API 0 ═══`,
  );

  const results: Result[] = [];
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent: BROWSER_UA,
  });
  const page = await ctx.newPage();
  const t0 = Date.now();
  try {
    for (const row of rows) {
      const r = initResult(row);
      try {
        await evaluateRow(
          {
            page,
            lang,
            verify,
            cityLat,
            cityLng,
            cityStop,
            distanceKmFromCoords,
          },
          row,
          r,
        );
      } catch (e: any) {
        r.gate = `error:${String(e?.message || e).slice(0, 80)}`;
      }

      if (apply && isWritable(r.gate))
        await writeRow(upsertPlace, cityId, row, r);
      results.push(r);
      console.log(JSON.stringify(r));
    }
  } finally {
    await browser.close().catch(() => {});
  }
  const elapsed = (Date.now() - t0) / 1000;

  printAndSaveReport({ results, elapsed, apply, cityId, verify, lang, ROOT });
  await c.end();
  process.exit(0);
})().catch((e) => {
  console.error("✗ 실행 실패:", e?.message || e);
  process.exit(1);
});
