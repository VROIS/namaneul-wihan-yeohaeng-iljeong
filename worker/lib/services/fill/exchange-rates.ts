// ⚠️ 수정금지(승인필요) 2026-09-30 사장님 결정 = 환율표(exchange_rates, base KRW) = 무료 API 1벌(open.er-api.com, 열쇠 없음, 160여 통화 = KES·CLP·COP·PEN 포함) 로 채운다 · 필시티 한 바퀴의 첫 단계 · 새로 만들지 않고 표 하나만 갱신 (정본 §)
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

export const RATE_API = "https://open.er-api.com/v6/latest/KRW";

type Client = { query: (q: string, v?: unknown[]) => Promise<any> };

/** 표를 최신으로 = 있으면 갱신, 없으면 추가. 돌려주는 값 = 갱신 통화 수. */
export async function syncExchangeRates(c: Client): Promise<number> {
  const res = await fetch(RATE_API, { signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`환율 API ${res.status}`);
  const j = (await res.json()) as {
    result: string;
    rates: Record<string, number>;
  };
  if (j.result !== "success" || !j.rates?.EUR)
    throw new Error("환율 API 응답 이상");
  const now = new Date();
  let n = 0;
  await c.query("BEGIN");
  try {
    for (const [cur, rate] of Object.entries(j.rates)) {
      if (!(rate > 0)) continue;
      const u = await c.query(
        "UPDATE exchange_rates SET rate=$2, fetched_at=$3 WHERE base_currency='KRW' AND target_currency=$1 RETURNING id",
        [cur, rate, now],
      );
      if (!u.rows.length)
        await c.query(
          "INSERT INTO exchange_rates (base_currency, target_currency, rate, fetched_at) VALUES ('KRW', $1, $2, $3)",
          [cur, rate, now],
        );
      n++;
    }
    await c.query("COMMIT");
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  }
  return n;
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) ===
    path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  (async () => {
    process.chdir(
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../.."),
    );
    for (const line of fs
      .readFileSync(".env", "utf-8")
      .replace(/^﻿/, "")
      .split(/\r?\n/)) {
      const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
      if (m && !process.env[m[1]])
        process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
    }
    const apply = process.argv.includes("--apply");
    const pg = await import("pg");
    const c = new (pg as any).default.Client({
      connectionString: process.env.SUPA_URL || process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });
    await c.connect();
    if (!apply) {
      const res = await fetch(RATE_API, { signal: AbortSignal.timeout(30000) });
      const j = (await res.json()) as any;
      const eur = j.rates?.EUR;
      console.log(
        `═══ 환율 DRY = API ${j.result} · 통화 ${Object.keys(j.rates || {}).length} · 1 KRW = €${eur} · 1 KES = €${(eur / j.rates?.KES).toFixed(5)} · 1 USD = €${(eur / j.rates?.USD).toFixed(4)} ═══`,
      );
    } else {
      const n = await syncExchangeRates(c);
      console.log(`═══ 환율표 갱신 = ${n} 통화 (base KRW) ═══`);
    }
    await c.end();
    process.exit(0);
  })().catch((e) => {
    console.error("✗ 환율 갱신 실패:", e?.message || e);
    process.exit(1);
  });
}
