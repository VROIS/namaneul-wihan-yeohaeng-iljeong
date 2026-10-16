// ⚠️ 수정금지(승인필요) 2026-07-11 사장님 SSOT = 사진 사후 일괄 보강 단일 진입점 (= 사진 분리 수술의 짝).
// = ⚠️ 2026-08-24 사장님 승인 = 무료잔량 게이트(gateBatch) = TS만 적용(초과면 중단, --force-quota 는 사장님 승인 시만). PM = 막지 않음(곧 사용자 기능 = 제한 금지, 기록·판정만).
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { relinkStorageImages } from "./storage-image-relink";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");

// ── raw 재활용 = docs/raw/{cityId} 전 json 에서 pid→photoName 수집 (§18 자산 = 재과금 0 의 근거) ──
//   ⚠️ 수정금지(승인필요) 2026-07-11 사장님 SSOT = 최신 파일 우선(§14 새것우선) = 파일명(YYYY-MM-DD_..._N) 역순 순회 + 무조건 덮어쓰기.
export function collectPhotoNamesFromRaw(
  cityId: number,
): Map<string, { photoName?: string; status?: string }> {
  const map = new Map<string, { photoName?: string; status?: string }>();
  const dir = path.join(ROOT, "docs", "raw", String(cityId));
  if (!fs.existsSync(dir)) return map;
  const walk = (node: any) => {
    if (!node || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const x of node) walk(x);
      return;
    }
    const pid =
      typeof node.place_id === "string"
        ? node.place_id
        : typeof node.id === "string" && Array.isArray(node.photos)
          ? node.id
          : null;
    const pn =
      typeof node.photo_name === "string"
        ? node.photo_name
        : Array.isArray(node.photos) && typeof node.photos[0]?.name === "string"
          ? node.photos[0].name
          : undefined;
    const status =
      typeof node.business_status === "string"
        ? node.business_status
        : typeof node.businessStatus === "string"
          ? node.businessStatus
          : undefined;
    if (pid && (pn || status)) {
      const prev = map.get(pid) || {};
      map.set(pid, {
        photoName: prev.photoName ?? pn,
        status: prev.status ?? status,
      });
    }
    for (const v of Object.values(node)) walk(v);
  };
  for (const f of fs.readdirSync(dir).sort().reverse()) {
    if (!f.endsWith(".json")) continue;
    try {
      walk(JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8")));
    } catch {}
  }
  return map;
}

