// ⚠️ 수정금지(승인필요) 2026-09-05 사장님 확정 = PID 행을 구글맵 공개 페이지(place_id, hl=en)로 여는 재확인·최신화 1벌(유료 API 0) = 영어명·풀주소·좌표·리뷰수·영업상태·사진 6요소 + 우리 PID 가 같은 장소인지 오염 재확인. 옛 FILL 모드 삭제 §19.
// = 관문(sanity gate) = h1 빈값·동의창 = 못 읽음(값 안 씀) / 이름 = 토큰화 대조(공통 토큰 0 = 불일치, 한글 name_en 은 대조 불가로 좌표만) / 좌표 = 강일치 + 2km 초과면 페이지 좌표로 교정, 약일치면 안 씀 / 리뷰수 = 언어별 단어 패턴만, 별점·급락은 거부.
// = 관문이 막아도 PID 가 진실이라 값은 쓴다(정본 2026-09-04). 단 페이지를 못 읽은 행은 페이지에서 온 값(주소·좌표·리뷰수·영업상태·검증시각)을 안 쓰고 의심 표시도 안 뗀다.
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { chromium } from "playwright";
import { BROWSER_UA } from "./gmaps-pid-identity/page-reader";
import {
  evaluateRow,
  initResult,
  nameTokens,
  type Result,
  type Row,
} from "./gmaps-pid-identity/gates";
import {
  clearSuspectTags,
  pageWasRead,
  writeRow,
} from "./gmaps-pid-identity/apply";
import { printAndSaveReport } from "./gmaps-pid-identity/report";

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
const apply = argv["apply"] === "true";
// ⚠️ 수정금지(승인필요) 2026-09-05 사장님 확정 = 이 도구는 전 PID 행(bts_* 제외) 재확인·최신화 1벌. 옛 FILL 모드(현지어명·한국어명 채움)는 그 두 칸이 제미니 영역으로 확정되면서 할 일이 없어져 삭제 §19.
const limit = argv["limit"] ? Number(argv["limit"]) : 0;
const ids = argv["ids"]
  ? String(argv["ids"])
      .split(",")
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n) && n > 0)
  : [];
if (!cityId) {
  console.error(
    "Usage: --city-id=<N> [--apply] [--limit=K] [--ids=1,2,3] [--lang=en(기본)]",
  );
  process.exit(1);
}

(async () => {
  const { upsertPlace } = await import(
    pathToFileURL(path.join(ROOT, "server/services/place-upsert.ts")).href
  );
  const { distanceKmFromCoords } = await import(
    pathToFileURL(path.join(ROOT, "server/services/shared/pool-radius.ts")).href
  );
  // ⚠️ 수정금지(승인필요) 2026-09-04 = 사진 폭 상수는 ts-client 1벌을 쓴다(§16 재발명 금지).
  const { PHOTO_MAX_WIDTH_PX } = await import(
    pathToFileURL(path.join(ROOT, "server/services/shared/ts-client.ts")).href
  );
  const pg = await import("pg");
  const c = new (pg as any).default.Client({
    connectionString: process.env.SUPA_URL || process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const city = (
    await c.query(
      "SELECT name_en, latitude::float8 AS lat, longitude::float8 AS lng FROM cities WHERE id=$1",
      [cityId],
    )
  ).rows[0];
  if (!city) {
    await c.end();
    console.error(`✗ city ${cityId} 미존재`);
    process.exit(1);
  }
  // ⚠️ 수정금지(승인필요) 2026-08-28 사장님 지시 = 도시 중심 1회 로드 = 페이지 좌표 150km 유효 관문 기준.
  const cityLat: number | null = city.lat != null ? Number(city.lat) : null;
  const cityLng: number | null = city.lng != null ? Number(city.lng) : null;
  // ⚠️ 수정금지(승인필요) 2026-09-05 사장님 확정 = 기본 hl=en. 도시 언어로 열면 h1 이 현지어라 name_en 칸에 비영어가 들어간다(WF 호출부만 막으면 도구 직접 호출에서 재발).
  const lang = String(argv["lang"] || "en");
  const cityStop = nameTokens(city.name_en, new Set());

  // ⚠️ 수정금지(승인필요) 2026-09-05 사장님 확정 = 대상 = PID 있는 전 행(bts_* 제외) = 오염 재확인·최신화 1벌.
  const params: any[] = [cityId];
  let where = `city_id=$1 AND google_place_id IS NOT NULL AND google_place_id <> ''
       AND seed_category NOT LIKE 'bts_%'`;
  if (ids.length) {
    params.push(ids);
    where += ` AND id = ANY($${params.length}::int[])`;
  }
  let rows: Row[] = (
    await c.query(
      `SELECT id, seed_category, name_en, google_place_id AS pid,
              latitude::float8 AS lat, longitude::float8 AS lng,
              google_review_count AS rc,
              (image_url IS NOT NULL) AS has_image
         FROM place_seed_raw WHERE ${where} ORDER BY id`,
      params,
    )
  ).rows;
  if (limit > 0) rows = rows.slice(0, limit);
  console.log(
    `═══ gmaps-pid-identity (city ${cityId} ${city.name_en}, hl=${lang}) = 전 PID 행 재확인·최신화 · 대상 ${rows.length}행 · ${apply ? "APPLY" : "DRY"} · 유료 API 0 ═══`,
  );

  const results: Result[] = [];
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    userAgent: BROWSER_UA,
  });
  const page = await ctx.newPage();
  const t0 = Date.now();
  try {
    for (const row of rows) {
      const r = initResult(row);
      try {
        await evaluateRow(
          {
            page,
            lang,
            // ⚠️ 수정금지(승인필요) 2026-09-04 사장님 결정 = 사진 폭 = backfill-verify 와 같은 1벌(§16).
            photoWidth: PHOTO_MAX_WIDTH_PX,
            cityLat,
            cityLng,
            cityStop,
            distanceKmFromCoords,
          },
          row,
          r,
        );
      } catch (e: any) {
        r.gate = `error:${String(e?.message || e).slice(0, 80)}`;
      }

      // ⚠️ 수정금지(승인필요) 2026-09-04 사장님 확정 = 관문이 막아도 PID 가 진실 = 전 행을 PID 값으로 갈아끼운다(관문은 참고 표시). 단 **페이지를 못 읽은 행**(타임아웃·동의차단·h1없음)은 의심 표시를 떼지 않는다 = 떼면 쌍둥이 묶기에서 영영 빠진다.
      if (apply) {
        await writeRow(upsertPlace, cityId, row, r);
        if (pageWasRead(r) && !String(r.upsert || "").startsWith("error"))
          await clearSuspectTags(c, row.id);
      }
      results.push(r);
      console.log(JSON.stringify(r));
    }
  } finally {
    await browser.close().catch(() => {});
  }
  const elapsed = (Date.now() - t0) / 1000;

  printAndSaveReport({
    results,
    elapsed,
    apply,
    cityId,
    lang,
    ROOT,
  });
  await c.end();
  process.exit(0);
})().catch((e) => {
  console.error("✗ 실행 실패:", e?.message || e);
  process.exit(1);
});
