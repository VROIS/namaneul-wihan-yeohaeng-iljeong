// ⚠️ 영구 컴포넌트 2026-07-07 사장님 SSOT = 창고(raw-responses/{cityId}) → 이 PC docs/raw/{cityId} 당기기(pull).
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
if (!cityId) {
  console.error("Usage: --city-id=<N>");
  process.exit(1);
}

const PREFIX = "raw-responses"; // R2 키 = raw-responses/{cityId}/{파일명}.json (옛 SP 버킷명 = R2 프리픽스 1:1)

(async () => {
  const { listR2, getFromR2 } = await import(
    pathToFileURL(path.join(ROOT, "server/services/shared/r2-client.ts")).href
  );

  const items = (await listR2(`${PREFIX}/${cityId}/`)).filter((o: any) =>
    o.key.endsWith(".json"),
  );
  console.log(
    `═══ raw-local-pull (city ${cityId}) = ${PREFIX}/${cityId}/ .json ${items.length}개 → docs/raw/${cityId}/ ═══`,
  );
  if (!items.length) {
    console.log("  (창고에 이 도시 raw 없음 = 당길 것 없음)");
    return;
  }

  const localDir = path.join(ROOT, "docs", "raw", String(cityId));
  fs.mkdirSync(localDir, { recursive: true });

  let ok = 0,
    skip = 0,
    err = 0,
    bytes = 0;
  for (const it of items) {
    try {
      const buf = await getFromR2(it.key);
      if (!buf) {
        err++;
        console.log(`  ✗ ${it.key}: GET null`);
        continue;
      }
      const localPath = path.join(localDir, path.basename(it.key));
      if (fs.existsSync(localPath) && fs.readFileSync(localPath).equals(buf)) {
        skip++;
        continue;
      }
      fs.writeFileSync(localPath, buf);
      ok++;
      bytes += buf.length;
    } catch (e: any) {
      err++;
      console.log(`  ✗ ${it.key}: ${e.message}`);
    }
  }
  console.log(
    `\n═══ 결과 = 신규/갱신 ${ok} / 동일skip ${skip} / 실패 ${err} / ${(bytes / 1024 / 1024).toFixed(2)}MB → docs/raw/${cityId}/ ═══`,
  );
  console.log(
    `   = 사장님 파일탐색기 docs/raw/${cityId}/ 열람 가능 (= 창고 저장 확인 신호).`,
  );
})();
