// ⚠️ 임시본 v1 2026-09-01 사장님 승인 = 02-enrich 7개국어 판 실행기(원본 run.ts 보존) = 1회 검증 후 정본 등재 예정
// = 기본 = 호출 + raw 보관(saveRaw §18)만 = DB 쓰기 0 → 사장님이 raw 검증 → --apply 로 DB 반영.
// = 후처리 = ko → PSR(upsertPlace targetRowId 직행) / 6개국어 → place_translations UPSERT (06-bts-venue-copy-7lang 과 동일 1벌).
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../../../..");
process.chdir(ROOT);

const envRaw = fs.readFileSync(".env", "utf-8").replace(/^\uFEFF/, "");
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
const dryRun = argv["dry"] === "true";
const apply = argv["apply"] === "true";
const fromRaw = argv["from-raw"] ? String(argv["from-raw"]) : null;
const LANGS = ["ko", "en", "ja", "fr", "zh", "es", "de"] as const;
if (!cityId) {
  console.error("Usage: --city-id=<N> [--dry] [--apply] [--from-raw=<path>]");
  process.exit(1);
}

(async () => {
  const pg = await import("pg");
  const c = new (pg as any).default.Client({
    connectionString: process.env.SUPA_URL || process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const today = new Date().toISOString().slice(0, 10);
  const city = (
    await c.query(`SELECT id, name, name_en FROM cities WHERE id=$1`, [cityId])
  ).rows[0];
  if (!city) throw new Error(`city ${cityId} 없음`);

  // 대상 = best_rank 없는 active 행 (= 제미니 요소 미보유)
  const rows: any[] = (
    await c.query(
      `SELECT id, name_local, name_en, name_ko, address, latitude, longitude, google_place_id, seed_category
         FROM place_seed_raw
        WHERE city_id=$1 AND status='active' AND best_rank IS NULL
        ORDER BY id`,
      [cityId],
    )
  ).rows;
  console.log(
    `═══ 02-enrich-place v1(7개국어) = ${city.name}(${cityId}) 대상 ${rows.length}행 ═══`,
  );
  if (!rows.length) {
    await c.end();
    console.log("대상 0 = 종료");
    return;
  }

  const jsonInput = JSON.stringify(
    rows.map((r) => ({
      id: r.id,
      name_local: r.name_local,
      name_en: r.name_en,
      name_ko: r.name_ko,
      address: r.address,
      latitude: r.latitude,
      longitude: r.longitude,
      google_place_id: r.google_place_id,
    })),
    null,
    2,
  );
  const apiPass = `[API-PASS] 도시=${city.name}(${cityId}) / 언어=7 / 행=있음(채움) / 날짜=${today}`;
  const tpl = fs.readFileSync(
    path.join(__dirname, "prompt.v1-7lang.txt"),
    "utf-8",
  );
  const prompt = (tpl.split(/═{30,}/)[2] || tpl)
    .replace(/\$\{API_PASS\}/g, apiPass)
    .replace(/\[CITY_NAME\]/g, city.name)
    .replace(/\$\{CITY_ID\}/g, String(cityId))
    .replace(/\$\{YEAR\}/g, today.slice(0, 4))
    .replace(/\$\{MONTH\}/g, String(Number(today.slice(5, 7))))
    .replace(/\$\{BATCH_LEN\}/g, String(rows.length))
    .replace(/\$\{JSON_INPUT\}/g, jsonInput);

  if (dryRun) {
    await c.end();
    console.log("\n=== 치환된 prompt 전문 ===\n" + prompt);
    process.exit(0);
  }

  let parsed: any;
  if (fromRaw) {
    const file = JSON.parse(
      fs.readFileSync(path.resolve(ROOT, fromRaw), "utf-8"),
    );
    parsed = file.raw?.parsed;
    if (!parsed?.places)
      throw new Error(`--from-raw 에 raw.parsed.places 없음`);
    console.log(`raw 재사용 = ${fromRaw} (외부호출 0)`);
  } else {
    const { issueApiKey } = await import(
      pathToFileURL(path.join(ROOT, "server/services/shared/issue-api-key.ts"))
        .href
    );
    const KEY = await issueApiKey(c, "GEMINI_API_KEY", cityId, today, true);
    if (!KEY) throw new Error("GEMINI_API_KEY 미발견");
    const t0 = Date.now();
    const resp = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-3-flash-preview:generateContent?key=${KEY}`,
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
    const start = text.indexOf("{");
    try {
      parsed = JSON.parse(text.slice(start, text.lastIndexOf("}") + 1));
    } catch {
      parsed = null;
    }
    const { saveRaw } = await import(
      pathToFileURL(path.join(ROOT, "server/services/shared/save-raw.ts")).href
    );
    await saveRaw({
      source: "gemini",
      contextId: String(cityId),
      tag: "enrich-place-7lang",
      request: { prompt, model: "gemini-3-flash-preview" },
      raw: { parsed, text, finishReason, usage },
    });
    console.log(
      `✓ raw 저장 = docs/raw/${cityId}/${today}_gemini-enrich-place-7lang.json (+ R2)`,
    );
    if (!parsed?.places) {
      await c.end();
      console.error("✗ JSON 파싱 실패 = DB 쓰기 안 함");
      process.exit(1);
    }
  }
  console.log(`응답 장소 = ${parsed.places.length}곳 / 요청 ${rows.length}곳`);
  const gotIds = new Set(parsed.places.map((p: any) => Number(p.id)));
  const missing = rows.filter((r) => !gotIds.has(r.id));
  if (missing.length)
    console.log(
      `⚠️ 응답 누락 ${missing.length}곳: ${missing.map((r) => r.id).join(",")}`,
    );
  const langStat: Record<string, number> = {};
  for (const p of parsed.places)
    for (const l of LANGS)
      if (p.i18n?.[l]?.summary) langStat[l] = (langStat[l] || 0) + 1;
  console.log(
    `언어별 채움: ${LANGS.map((l) => l + "=" + (langStat[l] || 0)).join(" · ")}`,
  );

  if (!apply) {
    await c.end();
    console.log("=== raw 보관만(DB 쓰기 0) = 검증 후 --apply ===");
    return;
  }

  const { upsertPlace } = await import(
    pathToFileURL(path.join(ROOT, "server/services/place-upsert.ts")).href
  );
  const byId = new Map(rows.map((r: any): [number, any] => [r.id, r]));
  let okKo = 0,
    okI18n = 0;
  for (const g of parsed.places) {
    const r = byId.get(Number(g.id));
    if (!r) {
      console.warn(`  ⚠️ 응답 id ${g.id} = 대상에 없음(무시)`);
      continue;
    }
    const ko = g.i18n?.ko || {};
    await upsertPlace({
      targetRowId: r.id,
      followTriggerDup: true,
      cityId,
      seedCategory: r.seed_category,
      nameEn: g.name_en || r.name_en,
      nameKo: g.name_ko || r.name_ko,
      nameLocal: g.name_local || r.name_local,
      address: g.address || r.address,
      latitude: g.latitude ?? r.latitude,
      longitude: g.longitude ?? r.longitude,
      priceEur: g.price_eur ?? null,
      selectionReasonKo: ko.summary || null,
      shortformKo: ko.editorial || null,
    });
    okKo++;
    for (const lang of LANGS) {
      if (lang === "ko") continue;
      const t = g.i18n?.[lang];
      if (!t?.summary && !t?.editorial) continue;
      await c.query(
        `INSERT INTO place_translations (place_id, language, summary, editorial_summary)
         VALUES ($1,$2,$3,$4)
         ON CONFLICT (place_id, language) DO UPDATE
           SET summary=EXCLUDED.summary, editorial_summary=EXCLUDED.editorial_summary`,
        [r.id, lang, t.summary || null, t.editorial || null],
      );
      okI18n++;
    }
  }
  console.log(
    `✅ DB 반영 = PSR(ko) ${okKo}행 · place_translations ${okI18n}행`,
  );
  await c.end();
})();
