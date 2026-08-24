// ⚠️ 수정금지(승인필요) 2026-08-24 사장님 승인 = 90-benchmark-best20 실행 진입점
// = 도시 완성 검수 벤치마크: 베스트20(랜드마크10+식당10) 1콜 → raw 저장 → 창고(PSR) 대조 성적표 (DB 쓰기 0)
// = 설정·구조 = 01-discover-6cats 와 동일(시드발굴 표준 = 사장님 지정: 안 잘리고 JSON 응답이 입증된 표준)
//
// 호출:
//   npx tsx fillcity/prompts/90-benchmark-best20/run.ts --city-id=1 [--dry]
//   --dry = 치환된 프롬프트 전문만 출력(외부호출 0)
//
// 산출물 = docs/raw/{city_id}/{YYYY-MM-DD}_90-benchmark-best20.json (+ 콘솔 성적표)
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");
process.chdir(ROOT);

// .env 로드 (= 01-discover-6cats 동일 패턴)
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
  console.error("Usage: --city-id=<N> [--dry]");
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
    process.exit(1);
  }

  // 2. prompt 치환 (= 벤치마크 = 검수 = 행 확인 아님 = 발굴과 같은 행=없음 모드)
  const today = new Date().toISOString().slice(0, 10);
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
      .replace(/\$\{TODAY\}/g, today)
      .replace(/\$\{API_PASS\}/g, apiPass)
      .split(/═{30,}/)[2] || promptTpl;

  console.log(`═══ 90-benchmark-best20 ═══`);
  console.log(`city_id = ${cityId} (${city.name_en}, ${city.country})`);
  console.log(`center = (${city.latitude}, ${city.longitude})`);
  console.log(`mode = ${dryRun ? "DRY-RUN (= 호출 X)" : "LIVE"}`);

  if (dryRun) {
    await c.end();
    console.log("\n=== 치환된 prompt 전문 ===");
    console.log(prompt);
    process.exit(0);
  }

  // 3. Gemini key (= 출입증 관문, 01-discover 동일)
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
    process.exit(1);
  }

  // 4. Gemini 호출 (= 01-discover 표준: grounding ON / mime 없음 / thinking 0 / 420초)
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

  // 5. 잘림 복구 파싱 (= 01-discover parse 패턴) — 저장 앞에 실행 = parsed 를 파일에 펼쳐 저장(사장님 눈 검수 §18)
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

  // 6. raw 저장 (= 01-discover 동일: raw-filename 버전순번, 내용동일=덮어쓰기/다르면 _N)
  //    = parsed(펼쳐 쓴 응답 = 사람 눈 검수) + raw_text(원본 그대로 = 대조용) 2형 동시 저장 (§18 pretty 원칙)
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
  const outPath = path.join(
    outDir,
    versionedName(
      outDir,
      rawName(90, "benchmark-best20", undefined, today),
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
        parsed,
        raw_text: text,
      },
      null,
      2,
    ),
  );
  console.log(`✓ 산출물 raw 저장 = ${outPath}`);

  // 7. 창고(PSR) 대조 성적표 (= 읽기 전용 = DB 쓰기 0)
  //   서빙 자격 = status='active' + PID 있음 + RC>0 + 반경 100km (2026-08-24 서빙 게이트와 동일 기준)
  const items: any[] = [
    ...(parsed.results?.landmarks || []),
    ...(parsed.results?.restaurants || []),
  ];
  console.log(
    `\n═══ 창고 대조 성적표 (${items.length}곳: 랜드마크 ${parsed.results?.landmarks?.length || 0} + 식당 ${parsed.results?.restaurants?.length || 0}) ═══`,
  );
  const R = 6371;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const km = (a: [number, number], b: [number, number]) => {
    const dla = toRad(b[0] - a[0]);
    const dlo = toRad(b[1] - a[1]);
    const h =
      Math.sin(dla / 2) ** 2 +
      Math.cos(toRad(a[0])) * Math.cos(toRad(b[0])) * Math.sin(dlo / 2) ** 2;
    return R * 2 * Math.asin(Math.sqrt(h));
  };
  const center: [number, number] = [
    Number(city.latitude),
    Number(city.longitude),
  ];
  let ok = 0;
  const gaps: string[] = [];
  for (const it of items) {
    const names = [it.name_en, it.name_local, it.name_ko].filter(Boolean);
    const conds = names
      .map(
        (_, i) =>
          `(name_en ILIKE $${i + 1} OR name_ko ILIKE $${i + 1} OR name_local ILIKE $${i + 1})`,
      )
      .join(" OR ");
    const rows = (
      await c.query(
        `SELECT id, COALESCE(name_ko, name_en) AS nm, seed_category, status,
                (google_place_id IS NOT NULL) AS haspid,
                COALESCE(google_review_count, 0) AS rc,
                (COALESCE(image_url, '') <> '') AS hasimg, latitude, longitude
           FROM place_seed_raw WHERE ${conds}
           ORDER BY COALESCE(google_review_count, 0) DESC LIMIT 3`,
        names.map((n) => `%${n}%`),
      )
    ).rows;
    const best = rows.find((r: any) => {
      if (r.status !== "active" || !r.haspid || r.rc <= 0) return false;
      if (r.latitude == null || r.longitude == null) return false;
      return km(center, [Number(r.latitude), Number(r.longitude)]) <= 100;
    });
    const label = `${it.c === "restaurant" ? "식당" : "랜드"} ${it.rank ?? "?"} ${it.name_ko || it.name_en}`;
    if (best) {
      ok++;
      console.log(
        `  ✅ ${label} = id${best.id} [${best.nm}] RC=${Number(best.rc).toLocaleString()} 사진=${best.hasimg ? "O" : "X"}`,
      );
    } else {
      gaps.push(label);
      const near = rows[0];
      console.log(
        `  ❌ ${label} = ${near ? `유사행 id${near.id} [${near.nm}] ${near.status}/PID=${near.haspid ? "O" : "X"}/RC=${near.rc} = 서빙불가` : "창고에 없음"}`,
      );
    }
  }
  await c.end();
  console.log(
    `\n성적 = 서빙 가능 ${ok}/${items.length} | 결손 ${gaps.length}${gaps.length ? ` = ${gaps.join(", ")}` : ""}`,
  );
  console.log(
    `= 결손 채움(TS검증·발굴·PM)은 별도 승인 후 기존 fill/ 도구로만 (§16 재발명 금지).`,
  );
})();
