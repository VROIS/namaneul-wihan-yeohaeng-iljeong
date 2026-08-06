// ⚠️ 영구 컴포넌트 2026-08-06 = guides 안 글자사진(base64 data:URI) → R2 파일 추출 + 주소 교체 = Cloudflare 이전계획 1단계 정본 도구
// = 왜: 사진이 DB 행 안에 글자로 박혀 DB 몸집 ~33MB 차지(레거시 내손앱 방식). 파일은 창고(R2)에, DB 에는 주소만 = DB 다이어트.
// = 원리: guides.image_url LIKE 'data:image%' 행만 → base64 디코드 → R2 guides/{guideId}.{확장자} 업로드 → 그 행 image_url 을 R2 공개주소로 교체.
//   멱등: 교체된 행은 'data:image%' 가 아니게 되므로 재실행 시 자동 제외. 실패 행 = 원본 유지(손실 0).
// = 레거시 Neon(39MB) 재사용: client 를 밖에서 받으므로 접속문자열만 바꾸면 동일 실행(신원교체 6단계 때).
// = 기본 DRY(쓰기 0 = 행수·용량 실측만). --apply = 실행(DB 쓰기 = 사장님 승인 게이트 = €1000 자산).
// CLI: npx tsx server/services/fill/guides-photo-extract.ts [--apply] [--limit=N]
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { uploadDataUriToR2, isR2Configured } from "../shared/r2-client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");

// ── 재사용 함수 (client = 열린 pg Client) ──
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

  // ① 실측 = base64 행수·글자 용량 (base64 글자수 ≈ 파일크기 × 4/3)
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

  // ② 추출 = 행 단위(멱등: 교체되면 대상에서 자동 제외). 실패 행 = 원본 그대로(손실 0).
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
      // 변환 = r2-client.uploadDataUriToR2 1벌(신규 저장 라우트와 공용 §16, 옛 내장 디코드 삭제 2026-08-06 §19)
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

// ── CLI = 직접 실행 시만(import 시 미발화, image-backfill 동일 패턴) ──
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
