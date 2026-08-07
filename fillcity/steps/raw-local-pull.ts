// ⚠️ 영구 컴포넌트 2026-07-07 사장님 SSOT = 창고(raw-responses/{cityId}) → 이 PC docs/raw/{cityId} 당기기(pull).
//   = 창고 = 원재료 SSOT(어느 경로로 저장됐든 = 운영·CromeDevTools). 창고 = R2 단독(2026-08-07 §19/1-5b = SP 철거, 옛 Supabase API 경로 완전 삭제).
//   = 로컬은 사장님 요구 시 즉시 생성(열람용). 외부호출 0 = R2 읽기만(listR2 + getFromR2). 형식 보존(창고 파일 그대로 write).
//   호출: npx tsx fillcity/steps/raw-local-pull.ts --city-id=19
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

  // ① R2 list = 도시폴더 .json 목록 (listR2 = 페이지네이션 내장)
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

  // ② 각 파일 GET(다운로드) → ③ 로컬 write (형식 보존 = 창고 것 그대로)
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
      // 이미 있고 내용 동일 = skip(중복 write 0). 다르거나 없으면 = write.
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
