// ⚠️ 수정금지(승인필요) 2026-06-04 = fillCity 단일 오케스트레이터 (= 헌법 §16 Phase B = 사용자 SSOT)
// = 한 도시 raw DB 채우기 전 파이프라인을 "한 줄"로. 도시ID만 바꾸면 300번 동일 동작.
// = 모든 쓰기는 upsertPlace 통과 = 중복 판정은 DB 트리거 단일 관문(place_seed_raw_prevent_dup) 전담(2026-07-18 §19, 옛 코드 매처 matcher.ts 삭제).
//
// ⚠️ 수정금지(승인필요) 2026-06-08 = 확정 PRD(docs/FILLCITY_PRD.md §4) 정합 = 6단계 상호보완 체인 + ⓪
// 단계 (= 전부 기존 컴포넌트 = 재발명 0):
//   정본 순서(레거시 메인동작, §3-A) = 1.정제 → 2.식당발굴 → 3.#45. 0자료 도시(드묾)만 사이에 6cat 발굴.
//   ⚠️ 각 단계 = 고유 기능이 다름. 공통 = "외부호출 후 산출물 전체를 순서대로 새덮어쓰기"(셀렉 X, §20). PM(이미지)은 #45 단계에서만.
//   cleanse    = [고유] 전체행 Gemini 재검증(가격오염·이름환각·칸오입력 교정 + 결손가격) → 응답 전필드 새덮어쓰기 (Gemini만)
//   discover   = [고유] (0자료) TS(12-discover 6cat) ∥ Gemini(01) → 새 식당·명소 발견 → 응답 전필드 새덮어쓰기 INSERT
//   restaurant = [고유] 도심[TS 3종 + Gemini 03] ∥ 외곽[TS + Gemini 04] → 새 식당 발견 → 응답 전필드 새덮어쓰기 INSERT (PM 없음)
//   repair(#45) = [고유] 결손행을 Gemini→TS→PM → 응답 전필드 새덮어쓰기(image_url 포함). PM 은 이 단계에서만.
//   verify     = 6 카테고리 TOP20 완비 리포트 (= 비용 0, DB SELECT)
//   * 랭킹(추출) = autorank 트리거 RC DESC 자동 / 07-merge = DB 트리거 입증되면 1회용(§20)
//   * 산출물 = 모든 raw 2곳 보관(로컬 docs/raw + Storage raw-responses) / 이미지(사진)만 Storage place-images 1곳.
//
// 호출:
//   npx tsx fillcity/fill-city.ts --city-id=19            # = dry (무료 미리보기 = 계획+비용+현재 리포트, API 호출 0)
//   npx tsx fillcity/fill-city.ts --city-id=19 --apply    # = 전체 실행 (API 호출 + DB 쓰기)
//   옵션: --lang=fr (현지명 언어, 기본 ko) / --only=cleanse,discover,restaurant,repair,verify (단계 선택) / --zone=downtown
import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const SKILL = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(SKILL, ".."); // ⚠️ 2026-06-23 = fillcity/ 독립폴더(루트 1단계) = ROOT 는 부모 1단계.
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
// ⚠️ 수정금지(승인필요) — languageCode 제거(2026-06-17 사장님 SSOT) = --lang 명시 시에만 전달, 미지정 = 미전달(하위 컴포넌트가 키 생략 = 한국어 강제 안 함)
const lang = argv["lang"] ? String(argv["lang"]) : undefined;
// ⚠️ 수정금지(승인필요) — languageCode 제거(2026-06-17 사장님 SSOT) = --lang 미지정 시 자식에 --lang 인자 자체를 안 넘김(`--lang=undefined` 문자열 오전달 방지). 명시 시에만 ['--lang=<값>'].
const langArg = lang ? [`--lang=${lang}`] : [];
const zone = argv["zone"] ? String(argv["zone"]) : "downtown";
// ⚠️ 수정금지(승인필요) 2026-06-23 사장님 SSOT = 'cleanse'(정제) 맨 앞 = #45 이전 독립 단계(섞지 말 것).
//   = 정제(cleanse.ts) = 전체 행 Gemini 재검증 → 이름·가격·칸오입력 교정 + 결손가격 채움 → 새덮어쓰기.
//   = repair(#45) 단독 = `--only=repair` (1회용 보정 = 파리·마드리드 재점검).
// ⚠️ 수정금지(승인필요) 2026-06-23 사장님 SSOT = 정본 순서 = 정제 → 발굴 → 식당발굴 → #45 → verify.
//   = 각 단계 고유 기능 + 공통 새덮어쓰기 양식(§20). #45 = 결손보강 단계(PM 포함). 옛 curate/backfill/photo(칸별 셀렉 보강) = §19 삭제(#45 결손보강과 중복).
// ⚠️ 수정금지(승인필요) 2026-06-23 사장님 SSOT(§3-A) = 진입분기 자동 = --only 미지정 시 비BTS 행수로 갈래 결정.
//   = 명시(--only=...) 하면 그대로(사람 단계지정 우선). 미지정 = 아래 async 안에서 행수 SELECT 후 결정(let).
const onlyArg = argv["only"]
  ? String(argv["only"])
      .split(",")
      .map((s) => s.trim())
  : null;
