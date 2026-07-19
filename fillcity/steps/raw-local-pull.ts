// ⚠️ 영구 컴포넌트 2026-07-07 사장님 SSOT = Storage(raw-responses/{cityId}) → 이 PC docs/raw/{cityId} 당기기(pull).
//   = raw-bucket-sync.ts(로컬→Storage)의 역방향. Storage = 원재료 SSOT(어느 경로로 저장됐든 = 운영·CromeDevTools).
//   = 로컬은 사장님 요구 시 즉시 생성(열람용). 외부호출 0 = Storage 읽기만(list + GET). 형식 보존(Storage 파일 그대로 write).
//   호출: npx tsx fillcity/steps/raw-local-pull.ts --city-id=19
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
if (!cityId) {
  console.error("Usage: --city-id=<N>");
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
    console.error("✗ Storage 키 미존재 = pull 불가");
    process.exit(1);
  }

  // ① Storage list = 도시폴더 파일 목록 (페이지네이션 = 100개 초과 도시 대응)
  const listAll = async (prefix: string): Promise<string[]> => {
    const all: string[] = [];
    for (let off = 0; ; off += 100) {
      const r = await fetch(
        `${supaPublicUrl}/storage/v1/object/list/${BUCKET}`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${storageKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ prefix, limit: 100, offset: off }),
          signal: AbortSignal.timeout(30000),
        },
      );
      const j: any = await r.json();
      if (!Array.isArray(j) || !j.length) break;
      for (const f of j) if (f?.name?.endsWith(".json")) all.push(f.name);
      if (j.length < 100) break;
    }
    return all;
  };

  const prefix = `${cityId}/`;
  const files = await listAll(prefix);
  console.log(
    `═══ raw-local-pull (city ${cityId}) = ${BUCKET}/${prefix} .json ${files.length}개 → docs/raw/${cityId}/ ═══`,
  );
  if (!files.length) {
    console.log("  (Storage 에 이 도시 raw 없음 = 당길 것 없음)");
    return;
  }

  const localDir = path.join(ROOT, "docs", "raw", String(cityId));
  fs.mkdirSync(localDir, { recursive: true });

  // ② 각 파일 GET(다운로드) → ③ 로컬 write (형식 보존 = Storage 것 그대로)
  //   = list 의 name = 파일명만(prefix 제외) → GET 경로 = {prefix}{name}. 슬래시 없는 파일명만 인코딩.
  let ok = 0,
    skip = 0,
    err = 0,
    bytes = 0;
  for (const name of files) {
    try {
      const r = await fetch(
        `${supaPublicUrl}/storage/v1/object/${BUCKET}/${prefix}${encodeURIComponent(name)}`,
        {
          headers: { Authorization: `Bearer ${storageKey}` },
          signal: AbortSignal.timeout(30000),
        },
      );
      if (!r.ok) {
        err++;
        console.log(`  ✗ ${name}: GET ${r.status}`);
        continue;
      }
      const buf = Buffer.from(await r.arrayBuffer());
      const localPath = path.join(localDir, path.basename(name));
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
      console.log(`  ✗ ${name}: ${e.message}`);
    }
  }
  console.log(
    `\n═══ 결과 = 신규/갱신 ${ok} / 동일skip ${skip} / 실패 ${err} / ${(bytes / 1024 / 1024).toFixed(2)}MB → docs/raw/${cityId}/ ═══`,
  );
  console.log(
    `   = 사장님 파일탐색기 docs/raw/${cityId}/ 열람 가능 (= Storage 저장 확인 신호).`,
  );
})();
