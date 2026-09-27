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
  node scripts/worker-logs.mjs --path /api/auth    그 주소 요청만(클라우드플레어에서 먼저 거름)
  node scripts/worker-logs.mjs --from "09-25 14:30" --to "09-25 15:00"   그 기간(세계 표준시, --to 없으면 지금까지)
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

// ⚠️ 수정금지(승인필요) 2026-09-27 사장님 결정 = 로그 도구 보강 = 날짜 지정(--from·--to, 세계 표준시) + 주소 조건은 클라우드플레어에서 먼저 거른다(최근 500건에 묻히지 않게) (정본 §24)
const FROM = val("--from", "");
const TO = val("--to", "");
if (TO && !FROM) {
  console.error(
    '⛔ --to 는 --from 과 함께 쓴다(예: --from "09-25 10:00" --to "09-25 12:00", 세계 표준시)',
  );
  process.exit(1);
}
function utc(s) {
  const m = s.match(/^([0-9]{2})-([0-9]{2}) ([0-9]{2}):([0-9]{2})$/);
  if (!m) {
    console.error(`⛔ 시각 형식 = "MM-DD HH:MM"(세계 표준시): ${s}`);
    process.exit(1);
  }
  return Date.UTC(new Date().getUTCFullYear(), +m[1] - 1, +m[2], +m[3], +m[4]);
}

const now = Date.now();
const from = FROM ? utc(FROM) : now - MIN * 60 * 1000;
const to = TO ? utc(TO) : now;
const res = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/workers/observability/telemetry/query`,
  {
    method: "POST",
    headers: {
      Authorization: "Bearer " + token(),
      "content-type": "application/json",
    },
    body: JSON.stringify({
      queryId: "worker-logs",
      limit: 500,
      timeframe: { from, to },
      view: "events",
      parameters: {
        datasets: ["cloudflare-workers"],
        filters: [
          {
            key: "$workers.scriptName",
            operation: "eq",
            value: SCRIPT_NAME,
            type: "string",
          },
          ...(PATH_F
            ? [
                {
                  key: "$workers.event.request.url",
                  operation: "includes",
                  value: PATH_F,
                  type: "string",
                },
              ]
            : []),
        ],
      },
    }),
  },
);

const json = await res.json();
if (!json.success) {
  console.error(
    "⛔ 조회 실패:",
    JSON.stringify(json.errors || json).slice(0, 300),
  );
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
  const at = new Date(ms).toISOString().slice(5, 19).replace("T", " ");
  const text =
    msg ||
    (url
      ? `${url.replace(`https://${SCRIPT_NAME}`, "")}${status ? `  HTTP ${status}` : ""}`
      : "");
  if (!text) continue;
  if (FIND && !text.includes(FIND)) continue;
  if (ERRORS_ONLY && !(level === "error" || (status && status >= 400)))
    continue;
  rows.push({ ms, at, level, text });
}

rows.sort((a, b) => a.ms - b.ms);
console.log(
  `=== ${FROM ? `${FROM} ~ ${TO || "지금"}` : `최근 ${MIN}분`} = 전체 ${events.length}건 / 조건에 맞는 ${rows.length}건 (UTC 시각) ===\n`,
);
if (!rows.length) {
  console.log("  (없음)");
} else {
  for (const r of rows)
    console.log(
      `[${r.at}] ${r.level === "error" ? "🔴" : "  "} ${r.text.slice(0, 500)}`,
    );
}
