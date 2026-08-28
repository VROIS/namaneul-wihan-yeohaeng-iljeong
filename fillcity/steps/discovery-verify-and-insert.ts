// ⚠️ 수정금지(승인필요) 2026-08-27 사장님 승인 = B2 입력 연결부(§16 영구 컴포넌트) = B1(④⑤) 실행부.
// = 목적: B1(discovery-merge-diff.ts) 산출표(docs/b1-reports/{cityId}) 3목록 처리.
//   · merge(A등급 = 불변5·6) = 기존 행 직행 UPDATE(best_rank·원어 카피·카테고리 태그, 외부호출 0).
//   · confirm(B등급 = 불변3 주소만·의심 영어명/한국어명 = 후보일 뿐) + new(정말 신규) = 같은 신규행 경로 1벌(verifyAndInsert):
//     TS 1콜 → upsertPlace 를 targetRowId 없이(정상 INSERT 경로) 호출 → 문지기 1단(PID)이 진짜 행을 정한다
//     (그 PID 행이 있으면 recoverTriggerDup 흡수 = action 'updated'·rowId 그 행 / 없으면 신규행 'inserted').
//     → best_rank + place_translations 한 트랜잭션 → PM 은 결과 행에 이미지가 없을 때만.
// = ⚠️ 수정금지(승인필요) 2026-08-27 사장님 확정 = PID = 호적(법적 이름표). 주소·영어명만 같은 후보(confirm)를 직행 병합하면
//   엉뚱한 행에 붙는다(Tour d'Argent → 루프탑 #76425 / Les Invalides → 나폴레옹 묘 #76447 실증) = TS PID 로만 확정.
//   confirm 항목마다 psrHint(문지기 후보)와 upsertPlace 결과 rowId 를 대조해 힌트행 흡수 / 다른 행 흡수 / 신규행 을 기록.
// = 비용 지점(🔴 승인 시에만): confirm·new 각 TS 1콜/곳 + 결과 행 이미지 결손 시 PM 1장/곳. merge 쪽은 전부 외부호출 0.
// = ⚠️ 2026-08-27 사장님 지시 = "TS+PM 은 승인 시에만, 9월1일 잔량 리셋되면 바로 호출될 수 있도록 코딩 우선".
//   → 이 파일은 --apply 없이는 DRY(외부호출 0·DB쓰기 0) = 오늘은 코드만 완성, 실제 실행은 9/1 이후 승인.
//   → 병합 쪽(외부호출 0)도 --apply 안에 같이 묶음(마스터플랜 원문 "B2 = 코드만 준비, 실행은 9/1 이후"에 맞춰
//     한 배치로 동시 실행 = 부분 실행으로 인한 상태 불일치 차단).
// = best_rank 컬럼 = place-upsert.ts(UpsertPayload)에 필드 없음(§14 보호파일, 아직 미배선) → 이 파일이 직접
//   단순 UPDATE(단일 비식별 정수, unique 제약 없음 = rc-rerank 2단계 기법 불필요)로 씀 = 보호파일 무변경.
//   §14 문지기(prevent_dup)는 이 컬럼 변경에도 전체 행 재검문하므로(식별컬럼 무관) app.skip_dup_check 정식 면제 통과(2026-07-18 SSOT 재사용).
// = best_rank 값 = 7자리 언어코드(1=ko 2=en 3=ja 4=fr 5=zh 6=es 7=de, 뽑은 언어 자리만 번호·나머지 0. 예 1234567 = 7개 언어 전부)
//   = 생성·정의 1벌 = server/services/shared/best-rank.ts bestRankCode(카피 언어들). 2026-08-27 사장님 확정.
//   계약 = 코드에 든 언어(ko 제외)마다 place_translations 행이 반드시 있다 → best_rank UPDATE 와 place_translations upsert 는
//   같은 트랜잭션(BEGIN..COMMIT) 안에서만 쓴다(병합·신규 양쪽 동일). 옛 제미니 순위 컬럼은 원천·컬럼 모두 완전삭제(2026-08-27 §19).
// = ⚠️ 수정금지(승인필요) 2026-08-27 사장님 확정 = best_rank 쓰기 = 행의 현재값 ∪ 이 그룹 코드(자리별 합집합, bestRankUnion 1벌).
//   B1 은 문지기가 같은 장소라 판정한 원시항목만 묶으므로 한 실제 장소가 여러 그룹으로 나뉘어 올 수 있다(오르세: ko/en/ja 그룹
//   → 1230000 / fr/zh/es/de 그룹 → TS→PID 로 같은 행). 병합·신규 양쪽 모두 같은 트랜잭션 안에서 FOR UPDATE 로 현재값을
//   잠가 읽은 뒤 합집합을 쓴다(경합 없음) → 먼저 온 언어가 지워지지 않는다. null 도 항상 명시적으로 씀(둘 다 null → null).
// = 카테고리 매핑: B1 의 랜드마크 cat(heritage|hotspot|attraction|adventure|healing|shopping) 과
//   restaurant 는 PSR seed_category 값과 1:1 동일(§16 새 매핑표 불필요).
//
// 호출:
//   npx tsx fillcity/steps/discovery-verify-and-insert.ts --city-id=125           (DRY, 외부호출 0)
//   npx tsx fillcity/steps/discovery-verify-and-insert.ts --city-id=125 --apply --merge-only            (merge 만, 외부호출 0)
//   npx tsx fillcity/steps/discovery-verify-and-insert.ts --city-id=125 --apply --merge-only --confirm  (merge + confirm = 🔴 TS confirm 수만큼)
//   npx tsx fillcity/steps/discovery-verify-and-insert.ts --city-id=125 --apply --force-quota   (🔴 전부 = merge + confirm + new)
//   npx tsx fillcity/steps/discovery-verify-and-insert.ts --city-id=125 --report=<path> (특정 B1 리포트 지정, 기본=최신)
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { latestVersioned } from "../../server/services/shared/raw-filename";
// ⚠️ 수정금지(승인필요) 2026-08-27 사장님 승인 = 7개 언어 목록 1벌 + best_rank 언어코드 생성 1벌(§16).
import { LANGS } from "../../server/services/shared/language-instruction";
// ⚠️ 수정금지(승인필요) 2026-08-28 사장님 승인 = best_rank 쓰기 트랜잭션(SELECT FOR UPDATE→합집합→조건부 UPDATE) 1벌
//   = writeBestRankUnion() = status-backfill.ts absorbTwinGroup() 과 공용(§16, 옛 이 파일 자체 구현 완전삭제).
import {
  bestRankCode,
  writeBestRankUnion,
} from "../../server/services/shared/best-rank";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
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
const forceQuota = argv["force-quota"] === "true";
// ⚠️ 수정금지(승인필요) 2026-08-27 사장님 지시 = 병합(외부호출 0)은 9/1 을 기다릴 이유가 없음 = B0 실제
//   작동 증명(성공판정 = 육안검수)을 오늘 바로 하기 위한 분리 실행. 신규(TS 유료) 구간은 완전히 건너뜀
//   = --merge-only 시 gateBatch 자체를 안 부름(외부호출 승인 절차 진입 자체가 없음).
const mergeOnly = argv["merge-only"] === "true";
// ⚠️ 수정금지(승인필요) 2026-08-27 사장님 확정 = --confirm = B1 confirm(B등급 후보) 목록을 신규행 경로로 처리(TS 1콜/곳 → PID 판정).
//   --merge-only 단독 = merge 만(외부호출 0) / --merge-only --confirm = merge + confirm / --merge-only 없음 = 전부(confirm + new 포함).
const confirmFlag = argv["confirm"] === "true";
if (!cityId) {
  console.error(
    "Usage: --city-id=<N> [--apply] [--force-quota] [--merge-only] [--confirm] [--report=<path>]",
  );
  process.exit(1);
}