export async function backfillImages(opts: {
  cityId: number;
  apply: boolean;
  forceQuota?: boolean; // 2026-08-23 = 무료잔량 초과 시에도 진행(사장님 승인 플래그 --force-quota)
  allowTs?: boolean;
  limit?: number;
  client: any;
}): Promise<{
  targets: number;
  relinked: number;
  pmFromRaw: number;
  needTs: number;
  pmDone: number;
  tsDone: number;
}> {
  const { cityId, apply, client: c } = opts;
  const limit = opts.limit ?? 1000;

  const relink = await relinkStorageImages({ cityId, apply, client: c });

  // ⚠️ 수정금지(승인필요) 2026-08-17 사장님 승인 = 영구폐업 제외 조건 삭제(옛 2026-07-08 "폐업=PM 스킵" 폐기 §19).
  //   2026-08-26 사장님 승인 = 위키 미러 파일(`-wiki.` = mirrorWikiVenueImages 가 만든 임시 자리)은 구글 사진이 아니므로
  const rows = (
    await c.query(
      `
    SELECT id, seed_category AS cat, name_en, name_local, address, latitude, longitude, google_place_id AS pid
    FROM place_seed_raw
    WHERE city_id = $1 AND google_place_id IS NOT NULL
      AND (image_url IS NULL OR image_url = '' OR image_url NOT LIKE '%place-images%'
           OR image_url LIKE '%-wiki.%')
    ORDER BY rank NULLS LAST, id LIMIT $2
  `,
      [cityId, limit],
    )
  ).rows.filter((r: any) => !relink.matchedIds.has(r.id));

  const rawMap = collectPhotoNamesFromRaw(cityId);
  const live = rows;
  const withRaw = live.filter((r: any) => rawMap.get(r.pid)?.photoName);
  const needTs = live.filter((r: any) => !rawMap.get(r.pid)?.photoName);
  console.log(`═══ image-backfill (city ${cityId}) ═══`);
  // 2026-08-23 사장님 = 실행 전 시뮬 = 이달 잔량 + 진행 시 추가과금(€). 외부호출 0.
  const { simulateCost, gateBatch } = await import(
    "../shared/external-call-log"
  );
  const simPm = await simulateCost(
    "pm",
    withRaw.length + (opts.allowTs ? needTs.length : 0),
  );
  const simTs = await simulateCost("ts", opts.allowTs ? needTs.length : 0);
  console.log(
    `[시뮬] PM 이달 ${simPm.used}/${simPm.cap} 잔량 ${simPm.remaining} · 계획 ${simPm.planned} → 추가과금 €${simPm.extraEur} | TS 이달 ${simTs.used}/${simTs.cap} 잔량 ${simTs.remaining} · 계획 ${simTs.planned} → 추가과금 €${simTs.extraEur}`,
  );
  console.log(
    `대상(PID보유·이미지결손) ${rows.length} | 무료재링크 ${apply ? relink.relinked : relink.relinkable}(${apply ? "완료" : "가능"}) | raw재활용 PM ${withRaw.length}건 | TS필요 ${needTs.length}건(TS+PM)`,
  );
  if (!apply) {
    for (const r of live.slice(0, 30))
      console.log(
        `  [${rawMap.get(r.pid)?.photoName ? "raw→PM" : "TS필요"}] #${r.id} ${r.name_local || r.name_en}`,
      );
    if (needTs.length)
      console.log(
        `💡 운영(배포서버) 생성 raw 는 Storage(raw-responses)에 있음 = raw-storage-recall pull 선행 시 "TS필요"가 raw재활용으로 줄 수 있음(재과금 0).`,
      );
    console.log(
      `=== DRY (외부호출 0·쓰기 0) = --apply 로 실행${needTs.length ? ", TS는 --allow-ts 필요" : ""} ===`,
    );
    return {
      targets: rows.length,
      relinked: relink.relinkable,
      pmFromRaw: withRaw.length,
      needTs: needTs.length,
      pmDone: 0,
      tsDone: 0,
    };
  }

  // ⚠️ 2026-08-24 사장님 승인 = PM = 막지 않음(곧 사용자 기능 생김 = 제한 금지). BE가 잔량을 알 수 있게
  const tsPlanned = opts.allowTs ? needTs.length : 0;
  if (tsPlanned) await gateBatch("ts", tsPlanned, { force: !!opts.forceQuota });

  const { tsPhoto, tsSearch } = await import(
    pathToFileURL(path.join(ROOT, "server/services/shared/ts-client.ts")).href
  );
  const { upsertPlace } = await import(
    pathToFileURL(path.join(ROOT, "server/services/place-upsert.ts")).href
  );
  // ⚠️ 수정금지(승인필요) 2026-08-17 사장님 승인 = 키 발급 = 다른 전 컴포넌트(repair.ts 등)와 동일하게
  const { issueApiKey } = await import(
    pathToFileURL(path.join(ROOT, "server/services/shared/issue-api-key.ts"))
      .href
  );
  const inputDate = new Date().toISOString().slice(0, 10);
  const GOOGLE_KEY = await issueApiKey(
    c,
    "GOOGLE_MAPS_API_KEY",
    cityId,
    inputDate,
    true,
  );
  const { isR2Configured } = await import(
    pathToFileURL(path.join(ROOT, "server/services/shared/r2-client.ts")).href
  );
  if (!GOOGLE_KEY)
    throw new Error("image-backfill: GOOGLE_MAPS_API_KEY 발급 실패 = PM 불가");
  if (!isR2Configured())
    throw new Error(
      "image-backfill: R2 환경변수 미비 = 이미지 업로드 불가(무성실패 차단)",
    );

  let pmDone = 0,
    tsDone = 0,
    pmFail = 0;
  const runPm = async (r: any, photoName: string) => {
    const url = await tsPhoto({
      apiKey: GOOGLE_KEY,
      photoName,
      pathKey: `${cityId}/${r.cat}/${r.pid}`,
    }); // 저장 = R2 place-images/ (2026-08-06)
    if (!url) {
      pmFail++;
      console.warn(
        `  ⚠️ PM null #${r.id} ${r.name_en} (photoName 만료·업로드 실패)`,
      );
      return;
    }
    // ⚠️ 수정금지(승인필요) 2026-08-26 사장님 승인 = followTriggerDup = 이미지 1칸 쓰기 = 식별컬럼 무변경 = 정식 면제
    await upsertPlace({
      targetRowId: r.id,
      followTriggerDup: true,
      cityId,
      seedCategory: r.cat,
      nameEn: r.name_en,
      googlePlaceId: r.pid,
      imageUrl: url,
    });
    pmDone++;
  };
  for (const r of withRaw) {
    try {
      await runPm(r, rawMap.get(r.pid)!.photoName!);
    } catch (e) {
      pmFail++;
      console.warn(`  ⚠️ PM 실패 #${r.id}:`, (e as Error).message);
    }
  }
  if (opts.allowTs) {
    for (const r of needTs) {
      try {
        const tsArr = await tsSearch({
          apiKey: GOOGLE_KEY,
          method: "searchText",
          cityId,
          nameLocal: r.name_local || r.name_en,
          address: r.address || undefined,
          latitude: r.latitude ? Number(r.latitude) : undefined,
          longitude: r.longitude ? Number(r.longitude) : undefined,
          anchorRadiusM: r.latitude ? 10 : undefined,
          rawTag: `img-backfill-${r.name_en || r.pid}`,
          localSkipRaw: false,
        });
        tsDone++;
        const ts = tsArr?.[0];
        if (!ts) continue;
        const closed = ts.businessStatus === "CLOSED_PERMANENTLY";
        await upsertPlace({
          targetRowId: r.id,
          cityId,
          seedCategory: r.cat,
          nameEn: ts.nameEn || r.name_en,
          googlePlaceId: ts.googlePlaceId || r.pid,
          address: ts.address ?? null,
          latitude: ts.latitude && ts.latitude !== 0 ? ts.latitude : null,
          longitude: ts.longitude && ts.longitude !== 0 ? ts.longitude : null,
          googleMapsUri: ts.googleMapsUri ?? null,
          googleReviewCount: ts.googleReviewCount ?? null,
          // ⚠️ 수정금지(승인필요) 2026-08-10 사장님 확정 = **가격 칸의 주인은 제미니 하나**(SSOT:583).
          //   버리는 게 아니다 = TS 가격은 §18 raw 에 그대로 남는다.
          priceEur: undefined,
          phaseTags: closed ? ["영구폐업"] : undefined,
        });
        if (ts.photoName) await runPm(r, ts.photoName);
      } catch (e) {
        console.warn(`  ⚠️ TS 실패 #${r.id}:`, (e as Error).message);
      }
    }
  }
  console.log(
    `✅ 완료: PM ${pmDone}건 저장${pmFail ? ` · PM 실패 ${pmFail}건` : ""} · TS ${tsDone}콜${!opts.allowTs && needTs.length ? ` · TS필요 ${needTs.length}건 보류(--allow-ts)` : ""}`,
  );
  return {
    targets: rows.length,
    relinked: relink.relinked,
    pmFromRaw: withRaw.length,
    needTs: needTs.length,
    pmDone,
    tsDone,
  };
}

