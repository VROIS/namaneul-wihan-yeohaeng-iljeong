// ⚠️ 수정금지(승인필요) 2026-05-20 = 04-outskirt-restaurant 실행 진입점 (= 2 호출 분할)
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../.."); // ⚠️ 2026-06-08 = prompts/04 un-archive 복귀 = 상위 5 (표준 스킬 위치 = 아카이브 ROOT 버그 근본해소)
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
// ⚠️ 수정금지(승인필요) 2026-06-08 = 범용 표준 = 도시명·지명 0 = Gemini 자가발굴 (B 시뮬 입증). --hints 미제공 = 이 표준 타입.
const UNIVERSAL_OUTSKIRT_TYPES =
  "역사 구시가 도시 / 궁전·성·유적 / 자연·국립공원 / 즐길거리(놀이공원·액티비티) / 쇼핑몰";
const hints = String(argv["hints"] || UNIVERSAL_OUTSKIRT_TYPES);
const year = String(argv["year"] || new Date().getFullYear());
if (!cityId) {
  console.error('Usage: --city-id=<N> [--hints="타입 override(선택)"]');
  process.exit(1);
}

(async () => {
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
    await c.end();
    console.error("city 미존재");
    process.exit(1);
  }
  // ⚠️ 2026-06-18 사장님 SSOT = 출입증 관문 issue_api_key() 경유. 외곽식당 발굴(04-outskirt) = 도시 있음 + 행 없음(false = 신규 발견).
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
    console.error("Gemini key 미발급 = 출입증 검문 미달 또는 api_keys DB 확인");
    process.exit(1);
  }

  // ⚠️ 2026-06-18 사장님 승인 = 출입증(${API_PASS}) 동적 조립 (= 발굴 = 행=없음). 형식 = 3요소 칸 고정(도시·행·날짜).
  const apiPass = `[API-PASS] 도시=${city.name_en}(${cityId}) / 행=없음(발굴) / 날짜=${today}`;
  const outDir = path.join(ROOT, "docs", "raw", String(cityId));
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`═══ 04-outskirt-restaurant ═══`);
  console.log(
    `city_id = ${cityId} (${city.name_en}), hints = ${hints.slice(0, 60)}...`,
  );

  const promptTpl =
    fs
      .readFileSync(path.join(__dirname, "prompt.txt"), "utf-8")
      .split(
        "═══════════════════════════════════════════════════════════════════════",
      )[2] || "";

  function build(tier: "low" | "mid", excludeList = ""): string {
    const TIER_LABEL = tier === "low" ? "30 LOW" : "30 MID";
    const TIER_SPEC =
      tier === "low"
        ? "30 LOW (= 1인당 평균 ~30 EUR 이하 = 저렴)"
        : "30 MID (= 30-80 EUR = 합리적)";
    const OUTPUT_SPEC =
      tier === "low"
        ? '{ "results": { "low": [ ...30 ] } }'
        : '{ "results": { "mid": [ ...30 ] } }';
    return promptTpl
      .replace(/\$\{API_PASS\}/g, apiPass) // ⚠️ 2026-06-18 = 출입증 헤더 동적 치환 (= 표준 프롬프트 통과 증표)
      .replace(/\$\{CITY_NAME\}/g, city.name_en)
      .replace(/\$\{COUNTRY\}/g, city.country)
      .replace(/\$\{CITY_LAT\}/g, String(city.latitude))
      .replace(/\$\{CITY_LNG\}/g, String(city.longitude))
      .replace(/\$\{YEAR\}/g, year)
      .replace(/\$\{OUTSKIRT_HINTS\}/g, hints)
      .replace(/\$\{TIER_LABEL\}/g, TIER_LABEL)
      .replace(/\$\{TIER_SPEC\}/g, TIER_SPEC)
      .replace(/\$\{OUTPUT_SPEC\}/g, OUTPUT_SPEC)
      .replace(/\$\{EXCLUDE_LIST\}/g, excludeList);
  }

  async function callGemini(
    prompt: string,
  ): Promise<{ text: string; finishReason: string; usage: any }> {
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
            // ⚠️ 수정금지(승인필요) 2026-06-08 사용자 승인 = responseMimeType 제거 = 그라운딩(googleSearch) + mime 'application/json' 동시 불가(INVALID_ARGUMENT = #06 빈응답 버그) = geminiClient.ts:68 정합. prompt "STRICT JSON" 지시 + parseTier() 잘림복구가 JSON 보장.
            thinkingConfig: { thinkingBudget: 0 },
          },
        }),
        signal: AbortSignal.timeout(420000),
      },
    );
    const j = (await resp.json()) as any;
    return {
      text: j.candidates?.[0]?.content?.parts?.[0]?.text || "",
      finishReason: j.candidates?.[0]?.finishReason || "UNKNOWN",
      usage: j.usageMetadata || {},
    };
  }

  function parseTier(text: string, key: "low" | "mid"): any[] | null {
    const start = text.indexOf("{");
    if (start < 0) return null;
    try {
      const p = JSON.parse(text.slice(start, text.lastIndexOf("}") + 1));
      return p.results?.[key] || null;
    } catch (e) {
      return null;
    }
  }

  // ⚠️ 수정금지(승인필요) — raw 버전순번(2026-06-16 SSOT) = low/mid 파일별 versionedName(외부응답 raw_text만 해싱)
  const { rawName, rawHash, versionedName } = await import(
    pathToFileURL(path.join(ROOT, "server/services/shared/raw-filename.ts"))
      .href
  );
  // ⚠️ 수정금지(승인필요) — raw 버전순번(2026-06-16 SSOT) = 기존파일 raw_text 부분만 md5 (meta 제외)
  const hashOf = (p: string): string | null => {
    try {
      return rawHash(JSON.parse(fs.readFileSync(p, "utf-8")).raw_text);
    } catch {
      return null;
    }
  };

  console.log("\n--- 호출 1 = 30 LOW ---");
  const t1 = Date.now();
  const r1 = await callGemini(build("low", ""));
  console.log(
    `${Date.now() - t1} ms / ${r1.finishReason} / 토큰 ${r1.usage.totalTokenCount}`,
  );
  // ⚠️ 수정금지(승인필요) — raw 버전순번(2026-06-16 SSOT) = 해싱대상 = 외부응답(r1.text)만 (meta/called_at 제외)
  fs.writeFileSync(
    path.join(
      outDir,
      versionedName(
        outDir,
        rawName(4, "outskirt-restaurant", "low", today),
        rawHash(r1.text),
        hashOf,
      ),
    ),
    JSON.stringify(
      {
        meta: {
          city_id: cityId,
          called_at: new Date().toISOString(),
          finish_reason: r1.finishReason,
          usage: r1.usage,
        },
        raw_text: r1.text,
      },
      null,
      2,
    ),
  );
  const lowList = parseTier(r1.text, "low") || [];
  console.log(`✓ low 저장 = ${lowList.length} 곳`);

  console.log("\n--- 호출 2 = 30 MID + EXCLUDE_LIST ---");
  const excludeStr = lowList.length
    ? "\n  이미 추천된 LOW 30 곳 (= 아래) 와 중복 X:\n" +
      lowList
        .map((p: any) => `  - ${p.name_en} (${p.address || ""})`)
        .join("\n")
    : "";
  const t2 = Date.now();
  const r2 = await callGemini(build("mid", excludeStr));
  console.log(
    `${Date.now() - t2} ms / ${r2.finishReason} / 토큰 ${r2.usage.totalTokenCount}`,
  );
  // ⚠️ 수정금지(승인필요) — raw 버전순번(2026-06-16 SSOT) = 해싱대상 = 외부응답(r2.text)만 (meta/called_at/exclude_count 제외)
  fs.writeFileSync(
    path.join(
      outDir,
      versionedName(
        outDir,
        rawName(4, "outskirt-restaurant", "mid", today),
        rawHash(r2.text),
        hashOf,
      ),
    ),
    JSON.stringify(
      {
        meta: {
          city_id: cityId,
          called_at: new Date().toISOString(),
          finish_reason: r2.finishReason,
          usage: r2.usage,
          exclude_count: lowList.length,
        },
        raw_text: r2.text,
      },
      null,
      2,
    ),
  );
  const midList = parseTier(r2.text, "mid") || [];
  console.log(`✓ mid 저장 = ${midList.length} 곳`);

  console.log(`\n═══ 합계 = ${lowList.length + midList.length} / 60 ═══`);
  console.log(`다음 = post-process.ts (= upsertPlace INSERT) 실행:`);
  console.log(
    `  npx tsx fillcity/prompts/04-outskirt-restaurant/post-process.ts --city-id=${cityId}`,
  );
})();
