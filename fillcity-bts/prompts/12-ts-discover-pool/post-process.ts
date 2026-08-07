// ⚠️ 수정금지(승인필요) 2026-06-02 = ts-discover-pool 후처리 = 거리필터 + 가격대별 선정 + 중복先 + 비용先 + PM(필요분만) + upsertPlace
// 흐름 (= 사용자 SSOT 2026-06-02):
//   ① 거리 필터 (= Haversine ≤ radius×1.5 = locationBias 소프트 누수 제거: 생제르맹앙레 ← Les Deux Magots 도심)
//   ② OPERATIONAL 만 (= 폐업 배제 안전망)
//   ③ 수동가격 override (= manual-prices.ts = Google 가격 없는 행 = 사용자 직접조사)
//   ④ ★가격대별 quota 선정★ = MEAL_BUDGET tier 별 리뷰순 = Economic4 : Reasonable4 : Premium2 : unknown2 (= 동선 최적화 풀 정합)
//   ⑤ ★PM 전 중복 테스트★ = upsertPlace 5단계 근사(PID>좌표10m>이름9조합) = UPDATE vs INSERT
//   ⑥ ★비용 先보고★ = PM 필요 = 신규 + (기존인데 Google 이미지 無) / 절감 = 기존+Google이미지 = 스킵
//   ⑦ --apply 시에만 = PM(필요분만) → upsertPlace priceOverwrite=true(= endPrice 상한 덮어쓰기 오염청소) + phase_tags 'ts-pool-{date}'
//   ⑧ 삭제후보 = 그 태그 없는 외곽 식당 (= TS 미발견 = 보고만, 삭제 별도 승인 [[feedback_db_860eur_cost_no_proposals]])
// 가격 = endPrice(상한) 만 (= 현지 실망 방지) + tier = MEAL_BUDGET 직접 분류
// 호출:
//   npx tsx .../12-ts-discover-pool/post-process.ts --city-id=19 --zone=outskirt --date=2026-06-02 [--photo] [--apply]
//   (--apply 없으면 = dry-run = 쓰기 0 = 가격대 분포·중복·비용·unknown가격필요·삭제후보 미리보기만)
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { MANUAL_PRICE_EUR } from "./manual-prices";

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
const zone = String(argv["zone"] || "outskirt");
const date = String(argv["date"] || new Date().toISOString().slice(0, 10));
const downloadPhoto = argv["photo"] === "true";
const apply = argv["apply"] === "true";
// ⚠️ 수정금지(승인필요) 2026-06-03 = 비식당 카테고리 모드 = --category=hotspot --labels=hotspot,viewpoint,... (= 식당 흐름과 완전 분리)
const category = argv["category"] ? String(argv["category"]) : "";
const labels = argv["labels"]
  ? String(argv["labels"])
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  : category
    ? [category]
    : [];
if (!cityId) {
  console.error(
    "Usage: --city-id=<N> --zone=outskirt --date=<YYYY-MM-DD> [--photo] [--apply] [--category=hotspot --labels=hotspot,viewpoint]",
  );
  process.exit(1);
}

// ⚠️ 가격대별 quota (= 동선 최적화 풀 = 사용자 SSOT 2026-06-02 = eco4:reason4:premium2 + unknown2)
// = Premium + Luxury 통합 (= MEAL_BUDGET 둘 다 €300/일 동일 등급 = 사용자 SSOT 2026-06-02)
const QUOTA: Record<string, number> = {
  Economic: 4,
  Reasonable: 4,
  Premium: 2,
  unknown: 2,
};

