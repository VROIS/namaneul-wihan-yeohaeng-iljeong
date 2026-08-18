// ⚠️ 수정금지(승인필요) = #45 = 식당+6cat 결손 완비 워크플로우 (사장님 SSOT 재작성 2026-06-16 = (가) 방식)
// = 원칙(사장님 SSOT 2026-06-16): AI 는 시스템을 만들 일에 소설 쓰지 않는다 = 검증된 컴포넌트만 호출하는 얇은 진입점.
//
//   [1 추출]   그 시점 PSR 에서 SQL 로 대상 = 우리 id 목록 (= 라이브 재계산 X, 저장된 rank 그대로).
//        풀 = 6cat TOP20(rank<=20) + 식당 가격대 30/90/30(band 내 rank 오름순), BTS 제외.
//        결손 = 12요소 중 하나라도 빔 (이미지는 place-images 아니면 결손 = WK·인스타 교체 대상).
//   [2 카피]   geminiCurate() (#07) = 최신 prompt.txt import = id 양방향 보존 = name_ko/summary_ko/editorial/price. 카테고리 안 줌.
//   [3 이미지] relinkStorageImages() (= 결제된 고아 Storage 무료 재링크 = PM 누수 차단) → 남은 결손만 tsSearch+tsPhoto(관문) PM.
//   [4 저장]   upsertPlace() (= DB 문지기 단일 진입점 = 7단계 매칭). 직접 SQL X. raw 2곳 저장 = 관문 자동(save-raw).
//
// 호출: npx tsx fillcity/repair.ts --city-id=19 [--only-id=N] [--apply]
//   --apply 없으면 DRY (= 추출 + 결손분포 + PM 예상 출력, DB·Storage·외부호출 0).
//   --only-id=N = 단일 행 격리 실증 (사장님 승인 2026-06-16). 미지정 시 전체 풀(기존 불변).
//   #45 = 항상 band 30/90/30(=150) 단일. (사장님 SSOT "원복" 2026-06-21 §19·§16)
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
// ⚠️ 수정금지(승인필요) 2026-08-18 사장님 승인(정규화) = --ids=a,b,c 정밀 타격 모드 = 노출 상위 구멍만 지정 수리
//   (표준풀 안에서 id 목록으로 한정 = 외부호출 최소단위 단계실행). --only-id 는 --ids 1개짜리와 동일 처리로 흡수.
const onlyIds: number[] | null = argv["ids"]
  ? String(argv["ids"])
      .split(",")
      .map((s) => Number(s.trim()))
      .filter(Number.isFinite)
  : argv["only-id"]
    ? [Number(argv["only-id"])]
    : null;
const onlyId = onlyIds && onlyIds.length === 1 ? onlyIds[0] : null; // 로그 표기 호환
// #45 식당 범위 = 항상 band 30/90/30(=150) 단일(추출 SQL rest CTE) = 항상 순수 Gemini·TS·PM 외부호출. (사장님 SSOT "원복" 2026-06-21 §19·§16)
// ⚠️ 수정금지(승인필요) = 출입증 키발급 날짜 inputDate (= YYYY-MM-DD = issue-api-key.ts 검문 형식). 함수 상단 1회 선언 = 모든 issueApiKey 호출 공유.
const inputDate = new Date().toISOString().slice(0, 10);
const SIXCAT_ALL = [
  "heritage",
  "hotspot",
  "attraction",
  "adventure",
  "healing",
  "shopping",
];
// ⚠️ 수정금지(승인필요) 2026-08-18 사장님 승인(스킬 조정 = 180규격·단계실행) = --cats=a,b 카테고리 선택 +
//   --skip-restaurant 식당 제외. 미지정 = 기존 전체(불변). 사유 = 외부호출을 단계별 최소단위로 나눠
//   전<>후 비교하며 실행(일괄 금지, 사장님 지시) + "식당 제외" 처방 도시(LA·토론토) 지원.
const SIXCAT = argv["cats"]
  ? String(argv["cats"])
      .split(",")
      .map((s) => s.trim())
      .filter((s) => SIXCAT_ALL.includes(s))
  : SIXCAT_ALL;