interface CopyEntry {
  lang: string;
  summary?: string;
  editorial?: string;
}
interface MergeEntry {
  name: string;
  langs: number;
  cat: string;
  avgPrice: number | null;
  avgRank: number | null;
  copies: CopyEntry[];
  psrId: number;
  psrName: string;
  psrCat: string;
}
interface NewEntry {
  name: string;
  nameLocal: string | null;
  nameKo: string | null;
  langs: number;
  cat: string;
  avgPrice: number | null;
  avgRank: number | null;
  copies: CopyEntry[];
  lat: number | null;
  lng: number | null;
  address: string | null;
  // confirm 항목만 = B1 문지기 후보(불변3·의심). new 항목은 없음(undefined).
  psrHint?: { psrId: number; psrName: string; psrCat: string; by: string };
}

/** ⚠️ 수정금지(승인필요) 2026-08-27 사장님 확정 = best_rank = 카피에 든 언어들의 7자리 언어코드(bestRankCode 1벌).
 *  B1 이 센 언어 수(langs)와 카피의 아는 언어 수가 다르면 경고 1줄만(코드는 카피 기준 그대로 씀 = 카피가 계약의 진실). */
function codeOf(
  name: string,
  langs: number,
  copies: CopyEntry[],
): number | null {
  const known = new Set(
    copies
      .map((c) => c.lang)
      .filter((l) => (LANGS as readonly string[]).includes(l)),
  );
  if (known.size !== langs)
    console.warn(
      `  ⚠️ 언어수 불일치: ${name} B1 langs=${langs} ≠ 카피 언어 ${known.size}개(${[...known].join(",")})`,
    );
  return bestRankCode(copies.map((c) => c.lang));
}

