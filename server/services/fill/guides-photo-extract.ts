import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { uploadDataUriToR2, isR2Configured } from "../shared/r2-client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");

export async function extractGuidesPhotosToR2(opts: {
  apply: boolean;
  client: any;
  limit?: number;
}): Promise<{
  total: number;
  totalBytes: number;
  done: number;
  failed: number;
}> {
  const { apply, client: c } = opts;
  if (!isR2Configured()) throw new Error("[guides-extract] R2 환경변수 미비");

  const stat = (
    await c.query(
      `SELECT COUNT(*) AS n, COALESCE(SUM(LENGTH(image_url)), 0) AS chars
       FROM guides WHERE image_url LIKE 'data:image%'`,
    )
  ).rows[0];
  const total = Number(stat.n);
  const totalBytes = Math.round(Number(stat.chars) * 0.75);
  console.log(
    `═══ guides 글자사진(base64) = ${total}행 ≈ ${(totalBytes / 1024 / 1024).toFixed(1)}MB (디코드 기준) ═══`,
  );
  if (!apply) {
    console.log(`=== DRY (사장님 승인 후 --apply) ===`);
    return { total, totalBytes, done: 0, failed: 0 };
  }

  const rows = (
    await c.query(
      `SELECT id, image_url FROM guides WHERE image_url LIKE 'data:image%' ORDER BY id${
        opts.limit ? ` LIMIT ${Number(opts.limit)}` : ""
      }`,
    )
  ).rows as { id: string; image_url: string }[];
  let done = 0,
    failed = 0;
  for (const r of rows) {
    try {
      const publicUrl = await uploadDataUriToR2(`guides/${r.id}`, r.image_url);
      if (!publicUrl) throw new Error("data URI 형식 아님/빈 이미지");
      await c.query(`UPDATE guides SET image_url = $2 WHERE id = $1`, [
        r.id,
        publicUrl,
      ]);
      done++;
      if (done % 50 === 0) console.log(`  … ${done}/${rows.length}`);
    } catch (e: any) {
      failed++;
      console.log(`  ✗ ${r.id}: ${String(e?.message || e).slice(0, 100)}`);
    }
  }
  console.log(`═══ 결과 = 추출 ${done} / 실패(원본유지) ${failed} ═══`);
  return { total, totalBytes, done, failed };
}

if (
  (process.argv[1] || "")
    .replace(/\\/g, "/")
    .endsWith("fill/guides-photo-extract.ts")
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
      await extractGuidesPhotosToR2({
        apply: argv["apply"] === "true",
        client: c,
        limit: argv["limit"] ? Number(argv["limit"]) : undefined,
      });
    } finally {
      await c.end();
    }
  })();
}
