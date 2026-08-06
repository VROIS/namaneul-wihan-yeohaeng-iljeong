// ⚠️ 영구 컴포넌트 2026-08-06 = DB 에 적힌 Supabase Storage 주소 → R2 주소 치환(결정적·역치환 가능) = Cloudflare 이전계획 1단계 정본 도구
// = 원리: 치환 규칙 딱 1개 = `{SUPA}/storage/v1/object/public/` → `{R2_PUBLIC_URL}/` (버킷명이 그대로 R2 프리픽스라 경로 불변).
//   역치환(--rollback) = 반대로 REPLACE = 즉시 원상복구. 재실행 = LIKE 필터라 자체 종결(멱등).
// = 대상 컬럼 = 추측 0: information_schema 로 public 스키마의 text/varchar/jsonb 전 컬럼을 실측 스캔해
//   Supabase 주소가 실제로 든 (테이블,컬럼)만 자동 발견 → dry-run 표 출력 = 사장님 승인 게이트(€1000 자산 = 승인 후 --apply).
// = place_seed_raw 직접 UPDATE 는 image_url 문자열만 = "우리 id 직행 UPDATE" 승인 패턴(repair.ts 2026-06-16 사장님 SSOT)과 동형 = 매칭·중복 무관.
//   updated_at 은 건드리지 않음(내용 불변 = 주소만 이사 = 최신성 의미 오염 방지).
// = 기본 DRY(쓰기 0). --apply = 치환 실행 / --rollback = 역치환. 복사(storage-r2-migrate) 완료 후에만 apply 할 것.
// CLI: npx tsx server/services/fill/storage-r2-relink.ts [--apply|--rollback]
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");

// ── 재사용 함수 (client = 열린 pg Client) ──
export async function relinkStorageUrlsToR2(opts: {
  apply: boolean;
  rollback?: boolean;
  client: any;
}): Promise<
  {
    table: string;
    column: string;
    type: string;
    hit: number;
    updated: number;
    sample?: string;
  }[]
> {
  const { apply, rollback = false, client: c } = opts;
  const supaPublicUrl = (
    process.env.SUPABASE_PUBLIC_URL ||
    "https://wxebceflvuythuodemro.supabase.co"
  ).replace(/\/$/, "");
  const r2PublicUrl = (process.env.R2_PUBLIC_URL || "").replace(/\/$/, "");
  if (!r2PublicUrl) throw new Error("[r2-relink] R2_PUBLIC_URL 미설정");
  const OLD = `${supaPublicUrl}/storage/v1/object/public/`;
  const NEW = `${r2PublicUrl}/`;
  const [from, to] = rollback ? [NEW, OLD] : [OLD, NEW];

  // ① 대상 후보 = public 스키마 text/varchar/jsonb 전 컬럼 (실측 = 추측 0)
  const cols = (
    await c.query(
      `SELECT table_name, column_name, data_type
       FROM information_schema.columns
       WHERE table_schema = 'public' AND data_type IN ('text','character varying','jsonb')
       ORDER BY table_name, column_name`,
    )
  ).rows as { table_name: string; column_name: string; data_type: string }[];

  const results: {
    table: string;
    column: string;
    type: string;
    hit: number;
    updated: number;
    sample?: string;
  }[] = [];

  for (const col of cols) {
    const t = `"${col.table_name}"`;
    const q = `"${col.column_name}"`;
    const isJson = col.data_type === "jsonb";
    const expr = isJson ? `${q}::text` : q;
    // ② 실측 = 치환 원본(from)이 실제로 든 행 수 (없으면 대상 아님)
    const hit = Number(
      (
        await c.query(`SELECT COUNT(*) AS n FROM ${t} WHERE ${expr} LIKE $1`, [
          `%${from}%`,
        ])
      ).rows[0].n,
    );
    if (!hit) continue;
    const sample = (
      await c.query(
        `SELECT ${expr} AS v FROM ${t} WHERE ${expr} LIKE $1 LIMIT 1`,
        [`%${from}%`],
      )
    ).rows[0].v as string;
    let updated = 0;
    if (apply) {
      // ③ 치환 = 결정적 REPLACE 1개 (jsonb 는 text 왕복). LIKE 필터 = 멱등.
      const setExpr = isJson
        ? `${q} = REPLACE(${q}::text, $1, $2)::jsonb`
        : `${q} = REPLACE(${q}, $1, $2)`;
      // ⚠️ 2026-08-06 = place_seed_raw 만 prevent_dup 외과적 면제(2026-07-18 사장님 SSOT 직행 패턴 동형 = place-upsert.ts:196-202).
      //   근거: 주소 문자열만 교체 = 식별컬럼(PID·URI·주소·좌표·이름) 무변경 = 우리 id 직행인데, 레거시 기존 중복쌍 행 갱신 시
      //   트리거가 "다른 행과 일치"로 차단(2026-08-06 실측 = 불변1 RAISE). set_config(..., true) = 트랜잭션 한정 = 자동 복원.
      await c.query("BEGIN");
      try {
        if (col.table_name === "place_seed_raw")
          await c.query(`SELECT set_config('app.skip_dup_check', 'on', true)`);
        const u = await c.query(
          `UPDATE ${t} SET ${setExpr} WHERE ${expr} LIKE $3`,
          [from, to, `%${from}%`],
        );
        await c.query("COMMIT");
        updated = u.rowCount || 0;
      } catch (e) {
        await c.query("ROLLBACK");
        throw e;
      }
    }
    results.push({
      table: col.table_name,
      column: col.column_name,
      type: col.data_type,
      hit,
      updated,
      sample: sample?.slice(0, 160),
    });
  }

  // ④ 보고 표 (dry-run = 사장님 승인용 / apply = 결과 확인용)
  const mode = apply ? (rollback ? "ROLLBACK 실행" : "APPLY 실행") : "DRY-RUN";
  console.log(
    `\n═══ storage-r2-relink [${mode}] 치환규칙: ${from} → ${to} ═══`,
  );
  if (!results.length) console.log("(대상 0 = 치환할 주소 없음)");
  for (const r of results)
    console.log(
      `  ${r.table}.${r.column} (${r.type}) = ${r.hit}행${apply ? ` → ${r.updated}행 치환` : ""}\n    예시: ${r.sample}`,
    );
  if (!apply)
    console.log(
      `\n=== DRY (사장님 승인 후 --apply. 되돌리기 = --rollback --apply) ===`,
    );
  return results;
}

// ── CLI = 직접 실행 시만(import 시 미발화, image-backfill 동일 패턴) ──
if (
  (process.argv[1] || "")
    .replace(/\\/g, "/")
    .endsWith("fill/storage-r2-relink.ts")
) {
  (async () => {
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
    // @ts-ignore = pg 타입선언 없음(런타임 전용, image-backfill CLI 동일 패턴)
    const pg = await import("pg");
    const c = new (pg as any).default.Client({
      connectionString: process.env.SUPA_URL || process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });
    await c.connect();
    try {
      await relinkStorageUrlsToR2({
        apply: argv["apply"] === "true",
        rollback: argv["rollback"] === "true",
        client: c,
      });
    } finally {
      await c.end();
    }
  })();
}