function findReportPath(): string {
  if (argv["report"]) return path.resolve(String(argv["report"]));
  const dir = path.join(ROOT, "docs", "b1-reports", String(cityId));
  const files = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => f.endsWith(".json"))
    : [];
  if (!files.length) {
    console.error(
      `✗ docs/b1-reports/${cityId} 에 B1 산출표 없음 = discovery-merge-diff.ts 선행 필요`,
    );
    process.exit(1);
  }
  // 최신 = 파일명 역순 1순위(날짜 선두 + 버전 _N 규칙, §18 그대로 = latestVersioned 대체 불가한 "여러 stem 중 최신 stem"
  //   케이스이므로 여기선 단순 역순 정렬로 충분 — 같은 stem 내 버전 선택은 latestVersioned 로 재확인).
  const latestFile = files.sort().reverse()[0];
  const stem = latestFile.replace(/_\d+\.json$/, ".json");
  const chosen = latestVersioned(dir, stem) || latestFile;
  return path.join(dir, chosen);
}

(async () => {
  const reportPath = findReportPath();
  const report = JSON.parse(fs.readFileSync(reportPath, "utf-8"));
  console.log(`═══ B2 입력 연결부 — city ${cityId} ═══`);
  console.log(`B1 산출표 = ${reportPath} (${report.generatedAt})`);

  const sections = [report.report.landmarks, report.report.restaurants];
  if (!sections.every((s) => Array.isArray(s?.confirm))) {
    console.error(
      `✗ B1 산출표에 confirm 목록 없음(등급 분리 이전 산출표) = discovery-merge-diff.ts 재실행 필요`,
    );
    process.exit(1);
  }
  const allMerge: MergeEntry[] = sections.flatMap((s) => s.merge);
  const allConfirm: NewEntry[] = sections.flatMap((s) => s.confirm);
  const allNew: NewEntry[] = sections.flatMap((s) => s.new);
  // 이번 실행에서 실제로 TS 를 보낼 항목 = 플래그 의미 그대로(--merge-only: confirm 은 --confirm 시만 / 없으면 confirm + new 전부)
  const tsItems: NewEntry[] = mergeOnly
    ? confirmFlag
      ? allConfirm
      : []
    : [...allConfirm, ...allNew];

  console.log(
    `대상 = merge(외부호출 0) ${allMerge.length}곳 · confirm(🔴 TS 1콜/곳) ${allConfirm.length}곳 · new(🔴 TS 1콜/곳) ${allNew.length}곳 → 이번 실행 TS 대상 ${tsItems.length}곳`,
  );

  const { simulateCost } = await import(
    "../../server/services/shared/external-call-log"
  );
  const sim = await simulateCost("ts", tsItems.length);
  console.log(
    `[시뮬] TS 이달 ${sim.used}/${sim.cap} 잔량 ${sim.remaining} · 계획 ${sim.planned} → 추가과금 €${sim.extraEur}`,
  );

  if (!apply) {
    console.log(`\n--- merge 대상(best_rank + 원어 카피 UPDATE 예정) ---`);
    for (const m of allMerge)
      console.log(
        `  [${m.langs}] ${m.name} → PSR#${m.psrId} best_rank=${codeOf(m.name, m.langs, m.copies)}`,
      );
    console.log(
      `\n--- confirm 대상(TS → PID 판정 후 upsertPlace 예정, 후보 = psrHint) ---`,
    );
    for (const n of allConfirm)
      console.log(
        `  [${n.langs}] ${n.name} (${n.cat}, best_rank=${codeOf(n.name, n.langs, n.copies)}) → 후보 PSR#${n.psrHint!.psrId} ${n.psrHint!.psrName} [${n.psrHint!.by}]`,
      );
    console.log(`\n--- new 대상(TS 검증 후 upsertPlace 예정) ---`);
    for (const n of allNew)
      console.log(
        `  [${n.langs}] ${n.name} (${n.cat}, best_rank=${codeOf(n.name, n.langs, n.copies)}, avg€${n.avgPrice ?? "-"})`,
      );
    console.log(
      `\n=== DRY (외부호출 0·쓰기 0) = --apply [--merge-only [--confirm]] [--force-quota] 로 실행 ===`,
    );
    return;
  }

  // 게이트 = 실제로 보낼 TS 건수(confirm + new 중 이번 실행 대상)만 센다. 0건이면 외부호출 승인 절차 진입 자체가 없음.
  if (tsItems.length > 0) {
    const { gateBatch } = await import(
      "../../server/services/shared/external-call-log"
    );
    await gateBatch("ts", tsItems.length, { force: forceQuota });
  } else {
    console.log(
      `[--merge-only] confirm ${allConfirm.length}·new ${allNew.length} 구간 완전히 건너뜀 = 외부호출 0`,
    );
  }

  const pg = await import("pg");
  const c = new (pg as any).default.Client({
    connectionString: process.env.SUPA_URL || process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const city = (
    await c.query("SELECT country_code FROM cities WHERE id=$1", [cityId])
  ).rows[0];

  const { upsertPlace } = await import(
    pathToFileURL(path.join(ROOT, "server/services/place-upsert.ts")).href
  );

  const koCopyOf = (copies: CopyEntry[]) => copies.find((x) => x.lang === "ko");
  const otherCopiesOf = (copies: CopyEntry[]) =>
    copies.filter(
      (x) => x.lang !== "ko" && (LANGS as readonly string[]).includes(x.lang),
    );

  // ⚠️ 수정금지(승인필요) 2026-08-27 사장님 지적 = 출처표식은 병합·신규 양쪽 다 phase_tags 에 반드시 남긴다
  //   (어느 배치가 best_rank 를 줬는지 추적 가능 = §16 기존 phase_tags 다중태그 방식 재사용, 새 컬럼 신설 안 함).
  const PROVENANCE_TAG = `discover-perlang-${new Date().toISOString().slice(0, 10)}`;

  // ⚠️ 수정금지(승인필요) 2026-08-28 사장님 승인 = BEGIN/skip_dup_check/COMMIT 트랜잭션 래퍼 1벌(병합·신규 두 호출부
  //   공용, §16 = 옛 두 곳 각자 중복 정의 완전삭제). fn 실패 시 ROLLBACK 후 재던짐.
  async function inTxn<T>(fn: () => Promise<T>): Promise<T> {
    await c.query("BEGIN");
    try {
      await c.query(`SELECT set_config('app.skip_dup_check', 'on', true)`);
      const result = await fn();
      await c.query("COMMIT");
      return result;
    } catch (e) {
      await c.query("ROLLBACK");
      throw e;
    }
  }

  async function upsertTranslations(placeId: number, copies: CopyEntry[]) {
    for (const t of otherCopiesOf(copies)) {
      if (!t.summary && !t.editorial) continue;
      await c.query(
        `INSERT INTO place_translations (place_id, language, summary, editorial_summary)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (place_id, language) DO UPDATE
           SET summary = EXCLUDED.summary, editorial_summary = EXCLUDED.editorial_summary`,
        [placeId, t.lang, t.summary || null, t.editorial || null],
      );
    }
  }

  // ── 병합(외부호출 0) ──
  let mergedOk = 0;
  for (const m of allMerge) {
    const ko = koCopyOf(m.copies);
    await upsertPlace({
      targetRowId: m.psrId,
      followTriggerDup: true, // 랜드마크 밀집지역 0m 인접행 대비(2026-08-26 BTS 실측 근거 재사용)
      cityId,
      seedCategory: m.psrCat,
      nameEn: m.psrName,
      selectionReasonKo: ko?.summary || null,
      shortformKo: ko?.editorial || null,
      // ⚠️ 수정금지(승인필요) 2026-08-27 사장님 확정 = 같은 주소/같은 PID = 같은 장소 → 한 행에 카테고리 태그를
      //   겹쳐 쓴다(멀티태그, upsertPlace category_tags UNION §14), 행을 나누지 않는다. seedCategory(주 카테고리)는
      //   그 행의 psrCat 유지. 예: Tour d'Argent(식당) ↔ #76425 루프탑(hotspot) 같은 주소 → 그 행에 restaurant 태그 추가.
      categoryTags: [m.cat],
      phaseTags: [PROVENANCE_TAG],
    });
    const code = codeOf(m.name, m.langs, m.copies);
    // ⚠️ 수정금지(승인필요) 2026-08-27 버그 수정 = set_config('...', true)(SET LOCAL, 트랜잭션 한정)를
    //   UPDATE 와 같은 트랜잭션(BEGIN..COMMIT)으로 안 묶으면 pg.Client 자동커밋 하에서 각 query() 가
    //   자기만의 트랜잭션 = 면제가 그 즉시 풀림 = PID 쌍둥이 행(#60656/#81549 실측)에서 문지기가 그대로
    //   막음. place-upsert.ts buildDirectUpdateSql 의 db.transaction() 패턴과 동일하게 명시적 BEGIN/COMMIT(= inTxn()).
    // ⚠️ 수정금지(승인필요) 2026-08-27 사장님 확정 = 계약 강제 = best_rank(언어코드) 와 place_translations 는
    //   같은 트랜잭션 안에서만 함께 쓴다 → 코드에 든 언어인데 글이 없는 반쪽 상태가 DB 에 남을 수 없다.
    // ⚠️ 수정금지(승인필요) 2026-08-28 사장님 승인 = best_rank = 현재값 ∪ 그룹코드(writeBestRankUnion() SSOT,
    //   status-backfill.ts 와 공용 = 값이 안 바뀌면 UPDATE 생략하는 멱등 판정 포함, §16).
    const br = await inTxn(async () => {
      const r = await writeBestRankUnion(c, m.psrId, code);
      await upsertTranslations(m.psrId, m.copies);
      return r;
    });
    mergedOk++;
    console.log(
      `  ✅ 병합 #${m.psrId} ${m.psrName} (langs=${m.langs}, best_rank ${br.cur} ∪ ${code} → ${br.result})`,
    );
  }

  // ── confirm + new(🔴 TS + PM) = 신규행 경로 1벌 — tsItems 0건이면 통째로 건너뜀(외부호출 0 보장) ──
  const stat = {
    absorbedHint: 0,
    absorbedOther: 0,
    insertedNew: 0,
    tsCalls: 0,
    pmCalls: 0,
    noMatch: 0,
    closed: 0,
    skipped: 0,
  };
  if (tsItems.length > 0) {
    const { issueApiKey } = await import(
      pathToFileURL(path.join(ROOT, "server/services/shared/issue-api-key.ts"))
        .href
    );
    const today = new Date().toISOString().slice(0, 10);
    const GOOGLE_KEY = await issueApiKey(
      c,
      "GOOGLE_MAPS_API_KEY",
      cityId,
      today,
      true,
    );
    if (!GOOGLE_KEY)
      throw new Error("GOOGLE_MAPS_API_KEY 발급 실패 = 신규행 처리 불가");
    const { tsSearch, tsPhoto } = await import(
      pathToFileURL(path.join(ROOT, "server/services/shared/ts-client.ts")).href
    );

    /** ⚠️ 수정금지(승인필요) 2026-08-27 사장님 확정 = confirm·new 공용 신규행 경로 1벌(§16).
     *  TS 1콜 → upsertPlace(targetRowId 없음 = 정상 INSERT 경로 = 문지기 1단 PID 가 진짜 행 판정, 막히면 recoverTriggerDup 흡수)
     *  → best_rank + place_translations 한 트랜잭션 → PM 은 결과 행에 이미지가 없을 때만(흡수된 기존 행은 대개 이미 있음). */
    async function verifyAndInsert(n: NewEntry) {
      const ko = koCopyOf(n.copies);
      stat.tsCalls++;
      const ts = (
        await tsSearch({
          apiKey: GOOGLE_KEY,
          method: "searchText",
          regionCode: city?.country_code || undefined,
          cityId,
          rawTag: `b2-discover-${n.name}`,
          nameLocal: n.nameLocal || n.name,
          address: n.address || undefined,
          latitude: n.lat ?? undefined,
          longitude: n.lng ?? undefined,
          anchorRadiusM: n.lat != null ? 10 : undefined,
          maxResults: 1,
        })
      )?.[0];
      if (!ts) {
        stat.noMatch++;
        console.log(`  ✗ no_match: ${n.name}`);
        return;
      }
      if (ts.businessStatus && ts.businessStatus !== "OPERATIONAL") {
        stat.closed++;
        console.log(`  🚫 ${ts.businessStatus}: ${n.name}`);
        return;
      }
      const res = await upsertPlace({
        cityId,
        seedCategory: n.cat,
        nameEn: ts.nameEn || n.name,
        nameKo: n.nameKo,
        nameLocal: n.nameLocal,
        address: ts.address || n.address,
        latitude: ts.latitude ?? n.lat,
        longitude: ts.longitude ?? n.lng,
        googlePlaceId: ts.googlePlaceId,
        googleMapsUri: ts.googleMapsUri,
        googleReviewCount: ts.googleReviewCount,
        priceEur: n.avgPrice ?? null,
        selectionReasonKo: ko?.summary || null,
        shortformKo: ko?.editorial || null,
        categoryTags: [n.cat],
        phaseTags: [PROVENANCE_TAG],
      });
      if (res.action !== "inserted" && res.action !== "updated") {
        stat.skipped++;
        console.log(
          `  ⚠️ upsert 결과 이상(${res.action}${res.reason ? `: ${res.reason}` : ""}): ${n.name}`,
        );
        return;
      }
      const rowId = res.rowId!;
      // 결과 대조 = 힌트행 흡수 / 다른 행 흡수 / 신규행 (confirm 은 psrHint 있음, new 는 없음)
      const outcome =
        res.action === "inserted"
          ? "신규행"
          : n.psrHint && rowId === n.psrHint.psrId
            ? "힌트행 흡수"
            : "다른 행 흡수";
      if (outcome === "신규행") stat.insertedNew++;
      else if (outcome === "힌트행 흡수") stat.absorbedHint++;
      else stat.absorbedOther++;
      const code = codeOf(n.name, n.langs, n.copies);
      // ⚠️ 수정금지(승인필요) 2026-08-28 사장님 승인 = 병합 경로와 동일한 inTxn() + writeBestRankUnion() 공용 사용
      //   (명시적 트랜잭션으로 skip_dup_check 면제 보장 + best_rank·place_translations 계약 강제, §16 중복 통합).
      const br = await inTxn(async () => {
        const r = await writeBestRankUnion(c, rowId, code);
        await upsertTranslations(rowId, n.copies);
        return r;
      });
      // 이미지 = 흡수(updated)면 RETURNING(enriched.image_url)이 그 행의 현재 이미지 / inserted 는 enriched 없음 = 이미지 없음.
      const hasImage = !!res.enriched?.imageUrl;
      let pm = "PM 생략(이미지 있음)";
      if (!hasImage && ts.photoName) {
        stat.pmCalls++;
        const url = await tsPhoto({
          apiKey: GOOGLE_KEY,
          photoName: ts.photoName,
          pathKey: `${cityId}/${n.cat}/${ts.googlePlaceId}`,
        });
        if (url)
          await upsertPlace({
            targetRowId: rowId,
            followTriggerDup: true,
            cityId,
            seedCategory: n.cat,
            nameEn: ts.nameEn || n.name,
            googlePlaceId: ts.googlePlaceId,
            imageUrl: url,
          });
        pm = url ? "PM 1장" : "PM 실패";
      } else if (!hasImage) pm = "PM 생략(TS 사진 없음)";
      console.log(
        `  ✅ #${rowId} ${ts.nameEn} (${res.action}${res.reason ? `/${res.reason}` : ""}, ${outcome}${n.psrHint ? ` · 힌트 PSR#${n.psrHint.psrId} ${n.psrHint.psrName} [${n.psrHint.by}]` : ""}, langs=${n.langs}, best_rank ${br.cur} ∪ ${code} → ${br.result}, ${pm})`,
      );
    }

    for (const n of tsItems) await verifyAndInsert(n);
  }

  await c.end();
  console.log(
    `\n═══ 완료: merge ${mergedOk}/${allMerge.length} · TS 대상 ${tsItems.length}곳(confirm ${mergeOnly && !confirmFlag ? 0 : allConfirm.length} + new ${mergeOnly ? 0 : allNew.length}) = 힌트행 흡수 ${stat.absorbedHint} / 다른 행 흡수 ${stat.absorbedOther} / 신규행 ${stat.insertedNew} · no_match ${stat.noMatch} · 폐업 ${stat.closed} · skip ${stat.skipped} · TS 호출 ${stat.tsCalls} · PM 호출 ${stat.pmCalls} ═══`,
  );
})();
