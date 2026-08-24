// ⚠️ 수정금지(승인필요) 2026-07-11 사장님 SSOT = 사진 사후 일괄 보강 단일 진입점 (= 사진 분리 수술의 짝).
// = 생성 중 PM 0(ag3 = TS까지만) → 이미지 결손은 이 컴포넌트가 도시 단위로 한꺼번에 채움.
// = 순서(비용 최소, [[feedback_internal_first_recover]]):
//   ① PID보유+이미지결손 추출(repair.ts:99 정본 조건) → ② 무료 재링크(relinkStorageImages §16, 외부호출 0)
//   → ③ 저장 raw(docs/raw/{cityId})의 photoName 재활용 = PM만(TS 재호출 0) → ④ raw에도 없으면 보고만(기본) / --allow-ts 시 TS 1콜 후 PM.
// = 비용(2025-03 SKU 개편, 2026-08-23 현행화): PM·TS 각 월 1,000 무료(독립) → 초과 PM €0.006/장 · TS €0.035/콜. 기본 DRY(외부호출 0·쓰기 0) = --apply 시 실행.
// = ⚠️ 2026-08-23 사장님 승인 = 실행 전 무료잔량 게이트(external-call-log.gateBatch) = 초과면 중단, --force-quota 는 사장님 승인 시만.
// = 쓰기 = upsertPlace 단일 진입점(§14, relink 동일 패턴 = PID 매칭 = imageUrl 부분갱신 = 뼈대 보존).
// CLI: npx tsx server/services/fill/image-backfill.ts --city-id=19 [--apply] [--allow-ts] [--limit=50]
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { relinkStorageImages } from "./storage-image-relink";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");

