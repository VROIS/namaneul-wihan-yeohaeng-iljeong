// ⚠️ 영구 컴포넌트 2026-08-06 = R2↔Supabase 창고 + guides DB 변화 관찰(포렌식) = Cloudflare 이전 소크·철거·테스트 실증 정본 도구
// = 왜: "정보가 어디에 언제 저장됐는지" 시간대별 현미경 추적(사장님 지시 = 돈 직결). 읽기 전용 = 쓰기 0.
// = 출력: ① R2 프리픽스별 개수·용량·최신 파일(수정시각) ② SP 버킷별 개수·용량·최신 객체(생성시각) ③ guides 최신 행(저장형태 = R2주소/base64/기타).
// = --since=ISO시각 을 주면 그 시각 이후 생긴 것만 전부 나열 = 테스트 전 기준선 → 테스트 후 변화분 포렌식.
// CLI: npx tsx server/services/fill/storage-observe.ts [--since=2026-08-06T12:00:00Z] [--top=5]
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { listR2 } from "../shared/r2-client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");

const R2_PREFIXES = [
  "place-images",
  "itinerary-videos",
  "raw-responses",
  "guides",
];
const SP_BUCKETS = ["place-images", "itinerary-videos", "raw-responses"];
const mb = (n: number) => (n / 1024 / 1024).toFixed(2) + "MB";
const t = (d: Date | string | null) =>
  d ? new Date(d).toISOString().replace("T", " ").slice(0, 19) + "Z" : "-";

// ── 재사용 함수 (client = 열린 pg Client) ──
export async function observeStorage(opts: {
  client: any;
  since?: string | null;
  top?: number;
}): Promise<void> {
  const { client: c } = opts;
  const top = opts.top ?? 5;
  const since = opts.since ? new Date(opts.since) : null;
  console.log(
    `═══ 창고 관찰 ${t(new Date())} ${since ? `(변화분 기준 = ${t(since)} 이후)` : "(기준선 = 전체 현황)"} ═══`,
  );

  // ① R2 (수정시각 = S3 LastModified)
  console.log(`\n[R2 버킷 ${process.env.R2_BUCKET_NAME || "?"}]`);
  const all = await listR2("");
  for (const p of R2_PREFIXES) {
    const objs = all.filter((o) => o.key.startsWith(p + "/"));
    const bytes = objs.reduce((s, o) => s + o.size, 0);
    const fresh = since
      ? objs.filter((o) => o.lastModified && o.lastModified > since)
      : [];
    const latest = (since ? fresh : objs)
      .slice()
      .sort((a, b) => +(b.lastModified || 0) - +(a.lastModified || 0))
      .slice(0, since ? 1000 : top);
    console.log(
      `  ${p}/ = ${objs.length}개 ${mb(bytes)}${since ? ` | 이후 신규 ${fresh.length}개` : ""}`,
    );
    for (const o of latest)
      console.log(
        `    ${t(o.lastModified)}  ${mb(o.size).padStart(9)}  ${o.key}`,
      );
  }
  const etc = all.filter(
    (o) => !R2_PREFIXES.some((p) => o.key.startsWith(p + "/")),
  );
  if (etc.length)
    console.log(`  (기타 = ${etc.length}개, _r2-smoke-test 등 잔재)`);

  // ② Supabase Storage (생성/수정시각 = storage.objects)
  console.log(`\n[Supabase Storage]`);
  for (const b of SP_BUCKETS) {
    const r = (
      await c.query(
        `SELECT COUNT(*) n, COALESCE(SUM((metadata->>'size')::bigint),0) bytes,
                COUNT(*) FILTER (WHERE created_at > $2) fresh
         FROM storage.objects WHERE bucket_id = $1 AND name NOT LIKE '%.emptyFolderPlaceholder'`,
        [b, since ?? new Date(0)],
      )
    ).rows[0];
    console.log(
      `  ${b} = ${r.n}개 ${mb(Number(r.bytes))}${since ? ` | 이후 신규 ${r.fresh}개 ${Number(r.fresh) > 0 ? "⚠️(R2 전환 후엔 0이어야 정상)" : "✅"}` : ""}`,
    );
    const rows = (
      await c.query(
        `SELECT name, (metadata->>'size')::bigint size, created_at
         FROM storage.objects WHERE bucket_id = $1 AND name NOT LIKE '%.emptyFolderPlaceholder'
           ${since ? "AND created_at > $2" : ""}
         ORDER BY created_at DESC LIMIT ${since ? 1000 : top}`,
        since ? [b, since] : [b],
      )
    ).rows;
    for (const o of rows)
      console.log(
        `    ${t(o.created_at)}  ${mb(Number(o.size)).padStart(9)}  ${o.name}`,
      );
  }

  // ③ guides DB = 신규 가이드가 어디로 갔는지(저장형태 판정)
  console.log(`\n[DB guides 최신 행]`);
  const g = (
    await c.query(
      `SELECT id, created_at, LENGTH(COALESCE(image_url,'')) len,
              CASE WHEN image_url IS NULL THEN 'NULL(사진없음)'
                   WHEN image_url LIKE 'data:image%' THEN '⚠️ base64(DB직저장=옛방식)'
                   WHEN image_url LIKE '%r2.dev%' THEN '✅ R2 주소'
                   WHEN image_url LIKE '%supabase.co%' THEN '⚠️ supabase 주소(재유입)'
                   ELSE '기타' END kind,
              LEFT(COALESCE(image_url,''), 90) head
       FROM guides ${since ? "WHERE created_at > $1" : ""}
       ORDER BY created_at DESC LIMIT ${since ? 100 : top}`,
      since ? [since] : [],
    )
  ).rows;
  if (!g.length) console.log(`  (해당 없음)`);
  for (const r of g)
    console.log(
      `  ${t(r.created_at)}  ${r.kind}  [${r.len}자] ${r.head}${r.len > 90 ? "…" : ""}  id=${r.id}`,
    );
}

// ── CLI = 직접 실행 시만(import 시 미발화, image-backfill 동일 패턴) ──
if (
  (process.argv[1] || "")
    .replace(/\\/g, "/")
    .endsWith("fill/storage-observe.ts")
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
      await observeStorage({
        client: c,
        since: argv["since"] || null,
        top: argv["top"] ? Number(argv["top"]) : 5,
      });
    } finally {
      await c.end();
    }
  })();
}
