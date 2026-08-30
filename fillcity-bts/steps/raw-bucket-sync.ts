import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

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

const PREFIX = "raw-responses"; // R2 프리픽스 (옛 Supabase 버킷명과 동일 = 키 대조 불변)

(async () => {
  const { uploadToR2, isR2Configured } = await import(
    pathToFileURL(path.join(ROOT, "server/services/shared/r2-client.ts")).href
  );
  if (!isR2Configured()) {
    console.error("✗ R2 환경변수 미비 = 업로드 불가");
    process.exit(1);
  }

  const dir = path.join(ROOT, "docs", "raw", String(cityId));
  if (!fs.existsSync(dir)) {
    console.error(`✗ ${dir} 미존재`);
    process.exit(1);
  }
  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".json"));

  console.log(
    `═══ raw-bucket-sync (city ${cityId}) = docs/raw/${cityId} .json ${files.length}개 → R2 ${PREFIX}/docs-raw/${cityId}/ ═══`,
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
      await uploadToR2(
        `${PREFIX}/docs-raw/${cityId}/${f}`,
        buf,
        "application/json",
      );
      ok++;
      bytes += buf.length;
    } catch (e: any) {
      err++;
      console.log(`  ✗ ${f}: ${e.message}`);
    }
  }
  console.log(
    `\n═══ 결과 = 업로드 ${ok} / 실패 ${err} / ${(bytes / 1024 / 1024).toFixed(1)}MB → R2 ${PREFIX}/docs-raw/${cityId}/ ═══`,
  );
})();
