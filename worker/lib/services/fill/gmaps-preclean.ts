// ⚠️ 수정금지(승인필요) 2026-09-29 사장님 결정 = 시드발굴 v3 ① 맨 앞 사전 정제 = LLM 검토가 장소 아님으로 본 행(--drop-ids) 삭제 → PID/CID 행 페이지 직행 → 이름만 있거나 빈 등록(리뷰·사진 없음)·빈 페이지(구글 등록 사라짐)인 행은 도시 이름 없이 검색(좌표 없는 행은 지도 화면만 그 도시 중심 = 세계 체인점이 다른 대륙 지점으로 가지 않게 · 사진은 장소가 붙을 도시 폴더) → 끝내 7요소 못 갖춘 행·행 좌표(없으면 도시 중심)에서 500km 밖만 나오는 행 삭제(이미 확보한 자료는 살린다 = 100km 제한 없음 · 500km 밖 = 딴 대륙 같은 이름 가게)(검색은 행 이름으로 이름 관문 · 분류 불일치는 지우지 않고 멀티태그 · 제미니가 뽑은 게 아니니 베스트 안 찍음 · 일시 오류·쓰기 오류는 남겨 다음 판에). 구글맵 엔진 함수 그대로 = 유료 0 (정본 §)
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { chromium } from "playwright";
import { deletePlaceRow, upsertPlace } from "../place-upsert";
import {
  cityForCoords,
  distanceKmFromCoords,
  MOVE_MAX_KM,
} from "../shared/geo-distance";
import { PHOTO_MAX_WIDTH_PX } from "../shared/ts-client";
import { isWritable } from "./gmaps-pid-identity/gates";
import { BROWSER_UA, launchBrowser } from "./gmaps-pid-identity/page-reader";
import {
  LIMITED_STOP,
  limitedCount,
  PID_ROWS_SELECT,
  verifyPidRows,
} from "./gmaps-pid-identity/run";
import { lastGoogleLogs } from "../../../../fillcity/steps/common";
import { entryOfRow, r2PrefixOf, ROW_COLS } from "./gmaps-post";
import {
  LIMITED_WHY,
  loadPriceCtx,
  newStat,
  pageTools,
  readAll,
  writeRead,
} from "./gmaps-shared";
// ⚠️ 수정금지(승인필요) 2026-09-30 사장님 결정 = 종료 코드 3 = 구글맵 제한 보기(채널 막힘) = 워크플로가 이 도시를 멈추고 다음 채널로 (정본 §)
export const EXIT_LIMITED = 3;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.chdir(path.resolve(__dirname, "../../../.."));
for (const line of fs
  .readFileSync(".env", "utf-8")
  .replace(/^﻿/, "")
  .split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]])
    process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const argv = Object.fromEntries(
  process.argv
    .slice(2)
    .map((a) => a.replace(/^--/, "").split("="))
    .map(([k, v]) => [k, v ?? "true"]),
);
const cityId = Number(argv["city-id"] || 0);
const apply = argv["apply"] === "true";
const parallel = Math.max(1, Number(argv["parallel"] || 5)); // 제한 보기가 잦으면 --parallel=1 로 천천히
const dropIds = String(argv["drop-ids"] || "")
  .split(",")
  .map(Number)
  .filter(Boolean);

// ⚠️ 수정금지(승인필요) 2026-10-01 사장님 결정 = 다시 열 행 = 그 도시 전체(bts·병합 제외) = 구글맵 9요소와 원본 JSON 을 전 행에 새로 남긴다 · --since=시각 을 주면 그 시각 뒤에 이미 읽은 행은 건너뛰어 멈춘 자리부터 이어 읽고 · --missing-log=true 면 읽기 로그가 없는 행(발굴로 새로 들어온 행)만 읽는다 (정본 §)
const since = argv["since"] ? String(argv["since"]) : null;
const missingLogOnly = argv["missing-log"] === "true";
const TARGET_WHERE = `city_id = $1 AND seed_category NOT LIKE 'bts_%' AND status <> 'merged' AND ($2::timestamptz IS NULL OR verified_at IS NULL OR verified_at < $2::timestamptz)`;
const passing = (why: string) =>
  why.startsWith("오류:") || why === "동의창" || why === LIMITED_WHY;

