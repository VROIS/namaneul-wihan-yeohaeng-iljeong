// ⚠️ 영구 컴포넌트 2026-08-06 = Supabase Storage → R2 기존 파일 복사(멱등·재개형) = Cloudflare 이전계획 1단계 정본 도구
// = 대상: 버킷 3종(raw-responses 41MB → itinerary-videos 221MB → place-images 666MB) = 총 ~0.93GB < Supabase 무료 전송한도 5GB = 1패스.
// = 원리: storage.objects SQL 로 전체 목록(재귀, storage-image-relink 동일 패턴 §16) → R2 에 이미 같은 크기로 있으면 skip(멱등·이어받기)
//   → 없는 것만 Supabase GET(Bearer) → uploadToR2(`{버킷명}/{경로}` = 버킷명이 R2 프리픽스) → 크기 대조.
// = 기본 DRY(쓰기 0·전송 0 = 목록·통계만). --apply 시 실행. 재실행 = 이미 복사된 키 전부 skip = 전송 재과금 0(§18 비용보호).
// = 삭제는 절대 안 함(Supabase 철거 = 1-5 소크 후 사장님 승인 별도 = §19).
// CLI: npx tsx server/services/fill/storage-r2-migrate.ts --bucket=raw-responses [--apply] [--concurrency=5]
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { uploadToR2, listR2, isR2Configured } from "../shared/r2-client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");

const BUCKETS = ["raw-responses", "itinerary-videos", "place-images"] as const;

// 확장자 → Content-Type (복사 시 원형 유지)
function contentTypeOf(name: string): string {
  const ext = name.toLowerCase().split(".").pop() || "";
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "mp4") return "video/mp4";
  if (ext === "json") return "application/json";
  return "application/octet-stream";
}

// ── 재사용 함수 = 버킷 1개 복사 (client = 열린 pg Client) ──
export async function migrateBucketToR2(opts: {
  bucket: string;
  apply: boolean;
  client: any;
  concurrency?: number;
}): Promise<{
  total: number;
  totalBytes: number;
  already: number;
  copied: number;
  copiedBytes: number;
  failed: number;
}> {
  const { bucket, apply, client: c } = opts;
  if (!isR2Configured()) throw new Error("[r2-migrate] R2 환경변수 미비");
  const supaPublicUrl =
    process.env.SUPABASE_PUBLIC_URL ||
    "https://wxebceflvuythuodemro.supabase.co";
  const storageKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_KEY;
  if (!storageKey) throw new Error("[r2-migrate] Supabase 읽기 키 없음");

  // ① 원본 전체 목록 = storage.objects SQL (재귀·정확 크기, relink 동일 패턴 §16)
  const rows = (
    await c.query(
      `SELECT name, COALESCE((metadata->>'size')::bigint, 0) AS size
       FROM storage.objects
       WHERE bucket_id = $1 AND name NOT LIKE '%.emptyFolderPlaceholder'
       ORDER BY name`,
      [bucket],
    )
  ).rows as { name: string; size: number }[];
  const totalBytes = rows.reduce((s, r) => s + Number(r.size), 0);

  // ② R2 현황 = 같은 키·같은 크기면 완료로 간주(멱등·이어받기)
  const existing = new Map(
    (await listR2(`${bucket}/`)).map((o) => [o.key, o.size]),
  );
  const pending = rows.filter(
    (r) => existing.get(`${bucket}/${r.name}`) !== Number(r.size),
  );

  console.log(
    `═══ [${bucket}] 원본 ${rows.length}개 ${(totalBytes / 1024 / 1024).toFixed(1)}MB | R2 완료 ${rows.length - pending.length} | 남은 복사 ${pending.length} ═══`,
  );
  if (!apply) {
    console.log(`=== DRY (--apply 로 복사. 전송 0·쓰기 0) ===`);
    return {
      total: rows.length,
      totalBytes,
      already: rows.length - pending.length,
      copied: 0,
      copiedBytes: 0,
      failed: 0,
    };
  }

  // ③ 복사 = 소규모 동시성(기본 5) = 사진 ~수천 개 대응. 실패는 건너뛰고 집계(재실행 시 재시도됨).
  let copied = 0,
    copiedBytes = 0,
    failed = 0,
    idx = 0;
  const enc = (n: string) => n.split("/").map(encodeURIComponent).join("/");
  const worker = async () => {
    while (idx < pending.length) {
      const r = pending[idx++];
      try {
        const resp = await fetch(
          `${supaPublicUrl}/storage/v1/object/${bucket}/${enc(r.name)}`,
          {
            headers: { Authorization: `Bearer ${storageKey}` },
            signal: AbortSignal.timeout(120000),
          },
        );
        if (!resp.ok) throw new Error(`GET ${resp.status}`);
        const buf = Buffer.from(await resp.arrayBuffer());
        if (Number(r.size) > 0 && buf.length !== Number(r.size))
          throw new Error(`크기 불일치 ${buf.length}≠${r.size}`);
        await uploadToR2(`${bucket}/${r.name}`, buf, contentTypeOf(r.name));
        copied++;
        copiedBytes += buf.length;
        if (copied % 200 === 0)
          console.log(
            `  … ${copied}/${pending.length} (${(copiedBytes / 1024 / 1024).toFixed(1)}MB)`,
          );
      } catch (e: any) {
        failed++;
        console.log(`  ✗ ${r.name}: ${String(e?.message || e).slice(0, 120)}`);
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.max(1, opts.concurrency ?? 5) }, worker),
  );

  console.log(
    `═══ [${bucket}] 결과 = 복사 ${copied}(${(copiedBytes / 1024 / 1024).toFixed(1)}MB) / 기존완료 ${rows.length - pending.length} / 실패 ${failed} ═══`,
  );
  return {
    total: rows.length,
    totalBytes,
    already: rows.length - pending.length,
    copied,
    copiedBytes,
    failed,
  };
}

// ── CLI = 직접 실행 시만(import 시 미발화, image-backfill 동일 패턴) ──
if (
  (process.argv[1] || "")
    .replace(/\\/g, "/")
    .endsWith("fill/storage-r2-migrate.ts")
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
    const bucket = String(argv["bucket"] || "");
    if (!BUCKETS.includes(bucket as any)) {
      console.error(
        `Usage: --bucket=${BUCKETS.join("|")} [--apply] [--concurrency=5]`,
      );
      process.exit(1);
    }
    // @ts-ignore = pg 타입선언 없음(런타임 전용, image-backfill CLI 동일 패턴)
    const pg = await import("pg");
    const c = new (pg as any).default.Client({
      connectionString: process.env.SUPA_URL || process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });
    await c.connect();
    try {
      await migrateBucketToR2({
        bucket,
        apply: argv["apply"] === "true",
        client: c,
        concurrency: argv["concurrency"] ? Number(argv["concurrency"]) : 5,
      });
    } finally {
      await c.end();
    }
  })();
}
