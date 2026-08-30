// ⚠️ 수정금지(승인필요) 2026-08-17 사장님 승인 = 05-restaurant-lean 실행 진입점 (= 3 호출 분할, 03/04 대칭 축소판)
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");
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
const year = String(argv["year"] || new Date().getFullYear());
if (!cityId) {
  console.error("Usage: --city-id=<N> [--year=2026]");
  process.exit(1);
}

// ⚠️ 수정금지(승인필요) 2026-08-17 사장님 승인 = 3 tier(경제10/합리30/프리미엄+럭셔리20=60) = 옛 03(4×30=120)+04(2×30=60)=180 대비 축소.
const TIER_SPECS = {
  economic: {
    label: "10 ECONOMIC",
    spec: "10 ECONOMIC (= 1인당 평균 ~€24 이하 = 베이커리/크레페리/패스트/한식 분식)",
    count: 10,
  },
  reasonable: {
    label: "30 REASONABLE",
    spec: "30 REASONABLE (= 1인당 평균 €25-60 = 비스트로/브라세리/평범한 디너)",
    count: 30,
  },
  premium_luxury: {
    label: "20 PREMIUM+LUXURY",
    spec: "20 PREMIUM+LUXURY (= 1인당 평균 €61+ = 미슐랭 빕구르망~1+스타/시그너처 통합)",
    count: 20,
  },
};

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

  const apiPass = `[API-PASS] 도시=${city.name_en}(${cityId}) / 행=없음(발굴) / 날짜=${today}`;
  const outDir = path.join(ROOT, "docs", "raw", String(cityId));
  fs.mkdirSync(outDir, { recursive: true });
  const { rawName, rawHash, versionedName } = await import(
    pathToFileURL(path.join(ROOT, "server/services/shared/raw-filename.ts"))
      .href
  );
  const hashOf = (p: string): string | null => {
    try {
      return rawHash(JSON.parse(fs.readFileSync(p, "utf-8")).raw_text);
    } catch {
      return null;
    }
  };

  console.log(`═══ 05-restaurant-lean ═══`);
  console.log(
    `city_id = ${cityId} (${city.name_en}), year = ${year}, today = ${today}`,
  );

  const promptTpl =
    fs
      .readFileSync(path.join(__dirname, "prompt.txt"), "utf-8")
      .split(
        "═══════════════════════════════════════════════════════════════════════",
      )[2] || "";

  function build(
    tier: "economic" | "reasonable" | "premium_luxury",
    excludeList = "",
  ): string {
    const spec = TIER_SPECS[tier];
    const OUTPUT_SPEC = `{ "results": { "${tier}": [ ...${spec.count} ] } }`;
    return promptTpl
      .replace(/\$\{API_PASS\}/g, apiPass)
      .replace(/\$\{CITY_NAME\}/g, city.name_en)
      .replace(/\$\{COUNTRY\}/g, city.country)
      .replace(/\$\{CITY_LAT\}/g, String(city.latitude))
      .replace(/\$\{CITY_LNG\}/g, String(city.longitude))
      .replace(/\$\{YEAR\}/g, year)
      .replace(/\$\{TIER_LABEL\}/g, spec.label)
      .replace(/\$\{TIER_SPEC\}/g, spec.spec)
      .replace(/\$\{TIER_COUNT\}/g, String(spec.count))
      .replace(/\$\{OUTPUT_SPEC\}/g, OUTPUT_SPEC)
      .replace(/\$\{EXCLUDE_LIST\}/g, excludeList);
  }

  async function callGemini(prompt: string) {
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
    return {
      text: j.candidates?.[0]?.content?.parts?.[0]?.text || "",
      finishReason: j.candidates?.[0]?.finishReason || "UNKNOWN",
      usage: j.usageMetadata || {},
    };
  }

  function parseTier(text: string, key: string): any[] {
    const start = text.indexOf("{");
    if (start < 0) return [];
    try {
      return (
        JSON.parse(text.slice(start, text.lastIndexOf("}") + 1)).results?.[
          key
        ] || []
      );
    } catch (e) {
      return [];
    }
  }

  const accumulated: any[] = [];
  for (const tier of ["economic", "reasonable", "premium_luxury"] as const) {
    console.log(`\n--- 호출 = ${TIER_SPECS[tier].label} ---`);
    const excludeStr = accumulated.length
      ? `\n  이미 추천된 ${accumulated.length} 곳 (= 아래) 와 중복 X:\n` +
        accumulated
          .map((p: any) => `  - ${p.name_en} (${p.address || ""})`)
          .join("\n")
      : "";
    const t0 = Date.now();
    const r = await callGemini(build(tier, excludeStr));
    console.log(
      `${Date.now() - t0} ms / ${r.finishReason} / 토큰 ${r.usage.totalTokenCount || "?"}`,
    );
    const outPath = path.join(
      outDir,
      versionedName(
        outDir,
        rawName(5, "restaurant-lean", tier, today),
        rawHash(r.text),
        hashOf,
      ),
    );
    fs.writeFileSync(
      outPath,
      JSON.stringify(
        {
          meta: {
            city_id: cityId,
            tier,
            called_at: new Date().toISOString(),
            finish_reason: r.finishReason,
            usage: r.usage,
            exclude_count: accumulated.length,
          },
          raw_text: r.text,
        },
        null,
        2,
      ),
    );
    const list = parseTier(r.text, tier);
    console.log(`✓ 저장 = ${outPath} (= ${list.length} 곳)`);
    accumulated.push(...list);
  }

  console.log(`\n═══ 합계 = ${accumulated.length} / 60 ═══`);
  console.log(`다음 = post-process.ts (= upsertPlace INSERT) 실행:`);
  console.log(
    `  npx tsx fillcity/prompts/05-restaurant-lean/post-process.ts --city-id=${cityId} --date=${today}`,
  );
})();
