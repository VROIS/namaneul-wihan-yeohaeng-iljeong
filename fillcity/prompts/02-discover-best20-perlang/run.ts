// ⚠️ 수정금지(승인필요) 2026-08-25 사장님 승인 = 02-discover-best20-perlang 실행 진입점
// = 시드 발굴 1단계(원재료) — 언어별 개별 콜. 90-benchmark-best20(사후 검수)과 다른 새 파일(90번은 그대로 둠, §16).
// = 랜드마크20 + 각 랜드마크 인근 식당3(저/중/고)x20=60 = 80곳/콜. 언어당 1콜 x 7언어.
// = raw 저장 = saveRaw() 단일 관문(§18) 재사용 = 로컬 docs/raw/{cityId} + R2 raw-responses/{cityId} 2곳 동형.
// = PSR 자동입력 없음(DB 쓰기 0) — raw만 남기고 사장님이 직접 검증.
//
// 호출:
//   npx tsx fillcity/prompts/02-discover-best20-perlang/run.ts --city-id=19 --lang=ko [--dry]
//   --dry = 치환된 프롬프트 전문만 출력(외부호출 0)
//
// 산출물 = docs/raw/{city_id}/{YYYY-MM-DD}_gemini-best20perlang-{lang}.json (+ R2 동일 경로)
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");
process.chdir(ROOT);

// .env 로드 (= 90-benchmark-best20 동일 패턴)
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
const lang = String(argv["lang"] || "");
const VALID_LANGS = ["ko", "en", "ja", "fr", "zh", "es", "de"];
if (!cityId || !VALID_LANGS.includes(lang)) {
  console.error(
    `Usage: --city-id=<N> --lang=<${VALID_LANGS.join("|")}> [--dry]`,
  );
  process.exit(1);
}
const dryRun = argv["dry"] === "true";

(async () => {
  // 1. 도시 정보 조회
  const pg = await import("pg");
  const mkClient = () =>
    new pg.default.Client({
      connectionString: process.env.SUPA_URL || process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });
  const c = mkClient();
  await c.connect();
  const city = (
    await c.query(
      "SELECT name_en, country, latitude, longitude FROM cities WHERE id=$1",
      [cityId],
    )
  ).rows[0];
  if (!city) {
    console.error(`city_id=${cityId} 미존재`);
    await c.end();
    process.exit(1);
  }

  // 2. prompt 치환
  const today = new Date().toISOString().slice(0, 10);
  const apiPass = `[API-PASS] 도시=${city.name_en}(${cityId}) / 언어=${lang} / 행=없음(발굴) / 날짜=${today}`;
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
      .replace(/\$\{TODAY\}/g, today)
      .replace(/\$\{LANGUAGE\}/g, lang)
      .replace(/\$\{API_PASS\}/g, apiPass)
      .split(/═{30,}/)[2] || promptTpl;

  console.log(`═══ 02-discover-best20-perlang ═══`);
  console.log(`city_id = ${cityId} (${city.name_en}, ${city.country})`);
  console.log(`center = (${city.latitude}, ${city.longitude})`);
  console.log(`language = ${lang}`);
  console.log(`mode = ${dryRun ? "DRY-RUN (= 호출 X)" : "LIVE"}`);

  if (dryRun) {
    await c.end();
    console.log("\n=== 치환된 prompt 전문 ===");
    console.log(prompt);
    process.exit(0);
  }

  // 3. Gemini key (= 출입증 관문, 90-benchmark-best20 동일)
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
  if (!GEMINI_KEY) {
    console.error("GEMINI_API_KEY 미발견");
    await c.end();
    process.exit(1);
  }

  // 4. Gemini 호출 (= 90-benchmark-best20 표준: grounding ON / mime 없음 / thinking 0 / 420초)
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

  // 5. 잘림 복구 파싱 (= 90-benchmark-best20 동일 패턴)
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
    await c.end();
    process.exit(1);
  }
  console.log(
    `landmarks=${parsed.results?.landmarks?.length ?? 0} restaurants=${parsed.results?.restaurants?.length ?? 0}`,
  );

  // 6. raw 저장 = saveRaw() 단일 관문(§18) — 로컬 docs/raw/{cityId} + R2 raw-responses/{cityId} 2곳 동형
  const { saveRaw } = await import(
    pathToFileURL(path.join(ROOT, "server/services/shared/save-raw.ts")).href
  );
  await saveRaw({
    source: "gemini",
    contextId: cityId,
    tag: `best20perlang-${lang}`,
    request: { prompt, model: "gemini-3-flash-preview", lang },
    raw: { parsed, text, finishReason, usage },
  });
  console.log(
    `✓ raw 저장 완료 = docs/raw/${cityId}/${today}_gemini-best20perlang-${lang}.json (+ R2 동일 경로)`,
  );

  await c.end();
})();
