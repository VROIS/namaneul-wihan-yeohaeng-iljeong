// ⚠️ 영구 컴포넌트 2026-06-10 = 결손 이미지 = 창고 재링크 우선(무료) = PM(유료) 전 단계
// = 이미지 없는 행의 google_place_id 가 R2 place-images/ 에 이미 있으면(결제된 PM 고아) image_url 재링크 = 외부호출 0·€0
// = 원인: 07-merge 병합 / ts-name-recover 재생성 으로 row 가 바뀌며 image_url 유실 → 결제된 이미지가 link 끊긴 채 방치(고아).
// = 내부 우선 복구 [[feedback_internal_first_recover]]. 재링크 후에도 창고에 없는 것만 PM(유료).
// = 쓰기 = upsertPlace 단일 진입점(§14). 같은 카테고리 폴더 우선, 없으면 타 폴더 PID 매칭(멀티태그 이미지 재활용).
// = 배선: #45 결손보강 WF (fillcity/repair.ts) 가 PM 직전 relinkStorageImages() 호출 → matchedIds 는 PM 대상에서 제외 (2026-06-24 §19).
// = 창고 = R2 단독(2026-08-07 사장님 "비워" = SP 창고 철거 1-5b. 옛 storage.objects SQL·SP 공개 URL 경로 완전 삭제 §19).
// 직접 실행(전 도시 일괄): npx tsx server/services/fill/storage-image-relink.ts --city-id=37 [--apply]
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { listR2, getR2PublicUrl } from "../shared/r2-client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");
const PREFIX = "place-images"; // R2 키 = place-images/{cityId}/{cat}/{pid}.{ext} (옛 SP 버킷명 = R2 프리픽스 1:1)

