// ⚠️ 수정금지(승인필요) 2026-08-26 사장님 지시 = 06-bts-venue-copy-7lang 실행 진입점
// = BTS 미래공연 공연장(bts_venue) 제미니 텍스트 요소(name_ko·name_local·요약·후킹 7개국어) 1콜 채움.
// = 대상 = cities.bts_concert_dates 에 오늘 이후 날짜가 있는 도시의 bts_venue 행(공연 지난 도시 제외 = 사장님 지시).
// = 기본 = 호출 + raw 보관(saveRaw §18)만 = DB 쓰기 0 → 사장님이 raw 검증 → --apply 로 DB 반영.
//
// 호출:
//   npx tsx fillcity/prompts/06-bts-venue-copy-7lang/run.ts --dry            (치환 프롬프트 전문 출력, 외부호출 0)
//   npx tsx fillcity/prompts/06-bts-venue-copy-7lang/run.ts                  (🔴 제미니 1콜 + raw 보관)
//   npx tsx fillcity/prompts/06-bts-venue-copy-7lang/run.ts --apply          (🔴 1콜 + raw + DB 반영)
//   npx tsx fillcity/prompts/06-bts-venue-copy-7lang/run.ts --apply --from-raw=<docs/raw/runtime/파일명>  (재호출 0 = 보관 raw 로 DB 반영)
//
// 쓰기(--apply): ko 요약·카피·name_ko·name_local → PSR 그 행(upsertPlace targetRowId 직행 + followTriggerDup =
//   공연장·아미존·굿즈샵 0m 동일좌표 사유, image-backfill mirrorWikiVenueImages 와 동일 근거) /
//   en·ja·fr·zh·es·de → place_translations (place_id,language) UPSERT = 원어 카피가 기계번역 캐시보다 우선(§14 새것우선).
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
const dryRun = argv["dry"] === "true";
const apply = argv["apply"] === "true";
const fromRaw = argv["from-raw"] ? String(argv["from-raw"]) : null;
const LANGS = ["ko", "en", "ja", "fr", "zh", "es", "de"] as const;

