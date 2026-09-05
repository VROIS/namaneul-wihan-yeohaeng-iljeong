// ⚠️ 수정금지(승인필요) 2026-08-27 사장님 승인 = B2 입력 연결부 = B1(④⑤) 실행부 (정본 = docs/2026-08-25 Tripis v1 안정화.md B2)
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { latestVersioned } from "../../server/services/shared/raw-filename";
// ⚠️ 수정금지(승인필요) 2026-08-27 사장님 승인 = 7개 언어 목록 1벌 + best_rank 언어코드 생성 1벌(§16).
import { LANGS } from "../../server/services/shared/language-instruction";
// ⚠️ 수정금지(승인필요) 2026-08-28 사장님 승인 = best_rank 쓰기 트랜잭션(SELECT FOR UPDATE→합집합→조건부 UPDATE) 1벌
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
// ⚠️ 수정금지(승인필요) 2026-09-04 사장님 확정 = 모든 기준 = PID = B1 이 걸러준 confirm·new 전부 TS 1콜 → PID 로 판정(A등급 직행 merge 삭제 §19).
if (!cityId) {
  console.error(
    "Usage: --city-id=<N> [--apply] [--force-quota] [--report=<path>]",
  );
  process.exit(1);
}

interface CopyEntry {
  lang: string;
  summary?: string;
  editorial?: string;
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
  psrHint?: { psrId: number; psrName: string; psrCat: string; by: string };
}

/** ⚠️ 수정금지(승인필요) 2026-08-27 사장님 확정 = best_rank = 카피에 든 언어들의 7자리 언어코드(bestRankCode 1벌). */
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

