// ⚠️ 수정금지(승인필요) 2026-09-03 사장님 결정 = 사진 단일 진입점 = 재링크 → PID 구글맵 공개페이지 무료(API 호출 0, 영업상태도 기입) → 유료(raw→PM·TS)는 사장님 명시 승인 플래그(--allow-pm / --allow-ts)에서만
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
  allowPm?: boolean;
  limit?: number;
  // ⚠️ 수정금지(승인필요) 2026-09-04 사장님 지시 = 지정한 행만 돌린다(도시 전체가 도는 사고 방지).
  ids?: number[];
  client: any;
}): Promise<{
  targets: number;
  relinked: number;
  pmFromRaw: number;
  freeGmaps: number;
  needTs: number;
  pmDone: number;
  gmapsDone: number;
  tsDone: number;
}> {
  const { cityId, apply, client: c } = opts;
  const limit = opts.limit ?? 1000;

  const relink = await relinkStorageImages({ cityId, apply, client: c });

  // ⚠️ 수정금지(승인필요) 2026-09-04 사장님 확정 = 이 단계 = 백필 + 검증(backfill-verify). PID 를 단 행이 대상이고, 사진이 없으면 채우고(백필) 있으면 6요소가 맞는지 대조한다(검증).
  //   검증 여부 = verified_at(NULL = 아직 PID 페이지로 대조 안 함). 위키 미러(`-wiki.`)는 구글 사진이 아니므로 결손으로 본다.
  //   사진 판별 = R2 키가 `place-images/{city}/{cat}/{PID}.jpg` 라 파일명이 곧 PID = 그 PID 로 받은 사진이면 다시 받지 않는다.
  const rows = (
    await c.query(
      `
    SELECT id, seed_category AS cat, name_en, name_local, address,
           latitude::float8 AS latitude, longitude::float8 AS longitude,
           google_place_id AS pid, google_review_count AS rc, business_status,
           image_url, verified_at,
           (image_url IS NOT NULL AND image_url LIKE '%place-images%'
            AND image_url NOT LIKE '%-wiki.%'
            AND position(google_place_id IN image_url) > 0) AS has_image
    FROM place_seed_raw
    WHERE city_id = $1 AND google_place_id IS NOT NULL
      AND (image_url IS NULL OR image_url = '' OR image_url NOT LIKE '%place-images%'
           OR image_url LIKE '%-wiki.%'
           OR position(google_place_id IN image_url) = 0
           OR verified_at IS NULL)
      ${opts.ids?.length ? "AND id = ANY($3::bigint[])" : ""}
    ORDER BY rank NULLS LAST, id LIMIT $2
  `,
      opts.ids?.length ? [cityId, limit, opts.ids] : [cityId, limit],
    )
  ).rows // ⚠️ 수정금지(승인필요) 2026-09-04 사장님 확정 = 재링크로 사진이 해결된 행이라도 **검증(verified_at NULL)이 남았으면 대상**. 사진만 보던 옛 제외 폐기 §19.
    .filter((r: any) => !relink.matchedIds.has(r.id) || !r.verified_at);

  const rawMap = collectPhotoNamesFromRaw(cityId);
  const live = rows;
  // ⚠️ 수정금지(승인필요) 2026-09-03 사장님 결정 = PID 행은 전부 구글맵 공개페이지 무료 먼저, 사진 못 받은 행만 raw photoName 으로 PM (정본 §⑦)
  const freeGmaps = live.filter((r: any) => r.pid);
  const withRaw = freeGmaps.filter((r: any) => rawMap.get(r.pid)?.photoName);
  // ⚠️ 수정금지(승인필요) 2026-09-03 사장님 결정 = TS 계획치 = 무료·PM 이 모두 실패했을 때의 최대값(실제 대상 tsTargets 는 무료 시도 뒤 확정, 잔량 게이트도 그때 호출)
  const tsMax = freeGmaps.length;
  console.log(`═══ backfill-verify (city ${cityId}) = 백필+검증 ═══`);
  // ⚠️ 수정금지(승인필요) 2026-09-03 사장님 결정 = 유료(PM·TS) 잔량·계획은 표시만, 실제 호출은 --allow-pm/--allow-ts 승인 시에만
  const { simulateCost, gateBatch } = await import(
    "../shared/external-call-log"
  );
  const simPm = await simulateCost(
    "pm",
    withRaw.length + (opts.allowTs ? tsMax : 0),
  );
  const simTs = await simulateCost("ts", opts.allowTs ? tsMax : 0);
  console.log(
    `[시뮬] PM 이달 ${simPm.used}/${simPm.cap} 잔량 ${simPm.remaining} · 계획 ${simPm.planned} → 추가과금 €${simPm.extraEur} | TS 이달 ${simTs.used}/${simTs.cap} 잔량 ${simTs.remaining} · 계획 ${simTs.planned} → 추가과금 €${simTs.extraEur}`,
  );
  console.log(
    `대상(백필+검증) ${rows.length} | 무료재링크 ${apply ? relink.relinked : relink.relinkable}(${apply ? "완료" : "가능"}) | 구글맵 무료 ${freeGmaps.length}건(전 PID 행) | 무료 실패 시 raw→PM 가능 ${withRaw.length}건 | TS = 무료·PM 둘 다 실패분만(--allow-ts 승인 시)`,
  );
  if (!apply) {
    for (const r of live.slice(0, 30))
      console.log(
        `  [${r.pid ? "구글맵무료" : "TS필요"}${rawMap.get(r.pid)?.photoName ? "(실패시 raw→PM)" : ""}] #${r.id} ${r.name_local || r.name_en}`,
      );
    if (tsMax)
      console.log(
        `💡 운영(배포서버) 생성 raw 는 Storage(raw-responses)에 있음 = raw-storage-recall pull 선행 시 "TS필요"가 raw재활용으로 줄 수 있음(재과금 0).`,
      );
    console.log(
      `=== DRY (외부호출 0·쓰기 0) = --apply 로 실행${tsMax ? ", TS는 --allow-ts 필요" : ""} ===`,
    );
    return {
      targets: rows.length,
      relinked: relink.relinkable,
      pmFromRaw: withRaw.length,
      freeGmaps: freeGmaps.length,
      needTs: tsMax,
      pmDone: 0,
      gmapsDone: 0,
      tsDone: 0,
    };
  }

  // ⚠️ 2026-08-24 사장님 승인 = PM = 막지 않음(곧 사용자 기능 생김 = 제한 금지). BE가 잔량을 알 수 있게
  //   = TS 잔량 게이트는 실제 대상(tsTargets)이 확정되는 무료·PM 단계 뒤에서 호출(2026-09-03).
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
    throw new Error("backfill-verify: GOOGLE_MAPS_API_KEY 발급 실패 = PM 불가");
  if (!isR2Configured())
    throw new Error(
      "backfill-verify: R2 환경변수 미비 = 이미지 업로드 불가(무성실패 차단)",
    );

  let gmapsDone = 0,
    gmapsFail = 0;
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
  // ⚠️ 수정금지(승인필요) 2026-09-03 사장님 결정 = PID 행 = 구글맵 공개페이지 사진(API 호출 0) 먼저, 못 받은 행만 raw→PM (정본 §⑦)
  const gmapsFailed: any[] = [];
  // ⚠️ 수정금지(승인필요) 2026-09-04 사장님 결정 = 관문 탈락(= 우리 이름과 PID 가 다른 장소) 목록 = 중복·오염 판정 결과
  const gateFailed: {
    row: any;
    gate: string;
    page: string | null;
    photo: boolean;
  }[] = [];
  if (freeGmaps.length) {
    const { chromium } = await import("playwright");
    const { BROWSER_UA } = await import(
      pathToFileURL(
        path.join(
          ROOT,
          "server/services/fill/gmaps-pid-identity/page-reader.ts",
        ),
      ).href
    );
    // ⚠️ 수정금지(승인필요) 2026-09-04 = 판정·쓰기는 gmaps-pid-identity 1벌을 그대로 가져다 쓴다(§16 재발명 금지).
    const { evaluateRow, initResult, isWritable, nameTokens } = await import(
      pathToFileURL(
        path.join(ROOT, "server/services/fill/gmaps-pid-identity/gates.ts"),
      ).href
    );
    const { writeRow, pickPageName } = await import(
      pathToFileURL(
        path.join(ROOT, "server/services/fill/gmaps-pid-identity/apply.ts"),
      ).href
    );
    const { distanceKmFromCoords } = await import(
      pathToFileURL(path.join(ROOT, "server/services/shared/pool-radius.ts"))
        .href
    );
    const { PHOTO_MAX_WIDTH_PX } = await import(
      pathToFileURL(path.join(ROOT, "server/services/shared/ts-client.ts")).href
    );
    const cityRow = (
      await c.query(
        "SELECT name_en, latitude::float8 AS lat, longitude::float8 AS lng FROM cities WHERE id=$1",
        [cityId],
      )
    ).rows[0];
    const cityLat: number | null = cityRow?.lat ?? null;
    const cityLng: number | null = cityRow?.lng ?? null;
    const cityStop: Set<string> = nameTokens(cityRow?.name_en, new Set());
    const browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      userAgent: BROWSER_UA,
    });
    const page = await ctx.newPage();
    try {
      for (const r of freeGmaps) {
        try {
          // ⚠️ 수정금지(승인필요) 2026-09-04 사장님 결정 = 페이지 1회 방문 = 사진만 떼어오지 않고 gates.ts 관문(이름·좌표·리뷰수)까지 같은 방문에서 판정·기록(정본 §"열 때 한 번에")
          const gr = initResult({
            id: r.id,
            seed_category: r.cat,
            name_en: r.name_en,
            pid: r.pid,
            lat: r.latitude ?? null,
            lng: r.longitude ?? null,
            rc: r.rc ?? null,
            has_image: !!r.has_image,
          });
          await evaluateRow(
            {
              page,
              // ⚠️ 수정금지(승인필요) 2026-09-04 사장님 확정 = name_en 은 국제 공통 = 영어 = 7개국어가 다 맞는 기준. 페이지도 hl=en 으로 연다.
              lang: "en",
              photoWidth: PHOTO_MAX_WIDTH_PX,
              cityLat,
              cityLng,
              cityStop,
              distanceKmFromCoords,
            },
            {
              id: r.id,
              seed_category: r.cat,
              name_en: r.name_en,
              pid: r.pid,
              lat: r.latitude ?? null,
              lng: r.longitude ?? null,
              rc: r.rc ?? null,
              has_image: !!r.has_image,
            },
            gr,
          );
          // ⚠️ 수정금지(승인필요) 2026-09-04 사장님 확정 = 이름 불일치는 그 자리에서 PID 이름으로 일치시킨다(PID 가 진실). 단 페이지가 이름 대신 주소를 준 경우(지역·거리 = "75010 Paris")는 이름을 두고 주소만 받는다 = pickPageName 1벌 판정.
          if (!isWritable(gr.gate)) {
            gateFailed.push({
              row: r,
              gate: gr.gate,
              page: gr.name_local,
              photo: !!gr.photo_url,
            });
            const pageName = pickPageName(gr);
            if (!pageName) {
              console.warn(
                `  📍 이름 유지 #${r.id} ${r.name_en} = ${gr.gate} (페이지가 장소명을 안 줌 = 읽어낸 값만 갱신, 못 읽었으면 기존값 보존)`,
              );
            } else {
              gr.gate = "ok(name-realigned)";
              console.warn(
                `  🔧 이름 일치화 #${r.id} "${r.name_en}" → "${pageName}"`,
              );
            }
          }
          // ⚠️ 수정금지(승인필요) 2026-09-04 사장님 확정 = 유료(PM·TS) 대상은 **우리 행에 사진이 없는 행만**(r.has_image).
          //   페이지에 사진이 없다(gr.photo_url)는 것만 보면, 사진은 멀쩡한데 검증만 안 된 행(verified_at NULL)이 유료 경로로 들어가 기존 R2 사진을 덮어쓴다(§9 유료호출 낭비).
          if (!gr.photo_url && !r.has_image) {
            gmapsFail++;
            gmapsFailed.push(r);
            console.warn(`  ⚠️ 사진 없음 #${r.id} ${r.name_en}`);
          }
          await writeRow(
            upsertPlace,
            cityId,
            {
              id: r.id,
              seed_category: r.cat,
              name_en: r.name_en,
              pid: r.pid,
              lat: r.latitude ?? null,
              lng: r.longitude ?? null,
              rc: r.rc ?? null,
              has_image: !!r.has_image,
            },
            gr,
          );
          if (gr.photo_url) {
            gmapsDone++;
            console.log(
              `  ✅ 구글맵무료 #${r.id} ${r.name_en} (${gr.gate}${gr.rc_page != null ? `, RC ${gr.rc_page}` : ""})`,
            );
          }
        } catch (e) {
          gmapsFail++;
          // 예외로 끝난 행도 **우리 행에 사진이 없을 때만** 유료 대상 = 위와 같은 기준 1벌.
          if (!r.has_image) gmapsFailed.push(r);
          console.warn(`  ⚠️ 실패 #${r.id}:`, (e as Error).message);
        }
      }
    } finally {
      await browser.close().catch(() => {});
    }
  }
  const pmCandidates = gmapsFailed.filter(
    (r: any) => rawMap.get(r.pid)?.photoName,
  );
  const pmFixed = new Set<number>();
  if (opts.allowPm) {
    for (const r of pmCandidates) {
      const before = pmDone;
      try {
        await runPm(r, rawMap.get(r.pid)!.photoName!);
        if (pmDone > before) pmFixed.add(r.id);
      } catch (e) {
        pmFail++;
        console.warn(`  ⚠️ PM 실패 #${r.id}:`, (e as Error).message);
      }
    }
  } else if (pmCandidates.length) {
    console.log(
      `⏸ 무료 실패 ${gmapsFailed.length}건 중 raw→PM 가능 ${pmCandidates.length}건 = 보류(유료 = --allow-pm 승인 시에만): ${pmCandidates.map((r: any) => `#${r.id}`).join(" ")}`,
    );
  }
  if (!opts.allowTs && gmapsFailed.length)
    console.log(
      `⏸ 무료 실패 ${gmapsFailed.length}건 = TS 보류(유료 = --allow-ts 승인 시에만)`,
    );

  // ⚠️ 수정금지(승인필요) 2026-09-03 사장님 결정 = TS 는 마지막 수단 = 무료(구글맵)·PM 둘 다 실패해 아직 이미지가 없는 행만, --allow-ts 승인 시에만
  const tsTargets = gmapsFailed.filter((r: any) => !pmFixed.has(r.id));
  if (opts.allowTs && tsTargets.length) {
    await gateBatch("ts", tsTargets.length, { force: !!opts.forceQuota });
  }
  if (opts.allowTs) {
    for (const r of tsTargets) {
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
    `✅ 완료: PM ${pmDone}건 저장${pmFail ? ` · PM 실패 ${pmFail}건` : ""} · 구글맵무료 ${gmapsDone}건${gmapsFail ? ` · 무료 실패 ${gmapsFail}건` : ""} · TS ${tsDone}콜${!opts.allowTs && tsTargets.length ? ` · TS필요 ${tsTargets.length}건 보류(--allow-ts)` : ""}`,
  );

  // ⚠️ 수정금지(승인필요) 2026-09-04 사장님 확정 = PID 가 정답 = 페이지 좌표가 **자기 도시에서 100km 밖**인 행만 이동 대상(버리지 않고 맞춰 놓는다).
  //   처리한 행 전부를 --ids 로 넘기면 그 경로가 거리 필터를 건너뛰어(수동지정) 근교 위성도시(몽생미셸↔노르망디 등)로 멀쩡한 행까지 옮겨진다 = 2026-09-04 브뤼헤→릴 사고.
  if (apply && rows.length) {
    const far = (
      await c.query(
        `SELECT p.id FROM place_seed_raw p JOIN cities ci ON ci.id = p.city_id
          WHERE p.id = ANY($1::bigint[])
            AND p.latitude IS NOT NULL AND p.longitude IS NOT NULL
            AND p.latitude <> 0 AND p.longitude <> 0
            AND ci.latitude IS NOT NULL AND ci.longitude IS NOT NULL
            AND sqrt(power((p.latitude::float - ci.latitude::float) * 111320, 2)
                   + power((p.longitude::float - ci.longitude::float) * 111320
                           * cos(radians((p.latitude::float + ci.latitude::float) / 2)), 2)) > 100000`,
        [rows.map((x: any) => x.id)],
      )
    ).rows.map((x: any) => x.id);
    if (far.length) {
      const { spawnSync } = await import("child_process");
      const r = spawnSync(
        "npx",
        [
          "tsx",
          path.join(ROOT, "server/services/fill/wrongcity-quarantine.ts"),
          `--ids=${far.join(",")}`,
          "--apply",
        ],
        { stdio: "inherit", shell: true },
      );
      if (r.status !== 0) console.warn("  ⚠️ 소속오염 이동 단계 실패");
    } else {
      console.log("  소속오염(자기 도시 100km 밖) = 0건 = 이동 없음");
    }
  }
  // ⚠️ 수정금지(승인필요) 2026-09-04 사장님 결정 = 관문 탈락 = 우리 행과 PID 가 다른 장소 = 사장님이 눈으로 볼 수 있게 목록으로 낸다.
  //   사진 붙임 여부는 관문이 아니라 실제 결과(photo_url)로 표기 = "안 붙임"이라 적고 붙이던 거짓 보고 제거 §19.
  if (gateFailed.length) {
    console.log(`\n🔴 PID 오염 의심 ${gateFailed.length}건:`);
    for (const g of gateFailed)
      console.log(
        `   #${g.row.id} 우리="${g.row.name_en}" ↔ 구글="${g.page ?? "-"}" [${g.gate}] 사진 ${g.photo ? "붙임" : "없음"}`,
      );
  }
  return {
    targets: rows.length,
    relinked: relink.relinked,
    freeGmaps: freeGmaps.length,
    gmapsDone,
    pmFromRaw: withRaw.length,
    needTs: tsTargets.length,
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
  (process.argv[1] || "")
    .replace(/\\/g, "/")
    .endsWith("fill/backfill-verify.ts")
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
        "Usage: --city-id=<N> [--ids=a,b,c] [--apply] [--allow-pm] [--allow-ts] [--limit=50] [--force-quota] | --mirror-wiki [--city-id=<N>] [--apply]",
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
        allowPm: argv["allow-pm"] === "true",
        limit: argv["limit"] ? Number(argv["limit"]) : undefined,
        ids: argv["ids"]
          ? String(argv["ids"])
              .split(",")
              .map((x) => Number(x.trim()))
              .filter(Number.isFinite)
          : undefined,
        client: c,
      });
    }
    await c.end();
  })();
}