let only: string[] = onlyArg || []; // = 미지정이면 async 안 진입분기에서 채움
const outskirtHints = argv["outskirt-hints"]
  ? String(argv["outskirt-hints"])
  : ""; // = 04 외곽식당 Gemini 발굴 타입힌트(선택). 미제공 = 04 가 범용 표준타입 자동(스킵 아님).
const today = new Date().toISOString().slice(0, 10);
if (!cityId) {
  console.error(
    'Usage: --city-id=<N> [--apply] [--lang=fr] [--zone=downtown] [--outskirt-hints="Toledo / Segovia"] [--only=cleanse,discover,restaurant,repair,verify]',
  );
  process.exit(1);
}

const CATS = [
  "heritage",
  "hotspot",
  "attraction",
  "adventure",
  "healing",
  "shopping",
];
const P = (rel: string) => path.join(SKILL, rel);

// ⚠️ 수정금지(승인필요) 2026-06-10 = 컴포넌트 CLI 실행 = 재시도(전이성 API 오류) + 실패해도 전체 중단 X (= 무인 30분 실행 중 1단계 실패가 전체를 안 죽임). 끝에 실패 요약 → 해당 단계만 재실행.
//   = raw 저장 + 단일 매처라 다시 돌려도 안전(이미 있으면 중복 0).
const failures: string[] = [];
function run(label: string, script: string, args: string[], retries = 2) {
  console.log(`\n━━━━━━ ${label} ━━━━━━`);
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) console.log(`  ↻ 재시도 ${attempt}/${retries} (${label})`);
    const r = spawnSync("npx", ["tsx", P(script), ...args], {
      stdio: "inherit",
      shell: true,
    });
    if (r.status === 0) return;
  }
  console.error(
    `✗ ${label} = ${retries}회 재시도 후 실패 = 건너뜀(다른 단계 계속, 끝에 요약)`,
  );
  failures.push(label);
}