// ⚠️ 수정금지(승인필요) 2026-08-30 판단3종 적발 = 같은 폴더의 b1-extracted.json(추출본)이 알파벳순으로
//   b1-discovery-diff.json(최종본)보다 뒤에 와서 잘못 선택됨(항상 크래시) → 추출본 파일명 제외
function findReportPath(): string {
  if (argv["report"]) return path.resolve(String(argv["report"]));
  const dir = path.join(ROOT, "docs", "b1-reports", String(cityId));
  const files = fs.existsSync(dir)
    ? fs
        .readdirSync(dir)
        .filter((f) => f.endsWith(".json") && !f.includes("extracted"))
    : [];
  if (!files.length) {
    console.error(
      `✗ docs/b1-reports/${cityId} 에 B1 산출표 없음 = discovery-merge-diff.ts 선행 필요`,
    );
    process.exit(1);
  }
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
  // ⚠️ 수정금지(승인필요) 2026-09-04 사장님 결정 = 낡은 B1 산출표 기계 차단.
  //   B1 은 창고를 실시간으로 읽지만 B2 는 그 산출표 파일을 읽는다 = 그 사이 창고가 바뀌면
  //   이미 들어온 행(에펠탑·산타모니카 피어)을 신규로 오판해 TS 를 또 친다(실측 파리 36→11·LA 64→31).
  {
    const pg0 = await import("pg");
    const c0 = new (pg0 as any).default.Client({
      connectionString: process.env.SUPA_URL || process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });
    await c0.connect();
    const nowCount = Number(
      (
        await c0.query(
          "SELECT count(*)::int AS n FROM place_seed_raw WHERE city_id=$1",
          [cityId],
        )
      ).rows[0].n,
    );
    await c0.end();
    const then = Number(report.psrCountBefore ?? -1);
    if (then !== nowCount) {
      console.error(
        `✗ B1 산출표가 낡음 = 창고 ${then}행 시점 판정인데 지금 ${nowCount}행 → discovery-merge-diff.ts 재실행 필요(무료·DB 쓰기 0).`,
      );
      process.exit(1);
    }
  }

  const allConfirm: NewEntry[] = sections.flatMap((s) => s.confirm);
  const allNew: NewEntry[] = sections.flatMap((s) => s.new);
  const tsItems: NewEntry[] = [...allConfirm, ...allNew];

  console.log(
    `대상 = confirm(🔴 TS 1콜/곳) ${allConfirm.length}곳 · new(🔴 TS 1콜/곳) ${allNew.length}곳 → 이번 실행 TS 대상 ${tsItems.length}곳`,
  );

  const { simulateCost } = await import(
    "../../server/services/shared/external-call-log"
  );
  const sim = await simulateCost("ts", tsItems.length);
  console.log(
    `[시뮬] TS 이달 ${sim.used}/${sim.cap} 잔량 ${sim.remaining} · 계획 ${sim.planned} → 추가과금 €${sim.extraEur}`,
  );

  if (!apply) {
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
      `\n=== DRY (외부호출 0·쓰기 0) = --apply [--force-quota] 로 실행 ===`,
    );
    return;
  }

  if (tsItems.length > 0) {
    const { gateBatch } = await import(
      "../../server/services/shared/external-call-log"
    );
    await gateBatch("ts", tsItems.length, { force: forceQuota });
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
  const PROVENANCE_TAG = `discover-perlang-${new Date().toISOString().slice(0, 10)}`;

  // ⚠️ 수정금지(승인필요) 2026-08-28 사장님 승인 = BEGIN/skip_dup_check/COMMIT 트랜잭션 래퍼 1벌(병합·신규 두 호출부
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

  const stat = {
    absorbedHint: 0,
    absorbedOther: 0,
    insertedNew: 0,
    tsCalls: 0,
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
    const { tsSearch } = await import(
      pathToFileURL(path.join(ROOT, "server/services/shared/ts-client.ts")).href
    );

    /** ⚠️ 수정금지(승인필요) 2026-08-27 사장님 확정 = confirm·new 공용 신규행 경로 1벌(§16). */
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
          // ⚠️ 수정금지(승인필요) 2026-09-01 사장님 확정 = 좌표 앵커 1000m(ag3 와 1벌) = 동명 타도시 차단 (정본 §B2)
          address: n.address || undefined,
          latitude: n.lat ?? null,
          longitude: n.lng ?? null,
          anchorRadiusM: n.lat != null && n.lng != null ? 1000 : undefined,
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
        // ⚠️ 수정금지(승인필요) 2026-09-01 사장님 확정 = TS 가 준 영업상태도 PSR 로(옛 = 폐업판정에만 쓰고 버림) (정본 §⑥)
        businessStatus: ts.businessStatus ?? null,
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
      const br = await inTxn(async () => {
        const r = await writeBestRankUnion(c, rowId, code);
        await upsertTranslations(rowId, n.copies);
        return r;
      });
      // ⚠️ 수정금지(승인필요) 2026-09-01 사장님 확정 = 이 단계에서 PM 안 함 = 이미지는 ⑦ backfill-verify 단독 (정본 §B2)
      console.log(
        `  ✅ #${rowId} ${ts.nameEn} (${res.action}${res.reason ? `/${res.reason}` : ""}, ${outcome}${n.psrHint ? ` · 힌트 PSR#${n.psrHint.psrId} ${n.psrHint.psrName} [${n.psrHint.by}]` : ""}, langs=${n.langs}, best_rank ${br.cur} ∪ ${code} → ${br.result})`,
      );
    }

    for (const n of tsItems) await verifyAndInsert(n);
  }

  await c.end();
  console.log(
    `
═══ 완료: TS 대상 ${tsItems.length}곳(confirm ${allConfirm.length} + new ${allNew.length}) = 힌트행 흡수 ${stat.absorbedHint} / 다른 행 흡수 ${stat.absorbedOther} / 신규행 ${stat.insertedNew} · no_match ${stat.noMatch} · 폐업 ${stat.closed} · skip ${stat.skipped} · TS 호출 ${stat.tsCalls} ═══`,
  );
})();