(async () => {
  const pg = await import("pg");
  const c = new (pg as any).default.Client({
    connectionString: process.env.SUPA_URL || process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const today = new Date().toISOString().slice(0, 10);

  // 1. 대상 = 미래공연 도시의 bts_venue (공연 지난 도시 제외)
  // ⚠️ 수정금지(승인필요) 2026-08-28 = venues 명시적 any[] = 타입 미표기 시 tsc 가 {} 로 오추론(런타임 무관, §22 통과용).
  const venues: any[] = (
    await c.query(
      `SELECT p.id, p.city_id, p.name_en, p.address, ct.name_en AS city, ct.country, ct.bts_concert_dates AS dates
         FROM place_seed_raw p JOIN cities ct ON ct.id = p.city_id
        WHERE p.seed_category = 'bts_venue' ORDER BY p.city_id`,
    )
  ).rows
    .map((r: any) => {
      let dates: string[] = [];
      try {
        dates = Array.isArray(r.dates) ? r.dates : JSON.parse(r.dates || "[]");
      } catch {
        dates = [];
      }
      return { ...r, dates: dates.map((d) => String(d).slice(0, 10)) };
    })
    .filter((r: any) => r.dates.some((d: string) => d >= today));
  console.log(
    `═══ 06-bts-venue-copy-7lang = 대상 공연장 ${venues.length}곳 (미래공연 도시만) ═══`,
  );
  for (const v of venues)
    console.log(`  #${v.id} [${v.city}] ${v.name_en} (${v.dates.join(",")})`);

  // 2. prompt 치환
  const venuesJson = JSON.stringify(
    venues.map((v: any) => ({
      id: v.id,
      city: v.city,
      country: v.country,
      name_en: v.name_en,
      address: v.address,
      concert_dates: v.dates,
    })),
    null,
    2,
  );
  const apiPass = `[API-PASS] 도시=BTS공연장 ${venues.length}곳(다도시) / 언어=7 / 행=있음(텍스트 채움) / 날짜=${today}`;
  const promptTpl = fs.readFileSync(
    path.join(__dirname, "prompt.txt"),
    "utf-8",
  );
  const prompt =
    promptTpl
      .replace(/\$\{TODAY\}/g, today)
      .replace(/\$\{VENUES_JSON\}/g, venuesJson)
      .replace(/\$\{API_PASS\}/g, apiPass)
      .split(/═{30,}/)[2] || promptTpl;

  if (dryRun) {
    await c.end();
    console.log("\n=== 치환된 prompt 전문 ===");
    console.log(prompt);
    process.exit(0);
  }

  // 3. 응답 확보 = 재호출 0(--from-raw) 또는 🔴 제미니 1콜
  let parsed: any;
  if (fromRaw) {
    const file = JSON.parse(
      fs.readFileSync(path.resolve(ROOT, fromRaw), "utf-8"),
    );
    parsed = file.raw?.parsed;
    if (!parsed?.venues)
      throw new Error(`--from-raw 파일에 raw.parsed.venues 없음: ${fromRaw}`);
    console.log(`raw 재사용 = ${fromRaw} (외부호출 0)`);
  } else {
    const { issueApiKey } = await import(
      pathToFileURL(path.join(ROOT, "server/services/shared/issue-api-key.ts"))
        .href
    );
    // 출입증 = 대표 도시 = 첫 공연장 도시(다도시 1콜)
    const GEMINI_KEY = await issueApiKey(
      c,
      "GEMINI_API_KEY",
      venues[0]?.city_id || 0,
      today,
      true,
    );
    if (!GEMINI_KEY) throw new Error("GEMINI_API_KEY 미발견");
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
      contextId: "runtime",
      tag: "bts-venue-copy-7lang",
      request: { prompt, model: "gemini-3-flash-preview" },
      raw: { parsed, text, finishReason, usage },
    });
    console.log(
      `✓ raw 저장 = docs/raw/runtime/${today}_gemini-bts-venue-copy-7lang.json (+ R2 동일 경로, 내용 다르면 _N)`,
    );
    if (!parsed?.venues) {
      await c.end();
      console.error("✗ JSON 파싱 실패 또는 venues 없음 = DB 쓰기 안 함");
      process.exit(1);
    }
  }
  console.log(`응답 공연장 = ${parsed.venues.length}곳`);

  if (!apply) {
    await c.end();
    console.log("=== raw 보관만(DB 쓰기 0) = 사장님 검증 후 --apply ===");
    return;
  }

  // 4. DB 반영
  const { upsertPlace } = await import(
    pathToFileURL(path.join(ROOT, "server/services/place-upsert.ts")).href
  );
  // ⚠️ 수정금지(승인필요) 2026-08-28 = 튜플 반환 타입 명시 = 안 하면 new Map() 값 타입이 {} 로 잘못 추론되어
  //   아래 v.id/v.city_id/v.name_en/v.city 전부 tsc 오류(런타임 동작엔 영향 없음, §22 기계검증 통과용 타입 수정).
  const byId = new Map(venues.map((v: any): [number, any] => [v.id, v]));
  let okKo = 0,
    okI18n = 0;
  for (const g of parsed.venues) {
    const v = byId.get(Number(g.id));
    if (!v) {
      console.warn(`  ⚠️ 응답 id ${g.id} = 대상에 없음(무시)`);
      continue;
    }
    const ko = g.i18n?.ko || {};
    await upsertPlace({
      targetRowId: v.id,
      followTriggerDup: true, // 0m 동일좌표 3형제 = 불변4 필연 차단 → 정식 면제(prompt.txt 헤더 근거)
      cityId: v.city_id,
      seedCategory: "bts_venue",
      nameEn: v.name_en,
      nameKo: g.name_ko || null,
      nameLocal: g.name_local || null,
      selectionReasonKo: ko.summary || null,
      shortformKo: ko.editorial || null,
    });
    okKo++;
    for (const lang of LANGS) {
      if (lang === "ko") continue; // ko = PSR 원본(캐시 대상 아님, place_translations 스키마 주석)
      const t = g.i18n?.[lang];
      if (!t?.summary && !t?.editorial) continue;
      await c.query(
        `INSERT INTO place_translations (place_id, language, summary, editorial_summary)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (place_id, language) DO UPDATE
           SET summary = EXCLUDED.summary, editorial_summary = EXCLUDED.editorial_summary`,
        [v.id, lang, t.summary || null, t.editorial || null],
      );
      okI18n++;
    }
    console.log(`  ✅ #${v.id} [${v.city}] ko+${LANGS.length - 1}개국어 반영`);
  }
  console.log(
    `✅ DB 반영 = PSR(ko) ${okKo}행 · place_translations ${okI18n}행`,
  );
  await c.end();
})();