const skipRestaurant = argv["skip-restaurant"] === "true";
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
  // ⚠️ 2026-08-06 = 사진 저장 = R2(r2-client 단일 진입점). 옛 Supabase storageKey/supaPublicUrl 폐기 = Cloudflare 이전계획 1단계 §19.
  const { isR2Configured } = await import(
    pathToFileURL(path.join(ROOT, "server/services/shared/r2-client.ts")).href
  );

  // [1 추출] = 그 시점 PSR SQL = 우리 id 목록 (= 12요소 결손 행). 풀 = 6cat TOP20 + 식당 30/90/30. BTS 제외.
  //   사장님 SSOT 2026-06-16 = 저장된 rank 그대로 추출(라이브 ROW_NUMBER 재계산 X = #45 가 RC 덮어써 풀 흔드는 옛 결함 차단).
  const rows = (
    await c.query(
      `
    WITH base AS (
      SELECT id, name_local, name_en, address,
             latitude::float8 AS lat, longitude::float8 AS lng,
             price_eur::float8 AS price_eur, google_review_count AS rc,
             google_place_id, google_maps_uri, seed_category, rank, image_url,
             distance_km_from_center, summary_ko, editorial_summary,
             CASE WHEN price_eur <= 24 THEN 'eco' WHEN price_eur <= 60 THEN 'reason' ELSE 'premium' END AS band
      FROM place_seed_raw WHERE city_id=$1
        AND seed_category NOT IN ('bts_army_zone','bts_merch_store','bts_venue')
        -- ⚠️ 2026-08-18 사장님 승인 = 격리행(wrong-city-suspect) 제외 = 쓰레기 행에 유료호출 낭비 차단
        AND NOT (COALESCE(phase_tags,'{}') && ARRAY['wrong-city-suspect'])
        -- ⚠️ 수정금지(승인필요) = --ids/--only-id 지정 시 그 행들만 (정밀 타격/격리 실증). 미지정($3=NULL) 시 전체(기존 불변).
        AND ($3::bigint[] IS NULL OR id = ANY($3::bigint[]))
    ),
    sixcat AS (
      -- ⚠️ 2026-08-18 사장님 승인 = 저장 rank "순서"는 유지하되 격리행이 점유한 번호 갭을 건너뛰는 유효순위 상위 20
      --   (격리행이 rank 1~30을 점유해 신규 발굴행(rank 31+)이 통째로 추출 누락되던 결함 = 시카고 실측).
      SELECT id, name_local, name_en, address, lat, lng, price_eur, rc, google_place_id, google_maps_uri, seed_category,
             image_url, distance_km_from_center, summary_ko, editorial_summary
      FROM (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY seed_category ORDER BY rank ASC NULLS LAST) AS eff_rank
        FROM base WHERE seed_category = ANY($2::text[])
      ) x WHERE eff_rank <= 20
    ),
    rest_ranked AS (
      -- ⚠️ 2026-08-18 사장님 승인 = $4(skip-restaurant)=true 면 식당 풀 자체를 비움(LA·토론토 "식당 제외" 처방).
      SELECT *, ROW_NUMBER() OVER (PARTITION BY band ORDER BY rank ASC) AS band_rn
      FROM base WHERE seed_category='restaurant' AND price_eur IS NOT NULL AND NOT $4::boolean
    ),
    -- 식당 = band 30/90/30 단일. (사장님 SSOT "원복" 2026-06-21 §19)
    rest AS (
      SELECT id, name_local, name_en, address, lat, lng, price_eur, rc, google_place_id, google_maps_uri, seed_category,
             image_url, distance_km_from_center, summary_ko, editorial_summary
      FROM rest_ranked WHERE band_rn <= CASE band WHEN 'eco' THEN 30 WHEN 'reason' THEN 90 ELSE 30 END
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
      [cityId, SIXCAT, onlyIds, skipRestaurant],
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

  // [2 Gemini 1차 덮어쓰기] = 결손 전부 = geminiCurate 1콜(배치) -> name_ko·summary·editorial·price.
  //   사장님 SSOT = Gemini 먼저 = 다음 TS 검색 힌트 정확도 상승. id 양방향 보존(prompt.txt). 카테고리 안 줌(shopping null = 우리 저장단계).
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
    // ⚠️ 사장님 SSOT 2026-06-16 = 우리 id 직행 UPDATE (= 매칭 X). id=탄생 고유이름=불변 목적지 = 매칭(upsertPlace)이 다른 행으로 빗나감 방지. 신규 INSERT 없음.
    // ⚠️ 수정금지(승인필요) 2026-06-20 사장님 SSOT = 선별 금지 = Gemini 응답 전 필드 → 대응 컬럼 새 우선(COALESCE 새값,기존) 순서대로 덮어쓰기.
    //   = Gemini만 주는 요소(name_local·distance·price)가 여기서 채워짐 / name_en 은 1차(뒤 TS displayName 이 최종 덮음). §14 새우선.
    // ⚠️ 수정금지(승인필요) 2026-08-17 사장님 승인 = try/catch 추가(아래 TS단계·374줄과 동일 패턴 재사용, §16) = 이 직행 UPDATE도
    //   트리거([중복차단], 예: 다른 도시의 동명 장소와 불변5 충돌) 예외를 못 잡아 1행 문제로 전체 배치(218곳)가 죽던 결함 수정(2026-08-17 토론토 실행 실측).
    try {
      const u = await c.query(
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
      if (u.rowCount) copyDone++;
      console.log(
        `  + Gemini id=${r.id} ${r.name_local} (직행 ${u.rowCount ? "OK" : "NO"})`,
      );
    } catch (e: any) {
      console.log(
        `  X Gemini UPDATE 실패 id=${r.id} ${r.name_local}: ${e.message}`,
      );
    }
  }

  // [3 TS] = 결손 전부 = tsSearch -> 9요소 검증·갱신(pid·uri·rc·좌표·주소·name_local·photoName).
  //   사장님 SSOT = Gemini 갱신값 힌트로 TS 호출 = 정확 PID. TS 가 다른 PID 주면 = 우리 원 PID 오류 = upsertPlace(matcher PID veto 제거)가 교정.
  const { tsSearch, tsPhoto } = await import(
    pathToFileURL(path.join(ROOT, "server/services/shared/ts-client.ts")).href
  );
  // (issueApiKey = 상단에서 1회 import = 출입증 단일 진입점 = Gemini·TS·PM 3단계 공유)
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
          price_eur: t1.priceEur,
          photo_name: t1.photoName,
          google_maps_uri: t1.googleMapsUri,
          business_status: t1.businessStatus,
        },
      });
      // ⚠️ 사장님 SSOT 2026-06-16·2026-07-09 = 우리 id 직행 UPDATE = TS 전 응답값(PID 포함) 그대로 이 행에 덮음. PID 바뀌어도 id 불변 = 무조건 여기다. 매칭·중복재판별 X = 빗나감 X.
      //   = dupOwner 선조회 폐기 2026-07-09 §19(사장님 SSOT "어디로 갈지 아는 id 에서 결손만 찾아 그 행으로 직행", ag3 와 통일): 추출[1]에서 이미 결손 행의 id 확정 → 여기선 그 id 에 결손만 직행으로 채움.
      //     TS 가 준 PID 가 타도시 기존 행과 충돌하면(같은 장소가 이미 다른 도시에 있음) = 트리거(도시무관 불변1/2/4)가 EXCEPTION → 아래 바깥 try/catch(그 행만 스킵). 그 원행이 정답 = 이 결손행은 07-merge 병합 대상(§20).
      // ⚠️ 수정금지(승인필요) 2026-06-20 사장님 SSOT = 선별 금지 = TS 응답 전 필드 → 대응 컬럼 새 우선 덮어쓰기(중복요소 = Gemini 1차 → TS 가 뒤=최신=덮음, price 포함 동일 취급).
      //   가격 = 새 우선 덮어쓰기(=최신최우선, project_price_eur_ssot). shopping=price 안 줌 정합. TS price 거의 null = COALESCE 가 기존 Gemini price 보존.
      const priceEur =
        r.seed_category === "shopping" ? null : (t1.priceEur ?? null);
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
        price_eur = COALESCE($9::real, price_eur),
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
          priceEur,
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
  //   파일명 = 우리 표준(raw-filename.ts) = {날짜}_ts-defect-repair_candidates.json. 버전순번(versionedName) = 같은날 내용동일=덮어쓰기 / 다르면 _N.
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

  // [4 이미지 최종] = 무료 재링크(결제분 재활용=누수차단) -> 남은 결손만 PM(TS 가 준 photoName).
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
