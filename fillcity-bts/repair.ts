// ⚠️ 수정금지(승인필요) = #45 = 식당+6cat 결손 완비 워크플로우 (사장님 SSOT 재작성 2026-06-16 = (가) 방식)
//        풀 = 6cat TOP5(rank<=5) + 식당 RC랭킹 상위20(rank<=20), BTS 공연장·아미존·굿즈 제외. (BTS 전용 사본 = 2026-08-07 사장님 승인)
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
process.chdir(ROOT);
const env = fs.readFileSync(".env", "utf-8").replace(/^﻿/, "");
for (const line of env.split(/\r?\n/)) {
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
const cityId = Number(argv["city-id"] || 19);
const apply = argv["apply"] === "true";
// ⚠️ 수정금지(승인필요) = --only-id=N = 단일 행 격리 실증용 (사장님 승인 2026-06-16). 미지정 시 전체 풀(기존 동작 불변).
const onlyId = argv["only-id"] ? Number(argv["only-id"]) : null;
// #45 식당 범위(BTS 사본) = RC랭킹 상위20 고정(추출 SQL rest CTE) = 항상 순수 Gemini·TS·PM 외부호출. (2026-08-07 사장님 승인)
// ⚠️ 수정금지(승인필요) = 출입증 키발급 날짜 inputDate (= YYYY-MM-DD = issue-api-key.ts 검문 형식). 함수 상단 1회 선언 = 모든 issueApiKey 호출 공유.
const inputDate = new Date().toISOString().slice(0, 10);
const SIXCAT = [
  "heritage",
  "hotspot",
  "attraction",
  "adventure",
  "healing",
  "shopping",
];
const ANCHOR_M = 10; // ⚠️ 수정금지(승인필요) 2026-06-23 사장님 SSOT = 좌표 앵커 무조건 10m(매칭기준 동일=도심밀집 환각차단).

(async () => {
  const pg = await import("pg");
  const c = new (pg as any).default.Client({
    connectionString:
      process.env.SUPA_URL ||
      process.env.SUPABASE_DATABASE_URL ||
      process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  // ⚠️ 수정금지(승인필요) 2026-06-18 = 외부호출 3종(Gemini·TS·PM) 키는 각 단계 직전 issueApiKey 로만 발급(= 채움 hasRow=true 검문). 부팅로더식 일괄 직독 X.
  const { issueApiKey } = await import(
    pathToFileURL(path.join(ROOT, "server/services/shared/issue-api-key.ts"))
      .href
  );
  const city = (
    await c.query("SELECT name_en, country_code FROM cities WHERE id=$1", [
      cityId,
    ])
  ).rows[0];
  if (!city) {
    await c.end();
    console.error(`X city ${cityId} 미존재`);
    process.exit(1);
  }
  const { isR2Configured } = await import(
    pathToFileURL(path.join(ROOT, "server/services/shared/r2-client.ts")).href
  );

  //   사장님 SSOT 2026-06-16 = 저장된 rank 그대로 추출(라이브 ROW_NUMBER 재계산 X = #45 가 RC 덮어써 풀 흔드는 옛 결함 차단).
  const rows = (
    await c.query(
      `
    WITH base AS (
      SELECT id, name_local, name_en, address,
             latitude::float8 AS lat, longitude::float8 AS lng,
             price_eur::float8 AS price_eur, google_review_count AS rc,
             google_place_id, google_maps_uri, seed_category, rank, image_url,
             distance_km_from_center, summary_ko, editorial_summary
      FROM place_seed_raw WHERE city_id=$1
        AND seed_category NOT IN ('bts_army_zone','bts_merch_store','bts_venue')
        -- ⚠️ 수정금지(승인필요) = --only-id 지정 시 단일 행만 (격리 실증). 미지정($3=NULL) 시 전체(기존 불변).
        AND ($3::bigint IS NULL OR id=$3::bigint)
    ),
    -- ⚠️ 2026-08-07 사장님 승인 = BTS 전용 사본 = 보강 대상 = 6cat TOP5 (원본 20 → 5)
    sixcat AS (
      SELECT id, name_local, name_en, address, lat, lng, price_eur, rc, google_place_id, google_maps_uri, seed_category,
             image_url, distance_km_from_center, summary_ko, editorial_summary
      FROM base WHERE seed_category = ANY($2::text[]) AND rank BETWEEN 1 AND 5
    ),
    -- ⚠️ 2026-08-07 사장님 승인 = BTS 전용 사본 = 식당 = RC 랭킹(=DB autorank 트리거가 RC DESC 로 부여한 rank) 상위 20.
    --   = 옛 가격대 band 30/90/30(=150) 폐기 = 2026-08-07 §19. 앱이 쓰는 식당 후보 상한이 20(server/bts-routes.ts) = 그 이상 보강은 낭비(이미지=최대비용).
    --   = price_eur 유무 무관(옛 band 는 price 있는 행만 대상이라 가격 결손 식당이 보강에서 빠지는 구멍이 있었음).
    rest AS (
      SELECT id, name_local, name_en, address, lat, lng, price_eur, rc, google_place_id, google_maps_uri, seed_category,
             image_url, distance_km_from_center, summary_ko, editorial_summary
      FROM base WHERE seed_category='restaurant' AND rank BETWEEN 1 AND 20
    ),
    pool AS (SELECT * FROM sixcat UNION SELECT * FROM rest)
    SELECT id, name_local, name_en, address, lat, lng, price_eur, rc, google_place_id, google_maps_uri, seed_category,
           image_url, distance_km_from_center, summary_ko, editorial_summary,
           ARRAY_REMOVE(ARRAY[
             CASE WHEN google_place_id IS NULL THEN 'pid' END,
             CASE WHEN rc IS NULL THEN 'rc' END,
             CASE WHEN image_url IS NULL OR image_url='' OR image_url NOT LIKE '%place-images%' THEN 'image' END,
             CASE WHEN google_maps_uri IS NULL OR google_maps_uri='' THEN 'uri' END,
             CASE WHEN lat IS NULL OR lng IS NULL THEN 'coords' END,
             CASE WHEN address IS NULL OR address='' THEN 'addr' END,
             CASE WHEN price_eur IS NULL AND seed_category <> 'shopping' THEN 'price' END,
             CASE WHEN name_local IS NULL OR name_local='' THEN 'name_local' END,
             CASE WHEN distance_km_from_center IS NULL THEN 'distance' END,
             CASE WHEN summary_ko IS NULL OR summary_ko='' THEN 'summary_ko' END,
             CASE WHEN editorial_summary IS NULL OR editorial_summary='' THEN 'editorial' END
           ], NULL) AS missing
    FROM pool
    WHERE (
         google_place_id IS NULL OR rc IS NULL
      OR image_url IS NULL OR image_url='' OR image_url NOT LIKE '%place-images%'
      OR google_maps_uri IS NULL OR google_maps_uri=''
      OR lat IS NULL OR lng IS NULL OR address IS NULL OR address=''
      OR (price_eur IS NULL AND seed_category <> 'shopping')
      OR name_local IS NULL OR name_local=''
      OR distance_km_from_center IS NULL
      OR summary_ko IS NULL OR summary_ko='' OR editorial_summary IS NULL OR editorial_summary=''
    )
    ORDER BY seed_category, rc DESC NULLS LAST`,
      [cityId, SIXCAT, onlyId],
    )
  ).rows;

  console.log(
    `=== #45 결손완비 (city ${cityId} ${city.name_en})${onlyId ? ` [ONLY id=${onlyId}]` : ""} = 대상 ${rows.length}곳 ${apply ? "(APPLY)" : "(DRY)"} ===`,
  );
  if (!rows.length) {
    console.log("= 결손 0 = 완비 = 종료");
    await c.end();
    return;
  }
  const missCount: Record<string, number> = {};
  for (const r of rows)
    for (const m of r.missing || []) missCount[m] = (missCount[m] || 0) + 1;
  console.log(
    `[결손 분포] ${Object.entries(missCount)
      .map(([k, v]) => `${k} ${v}`)
      .join(" / ")}`,
  );

  // [채움 계획] = 사장님 SSOT 2026-06-16 = 결손 행 "전부"를 Gemini·TS 양쪽 통째로 (구별 X). 순서 = Gemini 1차 → TS → 이미지 최종.
  console.log(
    `[채움 계획] 전체 ${rows.length}곳 = Gemini 1콜(1차 덮어쓰기) -> TS ${rows.length}콜(검증·PID교정) -> 이미지 최종(무료재링크->PM)`,
  );
  if (!apply) {
    console.log(`\n=== DRY 완료 (--apply 로 Gemini->TS->이미지 집행) ===`);
    await c.end();
    return;
  }
  // ⚠️ 수정금지(승인필요) 2026-06-18 = 외부호출 키는 각 단계 issueApiKey 가 발급(미달=throw). 여기선 이미지 저장용 R2 설정만 사전 점검(2026-08-06 R2 전환).
  if (!isR2Configured()) {
    console.error("X R2 설정 미비 = 이미지 업로드 불가");
    await c.end();
    return;
  }

  // ⚠️ 수정금지(승인필요) 2026-06-19 = Gemini 키 = 출입증 직독(채움 hasRow=true) = TS·PM 과 동일 방식 = process.env 우회 0.
  // 항상 순수 geminiCurate 외부호출. (사장님 SSOT "원복" 2026-06-21 §19)
  const geminiKey = await issueApiKey(
    c,
    "GEMINI_API_KEY",
    cityId,
    inputDate,
    true,
  );
  const { geminiCurate } = await import(
    pathToFileURL(path.join(ROOT, "server/services/shared/gemini-curate.ts"))
      .href
  );
  const curated = await geminiCurate(
    city.name_en,
    cityId,
    rows.map((r: any) => ({
      id: r.id,
      nameEn: r.name_en,
      nameLocal: r.name_local,
      nameKo: null,
      address: r.address,
      latitude: r.lat,
      longitude: r.lng,
    })),
    { apiKey: geminiKey },
  );
  const gById = new Map<number, any>(curated.map((g: any) => [g.id, g]));
  let copyDone = 0;
  for (const r of rows) {
    const g = gById.get(r.id);
    if (!g) {
      console.log(`  ! Gemini 응답없음 id=${r.id} ${r.name_local}`);
      continue;
    }
    const priceEur =
      r.seed_category === "shopping" ? null : (g.priceEur ?? null);
    // ⚠️ 수정금지(승인필요) 2026-06-20 사장님 SSOT = 선별 금지 = Gemini 응답 전 필드 → 대응 컬럼 새 우선(COALESCE 새값,기존) 순서대로 덮어쓰기.
    // ⚠️ 2026-08-07 사장님 승인(BTS 사본 전용) = 중복차단 트리거 예외처리.
    let u: any = { rowCount: 0 };
    try {
      u = await c.query(
        `UPDATE place_seed_raw SET
        name_local = COALESCE(NULLIF($2,''), name_local),
        name_en = COALESCE(NULLIF($3,''), name_en),
        name_ko = COALESCE(NULLIF($4,''), name_ko),
        address = COALESCE(NULLIF($5,''), address),
        latitude = COALESCE($6::real, latitude),
        longitude = COALESCE($7::real, longitude),
        summary_ko = COALESCE(NULLIF($8,''), summary_ko),
        editorial_summary = COALESCE(NULLIF($9,''), editorial_summary),
        price_eur = COALESCE($10::real, price_eur),
        distance_km_from_center = COALESCE($11::numeric, distance_km_from_center),
        updated_at = NOW()
      WHERE id=$1`,
        [
          r.id,
          g.nameLocal ?? null,
          g.nameEn ?? null,
          g.nameKo ?? null,
          g.address ?? null,
          g.latitude ?? null,
          g.longitude ?? null,
          g.summaryKo ?? null,
          g.editorialSummary ?? null,
          priceEur,
          g.distanceKmFromCenter ?? null,
        ],
      );
    } catch (e: any) {
      console.log(
        `  ! Gemini SKIP id=${r.id} ${r.name_local} = ${e.message?.slice(0, 80)}`,
      );
      continue; // 이 행만 건너뜀 = 다음 행 계속(TS·PM 단계에서도 이 행은 자연히 결손 유지)
    }
    if (u.rowCount) copyDone++;
    console.log(
      `  + Gemini id=${r.id} ${r.name_local} (직행 ${u.rowCount ? "OK" : "NO"})`,
    );
  }

  const { tsSearch, tsPhoto } = await import(
    pathToFileURL(path.join(ROOT, "server/services/shared/ts-client.ts")).href
  );
  let tsDone = 0;
  const tsByOurId = new Map<number, any>();
  // ⚠️ 수정금지(승인필요) 2026-06-19 사장님 SSOT = TS 산출물 = 06 형태 모음(건건 X 보여줌) = results 배열 1파일. photo_name 1개(photos[0]), 정제 9요소만.
  const tsResults: any[] = [];
  // 항상 순수 tsSearch 외부호출. (사장님 SSOT "원복" 2026-06-21 §19)
  for (const r of rows) {
    try {
      const cur =
        (
          await c.query(
            "SELECT name_local, name_en, address, latitude::float8 AS lat, longitude::float8 AS lng FROM place_seed_raw WHERE id=$1",
            [r.id],
          )
        ).rows[0] || r;
      const hint = cur.name_local || cur.name_en || r.name_local || r.name_en;
      // ⚠️ 수정금지(승인필요) 2026-06-18 = TS 외부호출 직전 출입증 키발급 (= 채움 hasRow=true: 도시·행 검문 통과 시에만 키).
      const tsKey = await issueApiKey(
        c,
        "GOOGLE_MAPS_API_KEY",
        cityId,
        inputDate,
        true,
      );
      // ⚠️ 수정금지(승인필요) — languageCode 제거(2026-06-17 사장님 SSOT) = displayName 한국어 강제 안 함
      const ts = await tsSearch({
        apiKey: tsKey,
        method: "searchText",
        regionCode: city.country_code || "FR",
        cityId,
        ourId: r.id,
        rawTag: `fill-${hint || r.id}`,
        nameLocal: hint,
        address: cur.address ?? r.address,
        latitude: cur.lat ?? r.lat ?? null,
        longitude: cur.lng ?? r.lng ?? null,
        anchorRadiusM: (cur.lat ?? r.lat) != null ? ANCHOR_M : undefined,
        maxResults: 1,
        // ⚠️ 2026-06-19 사장님 SSOT = 건건 raw 로컬 생략(스토리지만) = 로컬엔 아래 candidates 모음 1파일만 = 폴더 깔끔.
        localSkipRaw: true,
      });
      const t1 = ts[0];
      if (!t1) {
        console.log(`  X TS 결과없음 id=${r.id} ${hint}`);
        tsResults.push({
          id: r.id,
          name: r.name_en,
          category: r.seed_category,
          status: "no_match",
        });
        continue;
      }
      tsByOurId.set(r.id, t1);
      // ⚠️ 수정금지(승인필요) 2026-06-19 = 06 형태 모음 = 정제 9요소 + photo_name 1개(top.photoName = photos[0]). Google 원본 photos 10장 통째 X.
      tsResults.push({
        id: r.id,
        name: r.name_en,
        category: r.seed_category,
        our_pid: r.google_place_id,
        our_image: !!r.image_url,
        status: "ok",
        ts: {
          place_id: t1.googlePlaceId,
          display_name_en: t1.nameEn,
          address: t1.address,
          lat: t1.latitude,
          lng: t1.longitude,
          review_count: t1.googleReviewCount,
          photo_name: t1.photoName,
          google_maps_uri: t1.googleMapsUri,
          business_status: t1.businessStatus,
        },
      });
      // ⚠️ 수정금지(승인필요) 2026-06-20 사장님 SSOT = 선별 금지 = TS 응답 전 필드 → 대응 컬럼 새 우선 덮어쓰기(중복요소 = Gemini 1차 → TS 가 뒤=최신=덮음).
      // ⚠️ 수정금지(승인필요) 2026-08-19 사장님 승인(§19) = TS발 price_eur UPDATE 완전삭제 = 가격의 유일한 정답은
      const u = await c.query(
        `UPDATE place_seed_raw SET
        -- ⚠️ 수정금지(승인필요) — TS displayName→name_en (2026-06-17 사장님 SSOT) = name_local은 Gemini전용 (= TS displayName(영어)을 name_en 칸으로 직행 UPDATE)
        name_en = COALESCE($2, name_en),
        address = COALESCE($3, address),
        latitude = COALESCE($4::real, latitude),
        longitude = COALESCE($5::real, longitude),
        google_place_id = COALESCE($6, google_place_id),
        google_maps_uri = COALESCE($7, google_maps_uri),
        google_review_count = COALESCE($8::integer, google_review_count),
        updated_at = NOW()
      WHERE id=$1`,
        // ⚠️ 수정금지(승인필요) — TS displayName→name_en (2026-06-17 사장님 SSOT) = name_local은 Gemini전용 (= TS결과 .nameLocal→.nameEn = TS는 nameLocal=null이므로 nameEn 읽어야 깨짐 방지)
        [
          r.id,
          t1.nameEn ?? null,
          t1.address ?? null,
          t1.latitude ?? null,
          t1.longitude ?? null,
          t1.googlePlaceId ?? null,
          t1.googleMapsUri ?? null,
          t1.googleReviewCount ?? null,
        ],
      );
      if (u.rowCount) tsDone++;
      // ⚠️ 수정금지(승인필요) — TS displayName→name_en (2026-06-17 사장님 SSOT) = name_local은 Gemini전용
      console.log(
        `  + TS id=${r.id} ${t1.nameEn || hint} (직행 ${u.rowCount ? "OK" : "NO"})`,
      );
    } catch (e: any) {
      console.log(`  X TS ERR id=${r.id} ${r.name_local}: ${e.message}`);
      tsResults.push({
        id: r.id,
        name: r.name_en,
        category: r.seed_category,
        status: "error",
        error: e.message,
      });
    }
  }

  // ⚠️ 수정금지(승인필요) 2026-06-19 사장님 SSOT = TS 산출물 모음 1파일(06 형태로 통일) = 이 시점 시행된 모든 장소를 results 배열로(건건 X = 보여줌).
  const { rawName, versionedName, rawHash } = await import(
    pathToFileURL(path.join(ROOT, "server/services/shared/raw-filename.ts"))
      .href
  );
  const tsOutDir = path.join(ROOT, "docs/raw", String(cityId));
  fs.mkdirSync(tsOutDir, { recursive: true });
  const tsStem = rawName(45, "ts-defect-repair", "candidates", inputDate);
  const tsHashOf = (p: string): string | null => {
    try {
      return rawHash(JSON.parse(fs.readFileSync(p, "utf-8")).results);
    } catch {
      return null;
    }
  };
  const tsOutPath = path.join(
    tsOutDir,
    versionedName(tsOutDir, tsStem, rawHash(tsResults), tsHashOf),
  );
  fs.writeFileSync(
    tsOutPath,
    JSON.stringify(
      {
        meta: {
          city_id: cityId,
          called_at: new Date().toISOString(),
          input_rows: rows.length,
          photo: "대표 1장(photo_name = photos[0])",
        },
        results: tsResults,
      },
      null,
      2,
    ),
  );
  console.log(
    `[TS 산출물 모음] ${tsResults.length}곳 = ${tsOutPath} (= 06 형태 1파일, photo 1개)`,
  );

  const { relinkStorageImages } = await import(
    pathToFileURL(
      path.join(ROOT, "server/services/fill/storage-image-relink.ts"),
    ).href
  );
  const relink = await relinkStorageImages({
    cityId,
    apply,
    client: c,
    categories: [...SIXCAT, "restaurant"],
  });
  if (relink.relinkable)
    console.log(
      `[무료 재링크] Storage 매칭 ${relink.relinkable}곳 = ${relink.relinked} 무료 채움 -> PM 제외`,
    );

  let imgDone = 0,
    imgNoPhoto = 0;
  // 항상 무료재링크→PM 순수 진행. (사장님 SSOT "원복" 2026-06-21 §19)
  for (const r of rows) {
    if (relink.matchedIds.has(r.id)) continue; // 무료재링크로 채워짐 = PM 제외
    const cur = (
      await c.query(
        "SELECT image_url, google_place_id, seed_category FROM place_seed_raw WHERE id=$1",
        [r.id],
      )
    ).rows[0];
    if (cur && cur.image_url && cur.image_url.includes("place-images"))
      continue; // 이미지 이미 있음 = PM 불필요
    const t1 = tsByOurId.get(r.id);
    if (!t1 || !t1.photoName) {
      imgNoPhoto++;
      continue;
    }
    try {
      const pid = t1.googlePlaceId || cur?.google_place_id;
      // ⚠️ 수정금지(승인필요) 2026-06-18 = PM 외부호출(3단계) 출입증 = 채움 hasRow=true 검문 통과 시에만 키.
      const pmKey = await issueApiKey(
        c,
        "GOOGLE_MAPS_API_KEY",
        cityId,
        inputDate,
        true,
      );
      const imageUrl = await tsPhoto({
        apiKey: pmKey,
        photoName: t1.photoName,
        pathKey: `${cityId}/${cur?.seed_category || r.seed_category}/${pid}`,
      }); // maxWidthPx 미지정 = 관문 기본 400(§16 단일 SSOT). 저장 = R2(2026-08-06)
      if (!imageUrl) {
        console.log(`  X 업로드실패 id=${r.id} ${r.name_local}`);
        continue;
      }
      // ⚠️ 사장님 SSOT 2026-06-16 = 우리 id 직행 UPDATE = 이미지 이 행에 직행. 매칭 X.
      const u = await c.query(
        `UPDATE place_seed_raw SET image_url=$2, image_updated_at=NOW(), updated_at=NOW() WHERE id=$1`,
        [r.id, imageUrl],
      );
      if (u.rowCount) {
        imgDone++;
        console.log(`  + 이미지 id=${r.id} ${r.name_local} (직행 OK)`);
      }
    } catch (e: any) {
      console.log(`  X 이미지 ERR id=${r.id} ${r.name_local}: ${e.message}`);
    }
  }

  console.log(
    `\n=== #45 결과 = Gemini ${copyDone} / TS ${tsDone} / 이미지(PM) ${imgDone} / 사진없음 ${imgNoPhoto} / 무료재링크 ${relink.relinked || 0} (외부호출 = 결손분만, 순서 Gemini->TS->이미지) ===`,
  );
  await c.end();
})();