(async () => {
  if (!cityId) {
    console.error("Usage: --city-id=<N> [--apply] [--drop-ids=1,2,3]");
    process.exit(1);
  }
  const r2Prefix = r2PrefixOf(process.env.R2_PUBLIC_URL);
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
  const cities = (
    await c.query(
      "SELECT id, latitude::float8 AS lat, longitude::float8 AS lng FROM cities WHERE latitude IS NOT NULL AND longitude IS NOT NULL",
    )
  ).rows;
  const drops = (
    await c.query(
      "SELECT id, name_en FROM place_seed_raw WHERE city_id = $1 AND id = ANY($2::int[]) AND seed_category NOT LIKE 'bts_%'",
      [cityId, dropIds],
    )
  ).rows;
  const logged = missingLogOnly ? lastGoogleLogs(cityId) : null;
  const rows = (
    await c.query(
      `SELECT ${ROW_COLS} FROM place_seed_raw WHERE ${TARGET_WHERE} ORDER BY id`,
      [cityId, since],
    )
  ).rows.filter(
    (r: any) => !dropIds.includes(r.id) && !(logged && logged.has(r.id)),
  );
  const direct = rows.filter((r: any) => r.direct);
  const search = rows.filter((r: any) => !r.direct);
  console.log(
    `═══ 사전 정제 city ${cityId} ${city.name_en} = LLM 삭제 ${drops.length} · 다시 열 행 ${rows.length}(직행 ${direct.length} · 검색 ${search.length}) · ${apply ? "APPLY" : "DRY"} · 유료 0 ═══`,
  );
  for (const d of drops) console.log(`  [LLM 삭제] #${d.id} ${d.name_en}`);
  for (const r of rows)
    console.log(`  [${r.direct ? "직행" : "검색"}] #${r.id} ${r.name_en}`);
  if (!apply) {
    await c.end();
    process.exit(0);
  }

  let removed = 0,
    later = 0;
  const drop = async (id: number, name: string, why: string) => {
    await deletePlaceRow(id);
    removed++;
    console.log(`  🗑 #${id} ${name} 삭제(${why})`);
  };
  for (const d of drops) await drop(d.id, d.name_en, "LLM 검토 = 장소 아님");
  const stat = newStat();
  const priceCtx = await loadPriceCtx(c, cityId, argv["fx"]);
  const stopLimited = async (where: string) => {
    console.error(
      `⛔ 구글맵 제한 보기(${where}) = 채널 막힘 = 이 도시 멈춤(지운 것 없음, 남은 행은 다음 판에)`,
    );
    await browser.close().catch(() => {});
    await c.end();
    process.exit(EXIT_LIMITED);
  };
  const browser = await launchBrowser(chromium);
  try {
    if (direct.length) {
      const results = await verifyPidRows({
        browser,
        rows: (
          await c.query(
            `${PID_ROWS_SELECT} WHERE city_id=$1 AND id = ANY($3::int[]) ORDER BY id`,
            [cityId, r2Prefix, direct.map((r: any) => r.id)],
          )
        ).rows,
        city,
        lang: "en",
        photoWidth: PHOTO_MAX_WIDTH_PX,
        distanceKmFromCoords,
        upsertPlace,
        client: c,
        cityId,
        apply: true,
        parallel,
        writeCtx: { ...priceCtx, deleteRow: (id) => deletePlaceRow(id) },
        onResult: (r) =>
          console.log(
            `  ${r.gate} #${r.id} ${r.name_en} rc=${r.rc_page ?? "-"} ${r.photo_url ? "사진" : "사진없음"} ${r.upsert || ""}`,
          ),
      });
      if (limitedCount(results) >= LIMITED_STOP) await stopLimited("직행");
      removed += results.filter((r) =>
        String(r.upsert || "").startsWith("deleted"),
      ).length;
      const hollow = new Set(
        results
          .filter(
            (r) =>
              r.gate === "h1-empty" ||
              (isWritable(r.gate) && r.rc_page == null && !r.photo_url),
          )
          .map((r) => r.id),
      );
      search.push(...direct.filter((r: any) => hollow.has(r.id)));
    }
    if (search.length) {
      const reads = await readAll(
        browser,
        BROWSER_UA,
        search.map((r: any) => ({
          ...entryOfRow(
            r.lat == null ? { ...r, lat: city.lat, lng: city.lng } : r,
          ),
          copies: [],
          langs: 0,
          aliases: [r.name_en, r.name_local].filter(Boolean),
          noXY: r.lat == null,
        })),
        {
          ...pageTools(),
          cityId,
          cityNameEn: null,
          cityOf: (lat, lng) => cityForCoords(cities, lat, lng, cityId),
          preclean: true,
          rawRows: [],
          priceCtx,
          parallel,
        },
        stat,
      );
      if (stat.blocked) await stopLimited("검색");
      for (const rd of reads) {
        const id = (rd.n as any).__rowId;
        const far =
          !rd.why &&
          distanceKmFromCoords(rd.n.lat!, rd.n.lng!, rd.d.urlLat, rd.d.urlLng) >
            MOVE_MAX_KM;
        if (far) await drop(id, rd.n.name, `좌표 먼 곳만 나옴(${rd.d.h1})`);
        else if (!rd.why)
          await writeRead(
            c,
            upsertPlace,
            rd,
            {
              cityId,
              provenanceTag: "gmaps-preclean",
              targetRowId: id,
              priceCtx,
            },
            stat,
          ).catch((e: any) => {
            later++;
            console.log(
              `  ⏸ #${id} ${rd.n.name} 쓰기 오류 = 다음 판에: ${e?.message || e}`,
            );
          });
        else if (passing(rd.why)) {
          later++;
          console.log(`  ⏸ #${id} ${rd.n.name} ${rd.why} = 다음 판에`);
        } else await drop(id, rd.n.name, rd.why);
      }
    }
  } finally {
    await browser.close().catch(() => {});
  }
  console.log(
    `═══ 사전 정제 끝 = 직행 ${direct.length} · 검색 ${search.length}(살림 ${stat.insertedNew + stat.absorbedHint + stat.absorbedOther}) · 삭제 ${removed} · 다음 판 ${later} ═══`,
  );
  await c.end();
  process.exit(0);
})().catch((e) => {
  console.error("✗ 사전 정제 실패:", e?.message || e);
  process.exit(1);
});