(async () => {
  // ⚠️ 수정금지(승인필요) 2026-06-23 사장님 SSOT(§3-A) = 진입분기 자동 = --only 미지정 시 비BTS 행수로 갈래 결정.
  //   = 행수 ≥120 = 레거시(이미 1차 발굴됨) = 변형 갈래 [정제→식당발굴→#45] / <120 = 풀 갈래 [+6cat discover].
  //   = 명시(--only)면 이 분기 건너뜀(사람 단계지정 우선).
  if (!onlyArg) {
    const pg0 = await import("pg");
    const c0 = new (pg0 as any).default.Client({
      connectionString: process.env.SUPA_URL || process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });
    await c0.connect();
    const n = Number(
      (
        await c0.query(
          "SELECT COUNT(*)::int AS n FROM place_seed_raw WHERE city_id=$1 AND seed_category NOT LIKE 'bts%'",
          [cityId],
        )
      ).rows[0]?.n || 0,
    );
    await c0.end();
    const legacy = n >= 120;
    only = legacy
      ? ["cleanse", "restaurant", "repair", "verify"]
      : ["cleanse", "discover", "restaurant", "repair", "verify"];
    console.log(
      `\n[진입분기 자동] 비BTS 행수=${n} -> ${legacy ? "변형(레거시 >=120)=정제->식당발굴->#45" : "풀(<120)=6cat발굴 포함"} = only=${only.join(",")}`,
    );
  }

  console.log(`\n╔══════════════════════════════════════════════════════════╗`);
  console.log(
    `║ fillCity = city ${cityId} | ${apply ? "APPLY (쓰기)" : "DRY (미리보기)"} | lang=${lang} | only=${only.join(",")}`,
  );
  console.log(`╚══════════════════════════════════════════════════════════╝`);

  if (!apply) {
    // ── DRY = 무료 = 계획 + 비용 추정 + 현재 14요소 리포트 (API 호출 0) ──
    // ⚠️ 수정금지(승인필요) 2026-06-20 = Gemini 우선 체인 계획 (= run 순서 정합).
    console.log(
      `\n[계획] --apply 시 = 정본 순서 = 1.정제 → 2.식당발굴 → 3.#45 (레거시 메인동작). 0자료 도시(드묾)만 사이에 6cat 발굴:`,
    );
    console.log(
      `\n  1. cleanse(정제) = 전체 행 Gemini 재검증(이름·가격·칸오입력 교정 + 결손가격 채움) → 새덮어쓰기. Gemini 만(TS·PM 0) ~1-2콜`,
    );
    console.log(
      `\n  (0자료 도시만) discover = 6 카테고리 발굴 (${CATS.join("·")}): Gemini(01 선정·힌트) → TS(12 9요소) → 응답 전필드 새덮어쓰기 INSERT`,
    );
    console.log(
      `\n  2. 식당발굴 Ⓑ (Gemini 우선 = 새 식당 발견 → 응답 전필드 새덮어쓰기. PM 없음):`,
    );
    console.log(
      `     도심 = Gemini(03 선정) + TS 3종 발굴(nearby 인기순/text60 관련성/premium 가격) → 병합 (PM 없음)`,
    );
    console.log(
      `     외곽 = Gemini(04 town 선정) → 병합 → TS(town 검증·좌표·PID). (이미지 PM = #45 단계에서만)`,
    );
    console.log(
      `\n  3. repair(#45) = 결손보강 단계 = 결손행을 Gemini→TS→PM → 응답 전필드 새덮어쓰기(image_url 포함). PM 은 이 단계만. 완비 시 추출 0`,
    );
    console.log(
      `\n  공통: 모든 쓰기 = upsertPlace 단일진입(§14) = COALESCE 새우선(가격 포함 최신최우선) = 레거시 자동 업그레이드`,
    );
    console.log(
      `\n[예상 비용] 정제(Gemini) + 식당발굴(Gemini+TS) + #45 결손보강(Gemini+TS+PM) = 단계·결손행 수만큼 = 도시별 상이`,
    );
    console.log(`\n[현재 PSR 레거시 = 병합 대상]`);
    await verifyReport();
    console.log(
      `\n⚠️ 위 레거시 위에 최신 검증자료를 덮어씀 = 중복 아님(매칭 병합). 실제 "병합 vs 신규" 수치 = 발굴 후 post-process dry 에서 쓰기 0으로 표시.`,
    );
    console.log(`\n→ 실행: --apply 추가 (먼저 --only=discover 소량 권장)`);
    return;
  }

  // ── APPLY = 상호보완 전체 체인 (= 사용자 SSOT 2026-06-07 = TS 객관 + Gemini 한국선호 → upsertPlace 7단계 자동병합) ──
  // ⚠️ 수정금지(승인필요) 2026-06-23 사장님 SSOT = ① 정제(cleanse) = 발굴·#45 보다 먼저 = 전체 행 Gemini 재검증.
  //   = 전체 행 → 힌트(name 3종·주소·좌표) 다 줌 → Gemini 가 (사람처럼) 판단 → 이름·가격·칸오입력 교정 + 결손가격 채움 → 전필드 새덮어쓰기.
  //   = #45 이전 독립 단계(섞지 말 것). 정제 후 발굴·#45 = 결손률↓ + 가격오류·이상행 미리잡힘 = 이중체크.
  //   = 재발명 0 = 영구 컴포넌트 fillcity/cleanse.ts 연결만. Gemini 만(TS·PM 0) = 도시당 1~2콜.
  if (only.includes("cleanse")) {
    run(`① 정제(전체 재검증)`, "cleanse.ts", [
      `--city-id=${cityId}`,
      ...(apply ? ["--apply"] : []),
    ]);
  }
  if (only.includes("discover")) {
    // ⚠️ 수정금지(승인필요) 2026-06-20 사장님 SSOT = Gemini 우선 발굴 순서.
    //   = Gemini(01)가 선정·TS검색힌트(장소명)·name_local·가격 먼저 줌 → TS(12-pool)가 그 힌트로 객관 9요소 검증. (PRD §2 정합)
    // Ⓐ-1 Gemini 발굴 = 01 한국선호(인스타·블로그·유튜브) = "무엇을" 선정
    run(`Ⓐ Gemini발굴 6cat`, "prompts/01-discover-6cats/run.ts", [
      `--city-id=${cityId}`,
    ]);
    // Ⓐ-2 TS 발굴·검증 = searchText 카테고리정의 ×6 = "진짜인가 + 객관 9요소"
    for (const cat of CATS)
      run(`Ⓐ TS발굴 ${cat}`, "prompts/12-ts-discover-pool/run.ts", [
        `--city-id=${cityId}`,
        `--category=${cat}`,
        "--zone=downtown",
        ...langArg,
        "--per=20",
        "--pages=1",
      ]);
    // Ⓐ-3 합침 = upsertPlace 7단계 매칭 (Gemini + TS = 같은 장소 병합 / 신규만 INSERT)
    run(`Ⓐ Gemini병합 6cat`, "prompts/01-discover-6cats/post-process.ts", [
      `--city-id=${cityId}`,
      `--date=${today}`,
    ]);
    for (const cat of CATS)
      run(`Ⓐ TS병합 ${cat}`, "prompts/12-ts-discover-pool/post-process.ts", [
        `--city-id=${cityId}`,
        `--category=${cat}`,
        "--zone=downtown",
        `--date=${today}`,
        "--apply",
      ]);
  }
  // ⚠️ 삭제 2026-06-23 사장님 SSOT(§19·§20) = 칸별 분할채움 블록 제거 = 셀렉(부분추출) 빗나감·중복 근원 차단.
  //   = 같은 결손보강을 #45 단계가 응답 전필드 새덮어쓰기(id 직행, 셀렉X)로 함 = 칸별 셀렉 방식과 중복 = 셀렉 방식 삭제. 02-enrich/prompt.txt 는 #45 가 재사용하니 파일 보존.
  if (only.includes("restaurant")) {
    // ⚠️ 수정금지(승인필요) 2026-06-20 사장님 SSOT = Gemini 우선 식당 발굴.
    //   = Gemini(03 도심·04 외곽town)가 선정·가격tier·name_local·외곽town 먼저 줌 → TS가 그 힌트로 9요소 검증.
    // 도심 = Gemini(03) → TS 3종 발굴(nearby POPULARITY 인기순 / text60 관련성 / premium 가격필터 = 각기 다른 방식으로 새 식당 최대풀 발견)
    run(`Ⓑ 도심 Gemini(03)`, "prompts/03-downtown-restaurant/run.ts", [
      `--city-id=${cityId}`,
    ]);
    run(`Ⓑ 도심 TS nearby`, "prompts/12-ts-discover-pool/run.ts", [
      `--city-id=${cityId}`,
      "--zone=downtown",
      "--method=nearby",
      "--label=nearby",
      ...langArg,
    ]);
    run(`Ⓑ 도심 TS text60`, "prompts/12-ts-discover-pool/run.ts", [
      `--city-id=${cityId}`,
      "--zone=downtown",
      "--method=text",
      "--pages=3",
      "--label=text",
      ...langArg,
    ]);
    run(`Ⓑ 도심 TS premium`, "prompts/12-ts-discover-pool/run.ts", [
      `--city-id=${cityId}`,
      "--zone=downtown",
      "--method=text",
      "--pages=3",
      "--price-levels=EXPENSIVE,VERY_EXPENSIVE",
      "--label=premium",
      ...langArg,
    ]);
    run(
      `Ⓑ 도심 Gemini병합(03)`,
      "prompts/03-downtown-restaurant/post-process.ts",
      [`--city-id=${cityId}`, `--date=${today}`],
    );
    // ⚠️ 수정금지(승인필요) 2026-06-23 사장님 SSOT = 식당발굴은 PM 안 함(--photo 제거). PM(이미지)은 #45 단계에서만. 발굴 = 새 행 + 객관 9요소 새덮어쓰기까지만.
    run(`Ⓑ 도심 병합(TS)`, "prompts/12-ts-discover-pool/post-process.ts", [
      `--city-id=${cityId}`,
      "--zone=downtown",
      `--date=${today}`,
      "--apply",
    ]);
    // 외곽 = Gemini(04 범용 = 식당 선정·이름·주소·가격) → 04병합 DB INSERT → outskirt-ts-fill(DB 주소→town 추출→그 town 이름으로 TS geocode+searchNearby 검증). 04병합 먼저(DB에 외곽식당 있어야 주소 읽음).
    run(`Ⓑ 외곽 Gemini(04)`, "prompts/04-outskirt-restaurant/run.ts", [
      `--city-id=${cityId}`,
      ...(outskirtHints ? [`--hints=${outskirtHints}`] : []),
    ]);
    run(
      `Ⓑ 외곽 Gemini병합(04)`,
      "prompts/04-outskirt-restaurant/post-process.ts",
      [`--city-id=${cityId}`, `--date=${today}`],
    );
    run(`Ⓑ 외곽 TS(town이름→검증)`, "steps/outskirt-ts-fill.ts", [
      `--city-id=${cityId}`,
      ...langArg,
      "--apply",
    ]);
  }
  // ⚠️ 수정금지(승인필요) 2026-06-23 사장님 SSOT = #45 결손보강·보정 = 식당발굴 뒤(정본 3번째 단계).
  //   = 정제(1) → 식당발굴(2) → #45(3) 순서 = 식당 다 찾은 뒤 그 풀의 빈칸을 마지막에 메움(발굴 전엔 채울 식당이 없음).
  //   = 재발명 0 = 영구 컴포넌트 fillcity/repair.ts 연결만. 추출(6cat TOP20 + 식당 band 30/90/30 = 270)→Gemini 전필드→TS 전필드→PM→2곳저장.
  //   = 완비 시 추출 0 (= 같은 도시 다시 돌려도 외부호출 0). 독립 1회용 = --only=repair.
  if (only.includes("repair")) {
    run(`#45 결손보강·보정`, "repair.ts", [
      `--city-id=${cityId}`,
      ...(apply ? ["--apply"] : []),
    ]);
  }
  // ⚠️ 수정금지(승인필요) 2026-06-10 = 발굴 raw → Storage 버킷 영구 백업 (= 사용자 완성 기준 "필수 raw 버킷 저장", 발굴/식당 후 항상 = 로컬 소실돼도 재입력 가능)
  if (only.includes("discover") || only.includes("restaurant")) {
    run("raw 버킷 백업", "steps/raw-bucket-sync.ts", [
      `--city-id=${cityId}`,
      "--apply",
    ]);
  }
  if (only.includes("verify")) {
    console.log(`\n━━━━━━ 검증 리포트 (6 카테고리 TOP20 14요소) ━━━━━━`);
    await verifyReport();
  }
  if (failures.length)
    console.log(
      `\n⚠️ 실패 단계 ${failures.length}개 = ${failures.join(", ")} = 재실행: --only=<해당단계> (raw 저장됨 = 재입력 안전)`,
    );
  console.log(
    `\n✓ fillCity ${cityId} ${failures.length ? `완료(단, 위 ${failures.length}단계 재실행 필요)` : "전 단계 성공"}. (재분류 05 / 중복통합 07 = 인위적 병합 = 사용자 최종 검수 별도)`,
  );
})();