const hkm = (a: any, b: any) => {
  const R = 6371,
    dLat = ((b.lat - a.lat) * Math.PI) / 180,
    dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((a.lat * Math.PI) / 180) *
      Math.cos((b.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
};
// ⚠️ 2026-06-02 = NFD 후 NFC 재결합 필수 (= 한글 자모분해 → 빈문자열 충돌 버그 방지). Latin 악센트만 제거.
const norm = (s: string | null) =>
  (s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .normalize("NFC")
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]/g, "");
// 구글(PM 결제) 이미지 판정 = R2 place-images (옛 SP place-photos 경로는 창고 철거로 소멸 = 2026-08-07 §19/1-5b.
//   DB 잔존 옛 URL도 인정 유지 = 있던 이미지를 PM 재호출로 이중 지불하지 않기 위함)
const isGoogleImg = (url: string | null) =>
  !!url && (url.includes("/place-images/") || url.includes("/place-photos/"));
// ⚠️ 수정금지(승인필요) 2026-06-02 = 비식당 primaryType 블랙리스트 (= 사용자 SSOT = 백화점/영화관/호텔/박물관 = 원 카테고리 유지 = 식당풀 제외)
//   = 블랙리스트 방식 = includedType=restaurant 라도 leak 되는 명백한 비식당만 제외 / 나머지(pastry_shop·gastropub·brewery·bar 등 음식)는 모두 유지 (= 진짜 음식점 안 놓침)
const NON_FOOD_TYPES = new Set<string>([
  "department_store",
  "shopping_mall",
  "shopping_center",
  "supermarket",
  "grocery_store",
  "convenience_store",
  "clothing_store",
  "store",
  "movie_theater",
  "performing_arts_theater",
  "concert_hall",
  "casino",
  "bowling_alley",
  "amusement_park",
  "hotel",
  "lodging",
  "hostel",
  "motel",
  "resort_hotel",
  "bed_and_breakfast",
  "guest_house",
  "extended_stay_hotel",
  "museum",
  "art_gallery",
  "cultural_center",
  "tourist_attraction",
  "historical_landmark",
  "monument",
  "church",
  "park",
  "plaza",
  "gym",
  "spa",
  "library",
  "university",
  "school",
  "hospital",
  "pharmacy",
  "bank",
  "gas_station",
  "parking",
  "train_station",
  "subway_station",
]);
const isFoodType = (t: string | null) => !!t && !NON_FOOD_TYPES.has(t);
// ⚠️ 수정금지(승인필요) 2026-06-02 = 키별 RC 최고 1개만 유지(키 null=보존) + 줄면 로그 = place_id/name_norm 중복제거 공용
function dedupMaxRC(
  items: any[],
  keyFn: (p: any) => string | null,
  label: string,
): any[] {
  const best = new Map<string, any>();
  const noKey: any[] = [];
  for (const p of items) {
    const k = keyFn(p);
    if (!k) {
      noKey.push(p);
      continue;
    }
    const e = best.get(k);
    if (!e || (p.review_count || 0) > (e.review_count || 0)) best.set(k, p);
  }
  const out = [...best.values(), ...noKey];
  if (out.length < items.length)
    console.log(`${label}: ${items.length} → ${out.length}`);
  return out;
}
const PM_CALL_EUR = 0.007;

(async () => {
  // ⚠️ 수정금지(승인필요) 2026-06-02 = 합본 발굴 = zone 의 모든 변형 파일(nearby/text/premium/무label) 병합
  const rawDir = path.join(ROOT, "docs", "raw", String(cityId));
  // ⚠️ 수정금지(승인필요) — raw 버전순번(2026-06-16 SSOT) = 카테고리/식당 두 reader 공용 = base(zone-label)별 최신 _N 1개로 축약 = 중복집계 0
  const { latestVersionedByBase } = await import(
    pathToFileURL(path.join(ROOT, "server/services/shared/raw-filename.ts"))
      .href
  );

  // ⚠️ 수정금지(승인필요) 2026-06-03 사용자 SSOT = 비식당 카테고리 모드 (early return)
  //   = --labels 파일 병합 → 명백오류(렌탈listing/좌표無) 제외 → place_id+name_norm dedup → upsertPlace(seedCategory=category)
  //   = 매칭=기존 검증·정정 / 미매칭=신규 발굴. 식당 전용(NON_FOOD/가격tier/QUOTA/PM/orphan)은 일절 미적용.
  if (category) {
    const labelRe = labels.map(
      (l) =>
        new RegExp(
          `^\\d{4}-\\d{2}-\\d{2}_12-ts-discover_${zone}-${l}(_\\d+)?\\.json$`,
        ),
    ); // ⚠️ 수정금지(승인필요) — raw 파일명 표준화: 날짜앞 {date}_12-ts-discover_zone(-label) 형식 / (_\d+)?=버전순번 _N 포착(2026-06-16 SSOT)
    const catFiles = latestVersionedByBase(
      fs.readdirSync(rawDir).filter((f) => labelRe.some((re) => re.test(f))),
    ); // ⚠️ 수정금지(승인필요) — raw 버전순번(2026-06-16 SSOT) = label(zone-label)별 최신 _N 1개로 축약 = 중복집계 0
    if (!catFiles.length) {
      console.error(`✗ ${rawDir} 에 라벨 [${labels.join(",")}] 파일 없음`);
      process.exit(1);
    }
    const merged: any[] = [];
    for (const f of catFiles) {
      const j = JSON.parse(fs.readFileSync(path.join(rawDir, f), "utf-8"));
      for (const z of j.zones || [])
        for (const p of z.places || []) merged.push(p);
    }
    // 명백오류 = 숙박 렌탈 listing(장소 아님) + 좌표 없음 (= 사용자 SSOT "명백오류만 제외")
    const isLodging = (n: string) =>
      /personnes|chambres?|salles? de bain|canap[eé]-lit|\bBdR\b|appartement|studio meubl/i.test(
        n || "",
      );
    const errs = merged.filter(
      (p) => !(p.lat && p.lng) || isLodging(p.name_local || p.name),
    );
    let clean = merged.filter((p) => !errs.includes(p));
    clean = dedupMaxRC(clean, (p) => p.place_id, "place_id 중복");
    clean = dedupMaxRC(
      clean,
      (p) => norm(p.name_local || p.name),
      "name_norm 중복",
    );
    clean.sort((a, b) => (b.review_count || 0) - (a.review_count || 0));

    const pg2 = await import("pg");
    const cc2 = new (pg2 as any).default.Client({
      connectionString: process.env.SUPA_URL || process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });
    await cc2.connect();
    const cityRow = (
      await cc2.query("SELECT latitude, longitude FROM cities WHERE id=$1", [
        cityId,
      ])
    ).rows[0];
    const center = {
      lat: parseFloat(cityRow?.latitude) || 0,
      lng: parseFloat(cityRow?.longitude) || 0,
    };
    // ⚠️ 2026-06-03 = 거리 필터 제거 = 범위는 run.ts 의 locationRestriction(강제 사각형)이 발굴 단계에서 보장
    const exist = (
      await cc2.query(
        `SELECT id, name_en, name_local, name_ko, google_place_id AS pid, google_maps_uri AS uri, address, latitude AS lat, longitude AS lng FROM place_seed_raw WHERE city_id=$1 AND seed_category=$2`,
        [cityId, category],
      )
    ).rows;
    // ⚠️ 2026-07-18 사장님 SSOT = 미리보기 매칭(matchCandidate) 삭제 §19 = 중복 판정은 DB 트리거 단일 관문 전담(신규/흡수 = --apply 때 확정).
    console.log(
      `═══ 카테고리 모드 = ${category} (city=${cityId}, ${zone}, 파일 ${catFiles.length}: ${catFiles.join(", ")}) ═══`,
    );
    console.log(
      `병합 ${merged.length} → 명백오류 제외 ${errs.length}${errs.length ? " (" + errs.map((p) => p.name_local || p.name).join(" / ") + ")" : ""} → dedup 후 ${clean.length}`,
    );
    console.log(
      `기존 ${category} ${exist.length}곳 | upsert 후보 ${clean.length} (신규/흡수 판정 = --apply 때 트리거)`,
    );
    console.log(
      `RC순 상위20: ${clean
        .slice(0, 20)
        .map((p) => `${p.name_local || p.name}(${p.review_count || 0})`)
        .join(" · ")}`,
    );
    if (!apply) {
      console.log(`\n=== DRY-RUN (쓰기 0) === 실행: --apply`);
      await cc2.end();
      return;
    }
    await cc2.end();
    const { upsertPlace } = await import(
      pathToFileURL(path.join(ROOT, "server/services/place-upsert.ts")).href
    );
    let ins = 0,
      upd = 0,
      skip = 0;
    const conflicts: string[] = [];
    for (const p of clean) {
      const dkm = Math.round(hkm(center, p) * 10) / 10;
      try {
        const r = await upsertPlace({
          // ⚠️ 수정금지(승인필요) — TS displayName→name_en (2026-06-17 사장님 SSOT) = name_local은 Gemini전용 = TS는 nameLocal=null (place-upsert COALESCE가 기존 Gemini값 보존)
          cityId,
          seedCategory: category,
          nameEn: p.name_local || p.name,
          nameLocal: null,
          address: p.address || null,
          latitude: p.lat,
          longitude: p.lng,
          googlePlaceId: p.place_id,
          googleMapsUri: p.google_maps_uri || null,
          googleReviewCount: p.review_count ?? null,
          dayZone: dkm <= 10 ? "core" : "outskirt",
          distanceKmFromCenter: dkm,
          categoryTags: [category],
          phaseTags: [`ts-${category}-${date}`],
        });
        if (r.action === "inserted") ins++;
        else if (r.action === "updated") upd++;
        else skip++;
      } catch (e: any) {
        conflicts.push(
          `${p.name_local || p.name} [${e.constraint || e.code || (e.message || "").slice(0, 40)}]`,
        );
      }
    }
    console.log(
      `✓ ins=${ins} / upd=${upd} / skip=${skip} (${clean.length}곳, seed_category=${category})`,
    );
    if (conflicts.length) {
      console.log(
        `⚠️ UNIQUE 충돌 skip ${conflicts.length}: ${conflicts.join(" / ")}`,
      );
    }
    return;
  }

  // ⚠️ 수정금지(승인필요) — raw 파일명 표준화: 날짜앞 {date}_12-ts-discover_zone(-label) 형식 / startsWith 는 _N 도 잡으니 latestVersionedByBase 로 zone-label별 최신 1개 축약(2026-06-16 SSOT) = 중복집계 0
  const files = latestVersionedByBase(
    fs
      .readdirSync(rawDir)
      .filter(
        (f) =>
          f.startsWith(`${date}_12-ts-discover_${zone}`) && f.endsWith(".json"),
      ),
  );
  if (!files.length) {
    console.error(
      `✗ ${rawDir}/${date}_12-ts-discover_${zone}*.json 미존재 = run.ts 먼저`,
    );
    process.exit(1);
  }
  const mergedZones: any[] = [];
  for (const f of files) {
    const j = JSON.parse(fs.readFileSync(path.join(rawDir, f), "utf-8"));
    mergedZones.push(...(j.zones || []));
  }
  const raw = { zones: mergedZones };
  console.log(`병합 raw ${files.length}개: ${files.join(" + ")}`);
  const TAG = `ts-pool-${date}`;
  const manualMap = new Map(
    Object.entries(MANUAL_PRICE_EUR).map(([k, v]) => [norm(k), v]),
  );

  const { MEAL_BUDGET } = await import(
    pathToFileURL(path.join(ROOT, "server/services/agents/types.ts")).href
  );
  const tierOf = (p: number | null): string => {
    if (p == null) return "unknown";
    // ⚠️ 사용자 SSOT 2026-06-02 = Luxury(끼당 €181+) → Premium 통합 (= 같은 고가 등급 = 일한도 €300)
    for (const [style, b] of Object.entries(MEAL_BUDGET) as any)
      if (p >= b.min && p <= b.max)
        return style === "Luxury" ? "Premium" : style;
    return "unknown";
  };

  const pg = await import("pg");
  const c = new (pg as any).default.Client({
    connectionString: process.env.SUPA_URL || process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const city = (
    await c.query(
      "SELECT name_en, latitude, longitude FROM cities WHERE id=$1",
      [cityId],
    )
  ).rows[0];
  const cityCenter = {
    lat: parseFloat(city?.latitude) || 0,
    lng: parseFloat(city?.longitude) || 0,
  };
  const existing = (
    await c.query(
      `SELECT id, name_en, name_local, name_ko, google_place_id AS pid, google_maps_uri AS uri, address, latitude AS lat, longitude AS lng, day_zone, image_url, phase_tags
     FROM place_seed_raw WHERE city_id=$1 AND seed_category='restaurant'`,
      [cityId],
    )
  ).rows;
  // ⚠️ 2026-07-18 사장님 SSOT = 미리보기 매칭(matchCandidate) 삭제 §19 = 중복 판정은 DB 트리거 단일 관문 전담.
  //   = 여기 남는 조회 = PM 비용 최적화 전용(PID 로 기존 행 이미지 유무만 조회 = "이미 이미지 있으면 PM 스킵"). 매칭(어느 행과 같은가) 아님 = PID 직조회로 충분.
  const existByPid = new Map<string, any>();
  for (const e of existing) if (e.pid) existByPid.set(e.pid, e);

  // ── ① 거리 + ② OPERATIONAL + ③ 수동가격 + ④ 가격대별 quota ──
  const kept: any[] = [];
  const drop = { noCoord: 0, closed: 0, nonfood: 0 }; // ⚠️ (B) 2026-06-10 = noCoord/nonfood=제외+로그 / closed=입력+플래그 카운트 (거리=입력)
  const nonfoodList: string[] = [];
  let manualHit = 0;
  for (const z of raw.zones) {
    // ⚠️ 수정금지(승인필요) 2026-06-10 (B정책) = 잡것(좌표없음·비식당)만 제외+로그 / 진짜 장소(폐업·거리초과)는 입력하되 플래그 (= 누수 0 + DB오염 0). 옛 좌표없음 silent drop + 거리 드롭 폐기.
    const pass = z.places.filter((p: any) => {
      if (!p.lat || !p.lng) {
        drop.noCoord++;
        nonfoodList.push(`${p.name}(좌표없음)`);
        return false;
      } // 좌표없음 = 잡것 = 제외+로그
      if (p.primary_type && !isFoodType(p.primary_type)) {
        drop.nonfood++;
        nonfoodList.push(`${p.name}(${p.primary_type})`);
        return false;
      } // 비식당 = 원 카테고리로 들어감 = 식당풀 제외+로그
      return true; // 폐업·거리초과 = 진짜 장소 = 통과(입력)
    });
    for (const p of pass) {
      p._closed = !!(p.business_status && p.business_status !== "OPERATIONAL");
      if (p._closed) drop.closed++;
    } // (B) 폐업 = 입력하되 마커(PM·FE 제외용)
    // 수동가격 override (= unknown 만)
    for (const p of pass)
      if (p.price_eur == null) {
        const o = manualMap.get(norm(p.name));
        if (o != null) {
          p.price_eur = o;
          manualHit++;
        }
      }
    // ⚠️ 수정금지(승인필요) 2026-06-02 = 입력 = broad (= 거리/영업 필터된 전부, quota 컷 없음 = 사용자 SSOT)
    //   = 가격대별 quota(QUOTA)는 입력 단계가 아니라 이후 Gemini 요약 추출 단계에 적용
    //   = 중복은 upsertPlace 5단계가 자동 제거 (= dup PID 0 입증)
    for (const p of pass)
      kept.push({
        ...p,
        zone: z.name,
        tier: tierOf(p.price_eur),
        distFromCity: Math.round(hkm(cityCenter, p) * 10) / 10,
      });
  }
  // ⚠️ 수정금지(승인필요) 2026-06-02 = 합본 발굴 = place_id + name_norm 중복 제거 (= RC 높은 1개 / 동명이점 UNIQUE 충돌 방지)
  {
    let d = dedupMaxRC(
      kept,
      (p) => p.place_id,
      "합본 내부 중복 제거(place_id)",
    );
    d = dedupMaxRC(d, (p) => norm(p.name), "동명 정규화 중복 제거(name_norm)");
    kept.length = 0;
    kept.push(...d);
  }

  // ── ⑤ PM 비용 최적화 = PID 로 기존 행 조회(이미지 있으면 PM 스킵). 중복 판정 아님(트리거 전담) = PID 직조회 §19 2026-07-18 ──
  for (const p of kept) {
    p._match = p.place_id ? existByPid.get(p.place_id) || null : null;
    p._pmNeed = !p._closed && (!p._match || !isGoogleImg(p._match.image_url));
  } // (B) 폐업 = PM 안 함(이미지 비용 절약)
  const updP = kept.filter((p) => p._match),
    insP = kept.filter((p) => !p._match);
  const pmNeed = kept.filter((p) => p._pmNeed),
    pmSave = kept.length - pmNeed.length;

  // 가격대 분포 + unknown 가격필요 목록
  const spread: Record<string, number> = {};
  for (const p of kept) spread[p.tier] = (spread[p.tier] || 0) + 1;
  const needPrice = kept.filter((p) => p.tier === "unknown");

  // ── ⑧ 삭제후보 ──
  const keptPids = new Set(kept.map((p) => p.place_id));
  const keptNames = new Set(kept.map((p) => norm(p.name)));
  // ⚠️ 수정금지(승인필요) 2026-06-02 = zone 스코프 = downtown(시내 ≤10km/core/null) vs outskirt(>10km)
  const zoneEx =
    zone === "downtown"
      ? existing.filter(
          (e: any) =>
            e.day_zone === "core" ||
            e.day_zone == null ||
            (e.lat && hkm(cityCenter, e) <= 10),
        )
      : existing.filter(
          (e: any) =>
            e.day_zone === "outskirt" || (e.lat && hkm(cityCenter, e) > 10),
        );
  const orphans = zoneEx.filter(
    (e: any) =>
      !(e.pid && keptPids.has(e.pid)) &&
      ![e.name_en, e.name_local, e.name_ko].some(
        (n) => n && keptNames.has(norm(n)),
      ) &&
      !kept.find((p) => e.lat && e.lng && hkm(e, p) <= 0.01),
  );

  // ── 보고 ──
  console.log(
    `═══ ts-discover post-process (city=${cityId} ${city?.name_en}, ${zone}, ${date}) ═══`,
  );
  console.log(
    `입력 = broad (quota 미적용 / Gemini추출단계용 quota=${JSON.stringify(QUOTA)}) / 수동가격 적용 ${manualHit}곳`,
  );
  console.log(
    `raw ${raw.zones.length}명소 → 입력대상 ${kept.length}곳 ((B) 좌표없음 제외 ${drop.noCoord} / 비식당 제외 ${drop.nonfood} / 폐업 입력+플래그 ${drop.closed} / 거리초과도 입력 = 누수0)`,
  );
  if (nonfoodList.length)
    console.log(
      `  비식당(원 카테고리 유지=식당풀 제외): ${[...new Set(nonfoodList)].join(", ")}`,
    );
  console.log(`가격대(endPrice) = ${JSON.stringify(spread)}`);
  console.log(
    `\n[중복 先] UPDATE(기존) ${updP.length} / INSERT(신규) ${insP.length} (= 실제는 upsertPlace 5단계 = 더 매칭)`,
  );
  console.log(
    `[비용 先] PM 필요 ${pmNeed.length} × €${PM_CALL_EUR} = €${(pmNeed.length * PM_CALL_EUR).toFixed(2)} / PM 절감 ${pmSave}곳`,
  );
  console.log(
    `\n📝 unknown 가격필요 = ${needPrice.length}곳 (= manual-prices.ts 에 추가하면 tier 확정):`,
  );
  needPrice.forEach((p) =>
    console.log(
      `  - [${p.zone}] ${p.name} (리뷰 ${p.review_count}) ${p.address}`,
    ),
  );
  console.log(
    `\n🔴 삭제후보 = 기존 ${zone} ${zoneEx.length}곳 중 TS 미발견 ${orphans.length}곳 (= 삭제 X = RC순 밀려남 = 보고만):`,
  );
  orphans
    .slice(0, 15)
    .forEach((e: any) => console.log(`  - ${e.id} ${e.name_en}`));

  // === 사전 조사 (= 사용자 SSOT 2026-06-02 = 중복/통합/가격/입지 완비 확인) ===
  const pidGroup: Record<string, any[]> = {};
  for (const p of kept) (pidGroup[p.place_id] ||= []).push(p);
  const internalDups = Object.entries(pidGroup).filter(
    ([, a]) => (a as any[]).length > 1,
  );
  const noCoords = kept.filter((p) => !(p.lat && p.lng));
  const noPrice = kept.filter((p) => p.price_eur == null);
  console.log(`\n=== 사전 조사 ===`);
  console.log(
    `① 내부 중복 (같은 place_id가 2+ 명소에) = ${internalDups.length}건`,
  );
  internalDups.forEach(([, a]) =>
    console.log(
      `   ⚠️ "${(a as any[])[0].name}" = ${(a as any[]).map((x) => x.zone).join(" + ")}`,
    ),
  );
  console.log(
    `② 입지(좌표) 완비 = ${kept.length - noCoords.length}/${kept.length}${noCoords.length ? " ⚠️ 누락 " + noCoords.map((p) => p.name).join(",") : " ✓"}`,
  );
  console.log(
    `③ 가격 완비 = ${kept.length - noPrice.length}/${kept.length} (unknown ${noPrice.length}${noPrice.length ? " = " + noPrice.map((p) => p.name).join(", ") : ""})`,
  );
  console.log(
    `④ DB 중복 → UPDATE(통합) 예정 ${updP.length}곳 (= upsertPlace가 기존 행에 덮어쓰기, 신규 INSERT 아님):`,
  );
  updP.forEach((p) =>
    console.log(
      `   - TS "${p.name}"(€${p.price_eur ?? "?"}) → 기존 id=${p._match.id} "${p._match.name_en}" [${p._match.pid ? "PID매칭" : p._match.lat ? "좌표/이름매칭" : "?"}]`,
    ),
  );

  // 전체 선정 리스트 (= --list = 검수용 = 명소 × tier / 리뷰·€·U=기존UPDATE/I=신규INSERT)
  if (argv["list"] === "true") {
    console.log(
      `\n=== 선정 ${kept.length}곳 상세 (명소 × tier / 리뷰·€·U=UPDATE/I=INSERT) ===`,
    );
    const byZone: Record<string, any[]> = {};
    for (const p of kept) (byZone[p.zone] ||= []).push(p);
    for (const [z, arr] of Object.entries(byZone)) {
      console.log(`\n[${z}] ${(arr as any[]).length}곳`);
      for (const t of ["Economic", "Reasonable", "Premium", "unknown"]) {
        const ts = (arr as any[])
          .filter((p) => p.tier === t)
          .sort((a, b) => (b.review_count || 0) - (a.review_count || 0));
        if (ts.length)
          console.log(
            `  ${t}: ${ts.map((p) => `${p.name}(${p.review_count}/€${p.price_eur ?? "?"}/${p._match ? "U" : "I"})`).join(" · ")}`,
          );
      }
    }
  }

  if (!apply) {
    console.log(`\n=== DRY-RUN (쓰기 0) === 실행: --apply --photo`);
    await c.end();
    return;
  }

  // ── ⑦ APPLY ──
  // ⚠️ 2026-06-18 사장님 SSOT = 출입증 관문 issue_api_key() 경유. PM 이미지 = 채움 = 도시 있음 + 행 있음(true).
  // = 출입증(키이름·도시id·날짜·행있음) 검문 통과해야만 키 발급. 미달 = throw = 외부호출 불가.
  const { issueApiKey } = await import(
    pathToFileURL(path.join(ROOT, "server/services/shared/issue-api-key.ts"))
      .href
  );
  const PLACES_KEY = downloadPhoto
    ? await issueApiKey(c, "GOOGLE_MAPS_API_KEY", cityId, date, true)
    : null;
  await c.end();
  const { upsertPlace } = await import(
    pathToFileURL(path.join(ROOT, "server/services/place-upsert.ts")).href
  );
  // ⚠️ 2026-08-07 §16·§19/1-5b = 옛 자체 pmUpload(관문 우회 fetch + SP place-photos 업로드) 완전 삭제
  //   → 사진관문 tsPhoto 1벌(PM 다운 + R2 place-images/{cityId}/{cat}/{pid}.jpg = relink 색인과 동일 표준 키).
  const { tsPhoto } = await import(
    pathToFileURL(path.join(ROOT, "server/services/shared/ts-client.ts")).href
  );

  console.log(
    `\n=== APPLY (photo=${downloadPhoto}) = PM 필요분(${pmNeed.length})만 + upsertPlace priceOverwrite + tag '${TAG}' ===`,
  );
  let ins = 0,
    upd = 0,
    skip = 0,
    photoOk = 0;
  const conflicts: string[] = [];
  for (const p of kept) {
    let imageUrl: string | undefined;
    if (downloadPhoto && p._pmNeed && p.photo_name) {
      const u = await tsPhoto({
        apiKey: PLACES_KEY || "",
        photoName: p.photo_name,
        pathKey: `${cityId}/restaurant/${p.place_id}`,
        gated: true,
      });
      if (u) {
        imageUrl = u;
        photoOk++;
      }
    }
    try {
      const r = await upsertPlace({
        // ⚠️ 수정금지(승인필요) — TS displayName→name_en (2026-06-17 사장님 SSOT) = name_local은 Gemini전용 = TS는 nameLocal=null (place-upsert COALESCE가 기존 Gemini값 보존)
        cityId,
        seedCategory: "restaurant",
        nameEn: p.name,
        nameLocal: null,
        address: p.address || null,
        latitude: p.lat,
        longitude: p.lng,
        googlePlaceId: p.place_id,
        googleMapsUri: p.google_maps_uri || null,
        googleReviewCount: p.review_count ?? null,
        priceEur: p.price_eur ?? null, // 가격 = COALESCE 새 우선(최신최우선) 단일정책 = p.price_eur 있으면 덮고 없으면 기존 보존. priceOverwrite 인자 제거 = 2026-07-05 §14갱신
        imageUrl,
        dayZone:
          p.distFromCity != null && p.distFromCity <= 10 ? "core" : "outskirt",
        distanceKmFromCenter: p.distFromCity, // (B) 실제 거리로 zone (거리초과 입력분 = outskirt)
        categoryTags: ["restaurant"],
        phaseTags: [TAG, ...(p._closed ? ["closed"] : [])], // (B) 폐업 = 'closed' 태그(FE 제외용)
      });
      if (r.action === "inserted") ins++;
      else if (r.action === "updated") upd++;
      else skip++;
    } catch (e: any) {
      // ⚠️ 2026-06-02 = 글로벌 UNIQUE(city_id, name_norm) 충돌 = 크래시 대신 skip + 기록 (= 기존 동명 행 보존)
      conflicts.push(
        `${p.name} [${e.constraint || e.code || (e.message || "").slice(0, 50)}]`,
      );
    }
  }
  console.log(
    `✓ ins=${ins} / upd=${upd} / skip=${skip} / photo=${photoOk}/${pmNeed.length} (${kept.length}곳)`,
  );
  if (conflicts.length) {
    console.log(
      `⚠️ UNIQUE 충돌 skip ${conflicts.length}곳 (= 기존 동명 행 보존 = 검수 필요):`,
    );
    conflicts.forEach((x) => console.log(`   - ${x}`));
  }
  console.log(
    `🔴 삭제후보 ${orphans.length}곳 = '${TAG}' 없는 ${zone} = 사용자 승인 후 별도 정리`,
  );
})();
