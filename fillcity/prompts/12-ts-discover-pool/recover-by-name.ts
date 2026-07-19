// ⚠️ 수정금지(승인필요) 2026-06-02 = 발굴이 놓친 진짜 명소를 이름으로 직접 TS 보강 → upsertPlace
// = manual-additions.ts 의 이름 → TS searchText(이름, ko, regionCode) → top1 → upsertPlace(priceOverwrite + tag 'ts-pool-{date}')
// = 가격 = endPrice 상한 / CLOSED_PERMANENTLY = skip / dayZone='outskirt' (= 명소 외곽)
// 호출:
//   npx tsx .../12-ts-discover-pool/recover-by-name.ts --city-id=19 [--apply]
//   (--apply 없으면 = dry-run = TS 결과만, 쓰기 0)
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { MANUAL_ADD } from "./manual-additions";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../../../..");
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
// ⚠️ 수정금지(승인필요) 2026-06-03 = 카테고리/언어/이름 오버라이드 = 비식당 명소 이름복구 (예 --category=hotspot --names="A,B" --lang=fr)
const category = argv["category"] ? String(argv["category"]) : "restaurant";
// ⚠️ 수정금지(승인필요) — languageCode 제거(2026-06-17 사장님 SSOT) = displayName 한국어 강제 안 함. --lang 명시 시에만 그 값 사용, 미지정이면 null = body 에서 languageCode 키 생략.
const lang = argv["lang"] ? String(argv["lang"]) : null;
const namesArg = argv["names"]
  ? String(argv["names"])
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  : null;
const today = new Date().toISOString().slice(0, 10);
if (!cityId) {
  console.error("Usage: --city-id=<N> [--apply]");
  process.exit(1);
}

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

(async () => {
  const { STANDARD_TS_FIELD_MASK, validateFieldMask } = await import(
    pathToFileURL(
      path.join(ROOT, "server/services/shared/google-places-sku.ts"),
    ).href
  );
  const MASK = STANDARD_TS_FIELD_MASK + ",places.businessStatus";
  validateFieldMask(MASK);

  const names = namesArg || MANUAL_ADD[cityId] || [];
  if (!names.length) {
    console.error(`city ${cityId} MANUAL_ADD 없음`);
    process.exit(1);
  }

  const pg = await import("pg");
  const c = new (pg as any).default.Client({
    connectionString: process.env.SUPA_URL || process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const city = (
    await c.query(
      "SELECT name_en, country_code, latitude, longitude FROM cities WHERE id=$1",
      [cityId],
    )
  ).rows[0];
  const cityCenter = {
    lat: parseFloat(city?.latitude) || 0,
    lng: parseFloat(city?.longitude) || 0,
  };
  // ⚠️ 2026-06-18 사장님 SSOT = 출입증 관문 issue_api_key() 경유 (= 직독 폐기). 발굴(이름복구) = 도시 있음 + 행 없음(false = 신규 발견).
  // = 출입증(키이름·도시id·날짜·행없음) 검문 통과해야만 키 발급. 미달 = throw = 외부호출 불가.
  const { issueApiKey } = await import(
    pathToFileURL(path.join(ROOT, "server/services/shared/issue-api-key.ts"))
      .href
  );
  const KEY = await issueApiKey(c, "GOOGLE_MAPS_API_KEY", cityId, today, false);
  if (!KEY) {
    console.error("Google key 미존재");
    process.exit(1);
  }

  console.log(
    `═══ recover-by-name (city=${cityId} ${city?.name_en}, ${names.length}곳) = €${(names.length * 0.0299).toFixed(2)} ═══`,
  );
  const jobs: any[] = [];
  for (const name of names) {
    const r = await fetch(
      "https://places.googleapis.com/v1/places:searchText",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": KEY,
          "X-Goog-FieldMask": MASK,
        },
        // ⚠️ 수정금지(승인필요) — languageCode 제거(2026-06-17 사장님 SSOT) = lang(=--lang) 있을 때만 키 삽입, 없으면 생략(한국어 강제 안 함)
        body: JSON.stringify({
          textQuery: name,
          ...(category === "restaurant" ? { includedType: "restaurant" } : {}),
          ...(lang ? { languageCode: lang } : {}),
          regionCode: city?.country_code || "FR",
          pageSize: 1,
        }),
        signal: AbortSignal.timeout(30000),
      },
    );
    const j = (await r.json()) as any;
    const p = (j.places || [])[0];
    if (!p) {
      console.log(`  ✗ "${name}" = 결과 없음`);
      continue;
    }
    if (p.businessStatus && p.businessStatus !== "OPERATIONAL") {
      console.log(`  🚫 "${name}" = ${p.businessStatus} = skip`);
      continue;
    }
    const price = p.priceRange?.endPrice?.units
      ? parseFloat(p.priceRange.endPrice.units)
      : null;
    const dist = p.location
      ? Math.round(
          hkm(cityCenter, {
            lat: p.location.latitude,
            lng: p.location.longitude,
          }) * 10,
        ) / 10
      : null;
    console.log(
      `  ✓ "${name}" → ${p.displayName?.text} | 리뷰 ${p.userRatingCount} | €${price ?? "?"} | ${dist}km | ${p.businessStatus}`,
    );
    jobs.push({
      cityId,
      seedCategory: category,
      // ⚠️ 수정금지(승인필요) — TS displayName→name_en (2026-06-17 사장님 SSOT) = name_local은 Gemini전용 = displayName(영어)은 name_en만, name_local=null
      nameEn: p.displayName?.text,
      nameLocal: null,
      address: p.formattedAddress,
      latitude: p.location?.latitude,
      longitude: p.location?.longitude,
      googlePlaceId: p.id,
      googleMapsUri: p.googleMapsUri || null,
      googleReviewCount: p.userRatingCount ?? null,
      priceEur: price,
      dayZone: dist != null && dist <= 10 ? "core" : "outskirt",
      distanceKmFromCenter: dist,
      categoryTags: [category],
      phaseTags: [`ts-${category}-recover-${today}`],
    });
  }
  await c.end();

  if (!apply) {
    console.log(`\n=== DRY-RUN (쓰기 0) === 실행: --apply`);
    return;
  }

  const { upsertPlace } = await import(
    pathToFileURL(path.join(ROOT, "server/services/place-upsert.ts")).href
  );
  let ins = 0,
    upd = 0,
    skip = 0;
  for (const job of jobs) {
    const rr = await upsertPlace(job);
    if (rr.action === "inserted") ins++;
    else if (rr.action === "updated") upd++;
    else skip++;
    console.log(
      `  → ${job.nameEn} = ${rr.action} (id=${rr.rowId}, ${rr.matchedBy})`,
    );
  }
  console.log(`\n✓ ins=${ins} / upd=${upd} / skip=${skip}`);
})();