// ── 🚨 공연장 위키 직링크 → R2 미러 (2026-08-26 사장님 승인 = 공식업뎃 응급) ──
// ⚠️ 수정금지(승인필요) 2026-08-26 사장님 승인 = 미래공연 도시의 bts_venue 위키 이미지를 R2 로 1회 복사 후
//   해설·카드 이미지 먹통(2026-08-26 실측 4중2 429, 파리 공연장=R2 주소라 유일 정상). 공연 지난 도시 제외(사장님 지시).
export async function mirrorWikiVenueImages(opts: {
  apply: boolean;
  client: any;
  cityId?: number;
}): Promise<{ targets: number; mirrored: number; failed: number }> {
  const { apply, client: c } = opts;
  const today = new Date().toISOString().slice(0, 10);
  const rows = (
    await c.query(
      `SELECT p.id, p.city_id, p.name_en, p.image_url, ct.name_en AS city_name, ct.bts_concert_dates AS dates
         FROM place_seed_raw p JOIN cities ct ON ct.id = p.city_id
        WHERE p.seed_category = 'bts_venue'
          AND (p.image_url ILIKE '%wikipedia%' OR p.image_url ILIKE '%wikimedia%')
          ${opts.cityId ? "AND p.city_id = $1" : ""}
        ORDER BY p.city_id`,
      opts.cityId ? [opts.cityId] : [],
    )
  ).rows.filter((r: any) => {
    let dates: string[] = [];
    try {
      dates = Array.isArray(r.dates) ? r.dates : JSON.parse(r.dates || "[]");
    } catch {
      dates = [];
    }
    return dates.some((d) => String(d).slice(0, 10) >= today); // 공연 지난 도시 제외(사장님 지시 2026-08-26)
  });
  console.log(
    `═══ mirror-wiki (bts_venue, 미래공연 도시만) = 대상 ${rows.length}건 ═══`,
  );
  for (const r of rows)
    console.log(
      `  #${r.id} [${r.city_name}] ${r.name_en}\n     ${r.image_url}`,
    );
  if (!apply) {
    console.log("=== DRY (외부호출 0·쓰기 0) = --apply 로 실행 ===");
    return { targets: rows.length, mirrored: 0, failed: 0 };
  }
  const { uploadToR2, isR2Configured } = await import(
    pathToFileURL(path.join(ROOT, "server/services/shared/r2-client.ts")).href
  );
  if (!isR2Configured())
    throw new Error(
      "mirror-wiki: R2 환경변수 미비 = 업로드 불가(무성실패 차단)",
    );
  const { upsertPlace } = await import(
    pathToFileURL(path.join(ROOT, "server/services/place-upsert.ts")).href
  );
  // ⚠️ 수정금지(승인필요) 2026-08-28 사장님 승인 = 429 백오프를 표준헬퍼(withQuotaRetry, §16)로 통일
  const { withQuotaRetry } = await import(
    pathToFileURL(path.join(ROOT, "server/services/shared/retry-429.ts")).href
  );
  const fetchWiki = async (
    url: string,
    tag: string,
  ): Promise<Buffer | null> => {
    const candidates = [
      ...new Set([url.replace(/\/\d{3,4}px-/, "/1280px-"), url]),
    ];
    for (const u of candidates) {
      try {
        const buf: Buffer | null = await withQuotaRetry(
          async () => {
            const resp = await fetch(u, {
              headers: {
                "User-Agent":
                  "TripisImageMirror/1.0 (https://my-guide.replit.app)",
              },
              signal: AbortSignal.timeout(30000),
            });
            if (resp.ok) return Buffer.from(await resp.arrayBuffer());
            if (resp.status === 429) {
              const err: any = new Error(`위키 429: ${u}`);
              err.status = 429;
              throw err;
            }
            return null; // 404 등 = 다음 후보 URL 로(재시도 대상 아님)
          },
          { delaysMs: [4000, 8000, 12000], label: `mirror-wiki ${tag}` },
        );
        if (buf) return buf;
      } catch {}
    }
    return null;
  };
  let mirrored = 0,
    failed = 0;
  for (const r of rows) {
    const buf = await fetchWiki(r.image_url, `#${r.id} ${r.name_en}`);
    if (!buf) {
      failed++;
      console.warn(`  ⚠️ 다운로드 실패 #${r.id} ${r.name_en}`);
      continue;
    }
    const isPng = r.image_url.toLowerCase().endsWith(".png");
    const up = await uploadToR2(
      `place-images/${r.city_id}/bts_venue/psr-${r.id}-wiki.${isPng ? "png" : "jpg"}`,
      buf,
      isPng ? "image/png" : "image/jpeg",
    );
    await upsertPlace({
      targetRowId: r.id,
      followTriggerDup: true, // 0m 동일좌표 3형제 = 불변4 필연 차단 → 정식 면제(위 헤더 근거)
      cityId: r.city_id,
      seedCategory: "bts_venue",
      nameEn: r.name_en,
      imageUrl: up.publicUrl,
    });
    mirrored++;
    console.log(
      `  ✅ #${r.id} [${r.city_name}] → ${up.publicUrl} (${Math.round(buf.length / 1024)}KB)`,
    );
    await new Promise((s) => setTimeout(s, 800)); // 위키 429 예방 간격
  }
  console.log(
    `✅ 미러 완료 ${mirrored}건${failed ? ` · 실패 ${failed}건` : ""}`,
  );
  return { targets: rows.length, mirrored, failed };
}