// ── 재사용 함수 = PM 전 무료 재링크 (#45 결손보강 WF 가 import) ──
//   client = 호출자의 pg Client (열린 상태) · categories = 한정(예: ['restaurant']) 없으면 전체
//   반환 matchedIds = 창고에 있는(=PM 불필요) row id → 호출자가 PM 대상에서 제외
export async function relinkStorageImages(opts: {
  cityId: number;
  apply: boolean;
  client: any;
  categories?: string[];
}): Promise<{
  relinkable: number;
  relinked: number;
  matchedIds: Set<number>;
  byCat: Record<string, { hit: number; linked: number; miss: number }>;
}> {
  const { cityId, apply, client: c } = opts;
  const useCat = !!(opts.categories && opts.categories.length > 0);
  const params: any[] = [cityId];
  if (useCat) params.push(opts.categories);
  const rows = (
    await c.query(
      `
    SELECT p.id, p.seed_category AS cat, p.name_en, p.name_local, p.google_place_id AS pid, p.rank, p.image_url AS cur_url
    FROM place_seed_raw p
    WHERE p.city_id = $1 AND p.google_place_id IS NOT NULL${useCat ? " AND p.seed_category = ANY($2::text[])" : ""}
  `,
      params,
    )
  ).rows;

  // R2 도시 폴더 전체 목록 1회 → pid별 키 색인 (키 = place-images/{cityId}/{cat}/{pid}.{ext})
  const objects = await listR2(`${PREFIX}/${cityId}/`);
  const byPid = new Map<string, string[]>();
  for (const o of objects) {
    const m = o.key.match(/^place-images\/\d+\/[^/]+\/(.+)\.[^.]+$/);
    if (!m) continue;
    const arr = byPid.get(m[1]) || [];
    arr.push(o.key);
    byPid.set(m[1], arr);
  }
  // 같은 cat 폴더 우선, 없으면 타 cat(멀티태그 이미지 재활용) — 옛 SQL ORDER BY 와 동일 우선순위
  const findObj = (pid: string, cat: string): string | null => {
    const keys = byPid.get(pid);
    if (!keys?.length) return null;
    return (
      keys.find((k) => k.startsWith(`${PREFIX}/${cityId}/${cat}/`)) ||
      [...keys].sort()[0]
    );
  };

  // ⚠️ 수정금지(승인필요) 2026-06-14 사용자 SSOT = "구글이미지(창고 PID) 있으면 무조건 교체" (= PM 비용 절감 핵심).
  //   = 신규칙: image_url 종류 무관 = 창고에 PID 이미지 존재하면 대상. 단 이미 그 창고 주소를 정확히
  //     가리키는 행(image_url = 같은 공개 URL)은 제외 = 불필요 쓰기 0 (= 결과 동일, [[feedback_systemic_not_bandaid]]).
  //   = 원칙: PID 보유 = 이미 TS/PM(유료) 거친 증거 → 창고에 받아둔 결제 이미지를 DB 가 무조건 가리켜야 함(고아 0).
  const withObj = rows.map((r: any) => ({ ...r, obj: findObj(r.pid, r.cat) }));
  const hasStorage = withObj.filter((r: any) => r.obj);
  const hits = hasStorage.filter(
    (r: any) => r.cur_url !== getR2PublicUrl(r.obj),
  );

  // ⚠️ 2026-06-14 = 집계 의미: hit = 실제 교체대상(창고 있는데 URL 불일치) / linked = 이미 정상 링크(쓰기 0) / miss = PM 필요(창고 없음). (§19)
  const hitIds = new Set<number>(hits.map((r: any) => r.id));
  const byCat: Record<string, { hit: number; linked: number; miss: number }> =
    {};
  for (const r of withObj) {
    byCat[r.cat] ??= { hit: 0, linked: 0, miss: 0 };
    if (!r.obj) byCat[r.cat].miss++;
    else if (hitIds.has(r.id)) byCat[r.cat].hit++;
    else byCat[r.cat].linked++;
  }
  // matchedIds = PM 불필요(창고 보유) 행 전부 = 정상 링크 포함 (= PM 재호출 차단 = 비용 절감 핵심).
  const matchedIds = new Set<number>(hasStorage.map((r: any) => r.id));
  if (!apply)
    return { relinkable: hits.length, relinked: 0, matchedIds, byCat };

  const { upsertPlace } = await import(
    pathToFileURL(path.join(ROOT, "server/services/place-upsert.ts")).href
  );
  let ok = 0;
  for (const r of hits) {
    try {
      // ⚠️ 수정금지(승인필요) 2026-08-26 사장님 승인 = 행 확정(r.id) 직행 + followTriggerDup = 이미지 1칸 쓰기 = 식별컬럼 무변경 = 정식 면제
      //   (image-backfill runPm·mirrorWikiVenueImages 와 동일 근거). 근거: 10m 안 이웃행(BTS 공연장 0m 3형제 실측)이 있으면
      //   재매칭 쓰기가 문지기 불변4 에 막혀 무성 skip 되는데 matchedIds 엔 "창고 보유"로 남아 PM 대상에서도 빠짐 = 영구 결손 사각지대.
      const res = await upsertPlace({
        targetRowId: r.id,
        followTriggerDup: true,
        cityId,
        seedCategory: r.cat,
        nameEn: r.name_en,
        googlePlaceId: r.pid,
        imageUrl: getR2PublicUrl(r.obj),
      });
      if (res.action === "updated" || res.action === "inserted") ok++;
    } catch {
      /* skip = 다음 단계 PM 이 잡음 */
    }
  }
  return { relinkable: hits.length, relinked: ok, matchedIds, byCat };
}

// ── CLI = 직접 실행 시만(import 시 미발화) = 전 도시 일괄 재링크 ──
if (
  (process.argv[1] || "")
    .replace(/\\/g, "/")
    .endsWith("fill/storage-image-relink.ts")
) {
  (async () => {
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
    if (!cityId) {
      console.error("Usage: --city-id=<N> [--apply]");
      process.exit(1);
    }
    const pg = await import("pg");
    const c = new (pg as any).default.Client({
      connectionString: process.env.SUPA_URL || process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });
    await c.connect();
    const r = await relinkStorageImages({ cityId, apply, client: c });
    console.log(
      `═══ storage-image-relink (city ${cityId}) = 재링크 ${apply ? r.relinked : "(dry)"} / 가능 ${r.relinkable} ═══`,
    );
    for (const [k, v] of Object.entries(r.byCat).sort())
      console.log(
        `  ${k}: 교체대상 ${v.hit} / 이미정상 ${v.linked} / PM필요 ${v.miss}`,
      );
    if (!apply) console.log(`\n=== DRY (--apply 로 재링크) ===`);
    await c.end();
  })();
}
