// ⚠️ 수정금지(승인필요) 2026-09-13 사장님 결정 = 후처리 엔진(gmaps-post 1벌)을 이 PC 에서 돌리는 CLI = 큐 소비자(worker/gmaps-post-queue.ts)와 같은 함수를 부른다. 브라우저 = playwright, DB = pg (정본 §)
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { chromium } from "playwright";
import { upsertPlace } from "../place-upsert";
import { pendingByCity, r2PrefixOf, runGmapsPost } from "./gmaps-post";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../../..");
process.chdir(ROOT);
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
const onlyCity = Number(argv["city-id"] || 0);
const apply = argv["apply"] === "true";
const limit = Number(argv["limit"] || 0);

(async () => {
  const r2Prefix = r2PrefixOf(process.env.R2_PUBLIC_URL);
  const pg = await import("pg");
  const c = new (pg as any).default.Client({
    connectionString: process.env.SUPA_URL || process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const cities = await pendingByCity(c, r2Prefix, onlyCity);
  console.log(
    `═══ 구글맵 후처리 대기 = ${cities.reduce((a, x) => a + x.n, 0)}행 / ${cities.length}도시 (${apply ? "APPLY" : "DRY"}) ═══`,
  );
  for (const ct of cities)
    console.log(
      `   city ${ct.city_id}: ${ct.n}행 (PID/CID 직행 ${ct.direct} · 검색 ${ct.n - ct.direct})`,
    );
  if (apply && cities.length) {
    const browser = await chromium.launch({ headless: true });
    try {
      for (const ct of cities)
        await runGmapsPost({
          client: c,
          browser,
          cityId: ct.city_id,
          r2Prefix,
          upsertPlace,
          limit: limit || undefined,
        });
    } finally {
      await browser.close().catch(() => {});
    }
  }
  await c.end();
})().catch((e) => {
  console.error("ERR", e?.message || e);
  process.exit(1);
});
