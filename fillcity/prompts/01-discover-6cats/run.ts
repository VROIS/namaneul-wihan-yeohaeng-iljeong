// ⚠️ 수정금지(승인필요) 2026-05-20 = 01-discover-6cats 실행 진입점
// = README.md 7 요소 중 ④ 실행 스크립트
// = prompt.txt 치환 + _call-config.md 표준 호출 + docs/raw/{city_id}/01-discover-6cats.json 저장
//
// 호출:
//   npx tsx fillcity/prompts/01-discover-6cats/run.ts --city-id=19 [--dry]
//
// 산출물 = docs/raw/{city_id}/{YYYY-MM-DD}_01-discover-6cats.json (= 날짜앞 표준, raw-filename.ts / post-process.ts 입력)
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");
process.chdir(ROOT);

// .env 로드
const envRaw = fs.readFileSync(".env", "utf-8").replace(/^﻿/, "");
for (const line of envRaw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]]) {
    let v = m[2].trim();
    if (/^['"]/.test(v)) v = v.slice(1, -1);
    process.env[m[1]] = v;
  }
}

// 인자 파싱
const argv = Object.fromEntries(
  process.argv
    .slice(2)
    .map((a) => a.replace(/^--/, "").split("="))
    .map(([k, v]) => [k, v ?? "true"]),
);
const cityId = Number(argv["city-id"] || 0);
if (!cityId) {
  console.error("Usage: --city-id=<N> [--dry]");
  process.exit(1);
}
const dryRun = argv["dry"] === "true";

(async () => {
  // 1. 도시 정보 조회
  const pg = await import("pg");
  const c = new pg.default.Client({
    connectionString: process.env.SUPA_URL || process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const city = (
    await c.query(
      "SELECT name_en, country, latitude, longitude FROM cities WHERE id=$1",
      [cityId],
    )
  ).rows[0];
  if (!city) {
    console.error(`city_id=${cityId} 미존재`);
    process.exit(1);
  }

  // 2. Gemini key 로드 (= 출입증 관문 issue_api_key() 경유)
  // ⚠️ 2026-06-18 사장님 SSOT = 발굴(01-discover-6cats) = 도시 있음 + 행 없음(false = 신규 발견).
  // = 출입증(키이름·도시id·날짜·행없음) 검문 통과해야만 키 발급. 미달 = throw = 외부호출 불가.
  const today = new Date().toISOString().slice(0, 10);
  const { issueApiKey } = await import(
    pathToFileURL(path.join(ROOT, "server/services/shared/issue-api-key.ts"))
      .href
  );
  const GEMINI_KEY = await issueApiKey(
    c,
    "GEMINI_API_KEY",
    cityId,
    today,
    false,
  );
  await c.end();
  if (!GEMINI_KEY) {
    console.error("GEMINI_API_KEY 미발견");
    process.exit(1);
  }

  // 3. prompt 치환
  // ⚠️ 2026-06-18 사장님 승인 = 출입증(${API_PASS}) 동적 조립 (= 발굴 = 행=없음). 형식 = 3요소 칸 고정(도시·행·날짜).
  // = 01-discover-6cats = 발굴 = 행=없음(발굴 = 신규 발견). 도시 = 이름(id). 날짜 = 호출시점.
  const apiPass = `[API-PASS] 도시=${city.name_en}(${cityId}) / 행=없음(발굴) / 날짜=${today}`;
  const promptTpl = fs.readFileSync(
    path.join(__dirname, "prompt.txt"),
    "utf-8",
  );
  const prompt =
    promptTpl
      .replace(/\$\{CITY_NAME\}/g, city.name_en)
      .replace(/\$\{COUNTRY\}/g, city.country)
      .replace(/\$\{CITY_LAT\}/g, String(city.latitude))
      .replace(/\$\{CITY_LNG\}/g, String(city.longitude))
      .replace(/\$\{API_PASS\}/g, apiPass)
      // ⚠️ 2026-06-18 = 구분선 자릿수 무관 정규식 split (= prompt.txt 자릿수 불일치 방지 = 02-enrich 정합)
      .split(/═{30,}/)[2] || promptTpl;

  console.log(`═══ 01-discover-6cats ═══`);
  console.log(`city_id = ${cityId} (${city.name_en}, ${city.country})`);
  console.log(`center = (${city.latitude}, ${city.longitude})`);
  console.log(`mode = ${dryRun ? "DRY-RUN (= 호출 X)" : "LIVE"}`);

  if (dryRun) {
    console.log("\n=== 치환된 prompt 미리보기 ===");
    console.log(prompt.slice(0, 2000));
    console.log("\n... (= 전문 = " + prompt.length + " 자)");
    process.exit(0);
  }

  // 4. Gemini 호출 (= _call-config.md 표준)
  const t0 = Date.now();
  const resp = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${GEMINI_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        tools: [{ googleSearch: {} }],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 50000,
          // ⚠️ 수정금지(승인필요) 2026-06-07 사용자 승인 = responseMimeType 제거 = 그라운딩(googleSearch tools) + mime 'application/json' 동시 호출 불가(INVALID_ARGUMENT) = geminiClient.ts:68 정합. prompt.txt "STRICT JSON" 지시 + 아래 parse() 잘림복구가 JSON 보장. (= 빈 응답 버그 수정)
          thinkingConfig: { thinkingBudget: 0 },
        },
      }),
      signal: AbortSignal.timeout(420000),
    },
  );
  const j = (await resp.json()) as any;
  const text = j.candidates?.[0]?.content?.parts?.[0]?.text || "";
  const finishReason = j.candidates?.[0]?.finishReason || "UNKNOWN";
  const usage = j.usageMetadata || {};
  console.log(
    `\n호출 = ${Date.now() - t0} ms / finishReason = ${finishReason} / 토큰 = ${usage.totalTokenCount || "?"}`,
  );

  // 5. 산출물 raw 저장 (= docs/raw/{city_id}/{YYYY-MM-DD}_01-discover-6cats.json)
  const outDir = path.join(ROOT, "docs", "raw", String(cityId));
  fs.mkdirSync(outDir, { recursive: true });
  // ⚠️ 2026-06-15 = 파일명 단일 표준(raw-filename.ts) = {date}_01-discover-6cats.json (날짜앞)
  // ⚠️ 수정금지(승인필요) — raw 버전순번(2026-06-16 SSOT) = versionedName 으로 외부응답(raw_text)만 해싱 → 내용동일=덮어쓰기 / 다르면 _N
  const { rawName, rawHash, versionedName } = await import(
    pathToFileURL(path.join(ROOT, "server/services/shared/raw-filename.ts"))
      .href
  );
  // ⚠️ 수정금지(승인필요) — raw 버전순번(2026-06-16 SSOT) = 기존파일 raw_text 부분만 md5 (meta 제외 = 비교 기준 동일)
  const hashOf = (p: string): string | null => {
    try {
      return rawHash(JSON.parse(fs.readFileSync(p, "utf-8")).raw_text);
    } catch {
      return null;
    }
  };
  // ⚠️ 수정금지(승인필요) — raw 버전순번(2026-06-16 SSOT) = 해싱대상 = 외부응답(raw_text)만 (meta/called_at 제외)
  const outPath = path.join(
    outDir,
    versionedName(
      outDir,
      rawName(1, "discover-6cats", undefined, today),
      rawHash(text),
      hashOf,
    ),
  );
  fs.writeFileSync(
    outPath,
    JSON.stringify(
      {
        meta: {
          city_id: cityId,
          city_name: city.name_en,
          country: city.country,
          called_at: new Date().toISOString(),
          finish_reason: finishReason,
          usage,
        },
        raw_text: text,
      },
      null,
      2,
    ),
  );
  console.log(`✓ 산출물 raw 저장 = ${outPath}`);

  // 6. 잘림 복구 검증 (= _call-config.md parse 함수 패턴)
  function parse(t: string): any | null {
    const start = t.indexOf("{");
    if (start < 0) return null;
    try {
      return JSON.parse(t.slice(start, t.lastIndexOf("}") + 1));
    } catch (e) {}
    for (let endIdx = t.length - 1; endIdx > start; endIdx--) {
      if (t[endIdx] !== "}") continue;
      const trimmed = t.slice(start, endIdx + 1);
      for (const suffix of ["]}}", "]}", "}", ""]) {
        try {
          const p = JSON.parse(trimmed + suffix);
          if (p.results) return p;
        } catch (e) {}
      }
    }
    return null;
  }
  const parsed = parse(text);
  if (!parsed) {
    console.error("✗ JSON 파싱 실패 = 잘림 복구도 실패");
    process.exit(1);
  }

  // 7. 카테고리별 응답 수 검증
  const cats = [
    "heritage",
    "hotspot",
    "attraction",
    "adventure",
    "healing",
    "shopping",
  ];
  const counts = Object.fromEntries(
    cats.map((k) => [k, parsed.results?.[k]?.length || 0]),
  );
  const total = Object.values(counts).reduce(
    (s: number, n) => s + (n as number),
    0,
  );
  console.log(`\n응답 검증:`);
  cats.forEach((k) =>
    console.log(
      `  ${k} = ${counts[k]} / 20 (= 누락 ${20 - (counts[k] as number)})`,
    ),
  );
  console.log(`  합계 = ${total} / 120`);

  console.log(
    `\n✓ Step 1 완료. 다음 = post-process.ts (= upsertPlace 통한 INSERT) 실행:`,
  );
  console.log(
    `  npx tsx fillcity/prompts/01-discover-6cats/post-process.ts --city-id=${cityId}`,
  );
})();