// ── raw 재활용 = docs/raw/{cityId} 전 json 에서 pid→photoName 수집 (§18 자산 = 재과금 0 의 근거) ──
//   지원 형태: ⓐ 06형태 모음(results[].ts = { place_id, photo_name }) ⓑ TS raw(places[] = { id: 'ChIJ..', photos[0].name })
//   ⚠️ 수정금지(승인필요) 2026-07-11 사장님 SSOT = 최신 파일 우선(§14 새것우선) = 파일명(YYYY-MM-DD_..._N) 역순 순회 + 무조건 덮어쓰기.
//     옛 "알파벳순 + !map.has(pid) 첫값고정" 폐기 = 2026-07-11 §19 = 가장 옛 photoName 채택 → 구글 로테이션으로 404 결함(리뷰 적발).
//   businessStatus 도 수집 = 영구폐업 행 PM 스킵용(2026-07-08 폐업 SSOT). photoName 없어도 businessStatus 만 기록.
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
    // pid 감지 = place_id 필드, 또는 photos 배열을 동반한 문자열 id(TS raw places[] = id가 곧 PID, ChIJ 외 접두 포함)
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
      // 역순 순회(최신 먼저)라 이미 있으면 최신값 = 유지, 없는 필드만 옛 파일에서 보충.
      map.set(pid, {
        photoName: prev.photoName ?? pn,
        status: prev.status ?? status,
      });
    }
    for (const v of Object.values(node)) walk(v);
  };
  // 파일명 역순 = 최신(날짜·버전 큰 것) 먼저 = 최신 photoName 채택(§14)
  for (const f of fs.readdirSync(dir).sort().reverse()) {
    if (!f.endsWith(".json")) continue;
    try {
      walk(JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8")));
    } catch {
      /* 손상 파일 = 건너뜀 */
    }
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

  // ② 무료 재링크 먼저 = 결제된 고아 이미지 회수 + matchedIds(=Storage 보유 = PM 불필요) 확보
  const relink = await relinkStorageImages({ cityId, apply, client: c });

  // ① 대상 = PID 보유 + 이미지 결손(repair.ts:99 정본) − Storage 보유행
  // ⚠️ 수정금지(승인필요) 2026-08-17 사장님 승인 = 영구폐업 제외 조건 삭제(옛 2026-07-08 "폐업=PM 스킵" 폐기 §19).
  //   = 근거: 폐업행도 슬롯·행 유지(§20, ag3-save-new-places.ts:304-305) = FE 에 그대로 노출되는데 제미니·DB-only
  //     서빙 양쪽 다 영구폐업 필터가 없어(2026-08-17 실측) 사용자가 폐업행을 그대로 봄. 사진이 있으면(폐업 전 저장분)
  //     채워주는 게 맞음(빈 이미지보다 폐업 전 사진이 낫다). photoName 자체가 없는 곳(Seven Degrees North 등)은
  //     어차피 withRaw/needTs 분류에서 자연히 걸러짐(수정 불필요).
  const rows = (
    await c.query(
      `
    SELECT id, seed_category AS cat, name_en, name_local, address, latitude, longitude, google_place_id AS pid
    FROM place_seed_raw
    WHERE city_id = $1 AND google_place_id IS NOT NULL
      AND (image_url IS NULL OR image_url = '' OR image_url NOT LIKE '%place-images%')
    ORDER BY rank NULLS LAST, id LIMIT $2
  `,
      [cityId, limit],
    )
  ).rows.filter((r: any) => !relink.matchedIds.has(r.id));

  // ③ raw photoName 재활용 분류 (폐업이어도 photoName 있으면 PM 대상 포함 = 2026-08-17 위 사유)
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

  // ⚠️ 2026-08-23 사장님 승인 = 관리자 배치 무료잔량 게이트 = 이달 PM·TS 무료(각 1,000) 잔량 안에서만 실행
  //   계획건수 = 실제 실행 경로와 동일: needTs 행은 --allow-ts 일 때만 돈다(아래 opts.allowTs 분기)
  const tsPlanned = opts.allowTs ? needTs.length : 0;
  await gateBatch("pm", withRaw.length + tsPlanned, {
    force: !!opts.forceQuota,
  });
  if (tsPlanned) await gateBatch("ts", tsPlanned, { force: !!opts.forceQuota });

  const { tsPhoto, tsSearch } = await import(
    pathToFileURL(path.join(ROOT, "server/services/shared/ts-client.ts")).href
  );
  const { upsertPlace } = await import(
    pathToFileURL(path.join(ROOT, "server/services/place-upsert.ts")).href
  );
  // ⚠️ 수정금지(승인필요) 2026-08-17 사장님 승인 = 키 발급 = 다른 전 컴포넌트(repair.ts 등)와 동일하게
  //   issueApiKey(DB api_keys 테이블 경유, §채움 hasRow=true 검문) 사용. 옛 process.env 직독은 이 파일만
  //   따로 쓰던 결함 = 로컬·배포 어디든 DB에 키가 있어도 env가 비어있으면 무조건 크래시(2026-08-17 나이로비 실측).
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
  // ⚠️ 2026-08-06 = 사진 저장 = R2(tsPhoto 내부 r2-client). 옛 Supabase SUPA_SR/SUPA_PUB 폐기 = Cloudflare 이전계획 1단계 §19.
  const { isR2Configured } = await import(
    pathToFileURL(path.join(ROOT, "server/services/shared/r2-client.ts")).href
  );
  // 설정 결손 = 사진 전건 무성실패 방지 = 시작 전 차단(과거 raw 증발 패턴 차단).
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
    // targetRowId 직행 = PID 중복행이 있어도 정확히 그 행에 기록(§14 재매칭 불가 패턴, ag3 job2 동형)
    await upsertPlace({
      targetRowId: r.id,
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
        // ⚠️ §20 = 유료 TS 응답 = 전요소를 그 행에 기록(사진이름만 뽑아쓰기 = 셀렉 금지). imageUrl 은 아래 runPm 이 별도 갱신.
        //   RC = ?? null(§14 뼈대 유지, TS 무응답 시 기존 RC 보존 = autorank 강등 방지).
        //   폐업 = phase_tags 기록 + PM 도 시도(2026-08-18 = raw재활용 경로·ag3 라이브와 동일 정책 통일, 옛 "폐업=PM 스킵" 폐기 §19).
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
          //   구글 priceRange 는 그 나라 통화(케냐 KES 5,000 ≈ €35)라 price_eur 로 쓰면 €5,000 이 박힌다.
          //   ag3(생성)·reinsert 와 **같은 규칙** = 여기서도 안 쓴다(§20 = 같은 PSR 로 모이는 경로는 규칙 하나).
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

// ── CLI = 직접 실행 시만(import 시 미발화) ──
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
    if (!cityId) {
      console.error(
        "Usage: --city-id=<N> [--apply] [--allow-ts] [--limit=50] [--force-quota]",
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
    await backfillImages({
      cityId,
      apply: argv["apply"] === "true",
      forceQuota: argv["force-quota"] === "true",
      allowTs: argv["allow-ts"] === "true",
      limit: argv["limit"] ? Number(argv["limit"]) : undefined,
      client: c,
    });
    await c.end();
  })();
}
