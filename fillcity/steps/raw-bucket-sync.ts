// ⚠️ 영구 컴포넌트 2026-06-10 = docs/raw/{city} raw 파일 → Supabase Storage 'raw-responses' 버킷 동기화(영구 백업).
//   = 발굴 raw 가 로컬 PC 에만 있는 누수 차단 = "필수 raw 버킷 저장"(사용자 완성 기준). 외부호출 0 = Storage PUT 만.
//   = 발굴 후 오케스트레이터가 호출 → 버킷에 항상 최신 raw. 버킷이 진짜 토대(PC/DB 날아가도 재입력 가능).
//   호출: npx tsx fillcity/steps/raw-bucket-sync.ts --city-id=37 [--apply]
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
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
const cityId = Number(argv["city-id"] || 0);
const apply = argv["apply"] === "true";
if (!cityId) {
  console.error("Usage: --city-id=<N> [--apply]");
  process.exit(1);
}

const BUCKET = "raw-responses";

(async () => {
  const storageKey =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_KEY;
  const supaPublicUrl =
    process.env.SUPABASE_PUBLIC_URL ||
    "https://wxebceflvuythuodemro.supabase.co";
  if (!storageKey) {
    console.error("✗ SUPABASE_SERVICE_ROLE_KEY 미존재 = 업로드 불가");
    process.exit(1);
  }

  const dir = path.join(ROOT, "docs", "raw", String(cityId));
  if (!fs.existsSync(dir)) {
    console.error(`✗ ${dir} 미존재`);
    process.exit(1);
  }
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));

  console.log(
    `═══ raw-bucket-sync (city ${cityId}) = docs/raw/${cityId} .json ${files.length}개 → ${BUCKET}/docs-raw/${cityId}/ ═══`,
  );
  if (!apply) {
    console.log(
      `[대상] ${files.slice(0, 60).join(", ")}${files.length > 60 ? " ..." : ""}`,
    );
    console.log(`\n=== DRY (--apply 로 업로드) ===`);
    return;
  }

  let ok = 0,
    err = 0,
    bytes = 0;
  for (const f of files) {
    try {
      const buf = fs.readFileSync(path.join(dir, f));
      const r = await fetch(
        `${supaPublicUrl}/storage/v1/object/${BUCKET}/docs-raw/${cityId}/${encodeURIComponent(f)}`,
        {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${storageKey}`,
            "Content-Type": "application/json",
            "x-upsert": "true",
          },
          body: buf,
          signal: AbortSignal.timeout(30000),
        },
      );
      if (r.ok) {
        ok++;
        bytes += buf.length;
      } else {
        err++;
        console.log(`  ✗ ${f}: ${r.status} ${(await r.text()).slice(0, 80)}`);
      }
    } catch (e: any) {
      err++;
      console.log(`  ✗ ${f}: ${e.message}`);
    }
  }
  console.log(
    `\n═══ 결과 = 업로드 ${ok} / 실패 ${err} / ${(bytes / 1024 / 1024).toFixed(1)}MB → ${BUCKET}/docs-raw/${cityId}/ ═══`,
  );
})();