if (
  (process.argv[1] || "").replace(/\\/g, "/").endsWith("fill/image-backfill.ts")
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
    const mirrorWiki = argv["mirror-wiki"] === "true"; // 2026-08-26 = 공연장 위키→R2 미러 모드(도시 지정 없이 미래공연 전체)
    if (!cityId && !mirrorWiki) {
      console.error(
        "Usage: --city-id=<N> [--apply] [--allow-ts] [--limit=50] [--force-quota] | --mirror-wiki [--city-id=<N>] [--apply]",
      );
      process.exit(1);
    }
    // @ts-ignore = pg 타입선언 없음(런타임 전용, storage-image-relink CLI 동일 패턴)
    const pg = await import("pg");
    const c = new (pg as any).default.Client({
      connectionString: process.env.SUPA_URL || process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });
    await c.connect();
    if (mirrorWiki) {
      await mirrorWikiVenueImages({
        apply: argv["apply"] === "true",
        client: c,
        cityId: cityId || undefined,
      });
    } else {
      await backfillImages({
        cityId,
        apply: argv["apply"] === "true",
        forceQuota: argv["force-quota"] === "true",
        allowTs: argv["allow-ts"] === "true",
        limit: argv["limit"] ? Number(argv["limit"]) : undefined,
        client: c,
      });
    }
    await c.end();
  })();
}