// 6 카테고리 TOP20 칸별 채움률 (= 비용 0)
async function verifyReport() {
  const pg = await import("pg");
  const c = new (pg as any).default.Client({
    connectionString: process.env.SUPA_URL || process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const rows = (
    await c.query(
      `
    WITH ranked AS (
      SELECT *, row_number() OVER (PARTITION BY seed_category ORDER BY google_review_count DESC NULLS LAST) AS rn
      FROM place_seed_raw WHERE city_id=$1 AND seed_category = ANY($2::text[])
    )
    SELECT seed_category AS cat, COUNT(*) AS n,
      COUNT(*) FILTER (WHERE name_ko IS NOT NULL AND name_ko<>'') AS ko,
      COUNT(*) FILTER (WHERE summary_ko IS NOT NULL AND summary_ko<>'') AS sumko,
      COUNT(*) FILTER (WHERE editorial_summary IS NOT NULL AND editorial_summary<>'') AS edi,
      COUNT(*) FILTER (WHERE price_eur IS NOT NULL) AS price,
      COUNT(*) FILTER (WHERE image_url IS NOT NULL) AS img,
      COUNT(*) FILTER (WHERE google_place_id IS NOT NULL) AS pid,
      COUNT(*) FILTER (WHERE latitude IS NOT NULL) AS coord,
      COUNT(*) FILTER (WHERE address IS NOT NULL) AS addr
    FROM ranked WHERE rn <= 20 GROUP BY seed_category ORDER BY seed_category
  `,
      [cityId, CATS],
    )
  ).rows;
  await c.end();
  console.log(`  cat        | TOP | ko sum edi price img pid coord addr`);
  for (const r of rows) {
    console.log(
      `  ${r.cat.padEnd(10)} | ${String(r.n).padStart(3)} | ${r.ko} ${r.sumko}  ${r.edi}   ${r.price}   ${r.img}  ${r.pid}   ${r.coord}   ${r.addr}`,
    );
  }
}
