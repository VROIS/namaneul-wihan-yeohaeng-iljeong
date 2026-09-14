#!/usr/bin/env node
// ⚠️ 수정금지(승인필요) 2026-09-14 사장님 결정 = 배포 뒤 로그 확인은 이 1벌로 한다 (정본 §24)
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ACCOUNT_ID = "51bcbc629c76db55d6a9aac934b2195f";
const SCRIPT_NAME = "tripis-api";

const args = process.argv.slice(2);
const has = (f) => args.includes(f);
const val = (f, d) => {
  const i = args.indexOf(f);
  return i >= 0 && args[i + 1] ? args[i + 1] : d;
};

if (has("--help")) {
  console.log(`
배포된 워커의 로그를 본다 (저장된 것 = 지나간 것도 조회된다).

  node scripts/worker-logs.mjs                     최근 30분 전부
  node scripts/worker-logs.mjs --min 120           최근 2시간
  node scripts/worker-logs.mjs --find 로그인        그 글자가 든 줄만
  node scripts/worker-logs.mjs --path /api/auth    그 주소 요청만
  node scripts/worker-logs.mjs --errors            오류(4xx·5xx·console.error)만

열쇠 = .env 의 CLOUDFLARE_API_TOKEN (배포에 쓰는 것과 같은 것).
`);
  process.exit(0);
}

function token() {
  if (process.env.CLOUDFLARE_API_TOKEN) return process.env.CLOUDFLARE_API_TOKEN;
  const m = readFileSync(join(ROOT, ".env"), "utf8")
    .replace(/^﻿/, "")
    .match(/^CLOUDFLARE_API_TOKEN=(.+)$/m);
  if (!m) {
    console.error("⛔ CLOUDFLARE_API_TOKEN 이 없습니다(.env 또는 환경변수).");
    process.exit(1);
  }
  return m[1].trim().replace(/^["']|["']$/g, "");
}

const MIN = Number(val("--min", 30));
const FIND = val("--find", "");
const PATH_F = val("--path", "").replace(/^.*?\/Git(?=\/)/, "");
const ERRORS_ONLY = has("--errors");

const now = Date.now();
const res = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/workers/observability/telemetry/query`,
  {
    method: "POST",
    headers: { Authorization: "Bearer " + token(), "content-type": "application/json" },
    body: JSON.stringify({
      queryId: "worker-logs",
      limit: 500,
      timeframe: { from: now - MIN * 60 * 1000, to: now },
      view: "events",
      parameters: {
        datasets: ["cloudflare-workers"],
        filters: [
          { key: "$workers.scriptName", operation: "eq", value: SCRIPT_NAME, type: "string" },
        ],
      },
    }),
  },
);

const json = await res.json();
if (!json.success) {
  console.error("⛔ 조회 실패:", JSON.stringify(json.errors || json).slice(0, 300));
  process.exit(1);
}

const events = json.result?.events?.events || [];
const rows = [];
for (const e of events) {
  const msg = String(e.source?.message ?? "");
  const url = e.source?.$workers?.event?.request?.url || "";
  const status = e.source?.$workers?.event?.response?.status;
  const level = e.source?.level || "";
  const ms = Number(e.timestamp || 0);
  const at = new Date(ms).toISOString().slice(11, 19);
  const text = msg || (url ? `${url.replace(`https://${SCRIPT_NAME}`, "")}${status ? `  HTTP ${status}` : ""}` : "");
  if (!text) continue;
  if (FIND && !text.includes(FIND)) continue;
  if (PATH_F && !url.includes(PATH_F) && !text.includes(PATH_F)) continue;
  if (ERRORS_ONLY && !(level === "error" || (status && status >= 400))) continue;
  rows.push({ ms, at, level, text });
}

rows.sort((a, b) => a.ms - b.ms);
console.log(`=== 최근 ${MIN}분 = 전체 ${events.length}건 / 조건에 맞는 ${rows.length}건 (UTC 시각) ===\n`);
if (!rows.length) {
  console.log("  (없음)");
} else {
  for (const r of rows) console.log(`[${r.at}] ${r.level === "error" ? "🔴" : "  "} ${r.text.slice(0, 500)}`);
}
