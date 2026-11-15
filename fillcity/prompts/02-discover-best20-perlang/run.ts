// ⚠️ 수정금지(승인필요) 2026-08-25 사장님 승인 = 02-discover-best20-perlang 실행 진입점
import fs from "fs";
import path from "path";
import { rawDirOf } from "../../../worker/lib/services/shared/local-paths";
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
const lang = String(argv["lang"] || "");
const VALID_LANGS = ["ko", "en", "ja", "fr", "zh", "es", "de"];
if (!cityId || !VALID_LANGS.includes(lang)) {
  console.error(
    `Usage: --city-id=<N> --lang=<${VALID_LANGS.join("|")}> [--dry]`,
  );
  process.exit(1);
}
const dryRun = argv["dry"] === "true";
// 필시티 v4 = --ballot=<용지 파일> 이 오면 "볼거리 고르기"만 투표로 바꾼다(용지에서 TOP N · 식당은 볼거리마다 3곳 그대로) · 지시문 원본 파일은 그대로 두고 호출 직전에만 바꾼다 (정본 2026-11-14)
const ballotPath =
  argv["ballot"] && argv["ballot"] !== "true" ? String(argv["ballot"]) : "";
const TOP_N = Number(argv["top"] || 30);
function ballotPrompt(
  body: string,
  ballotText: string,
  radiusKm: number,
): string {
  const swap = (t: string, a: string | RegExp, b: string) => {
    if (typeof a === "string" ? !t.includes(a) : !a.test(t))
      throw new Error("투표판 지시문 = 원본에서 못 찾음: " + String(a));
    return typeof a === "string" ? t.split(a).join(b) : t.replace(a, b);
  };
  const N = String(TOP_N);
  const NEW1 = [
    '1) Select "landmarks" — this is a VOTE, not a free listing. The BALLOT at the end lists places in this',
    "   area that travelers actually book tours and tickets for (alphabetical order, the order means nothing).",
    "   From the BALLOT choose the TOP " +
      N +
      " places that travelers from the ${LANGUAGE}-speaking region most want",
    "   to visit and actually go to when they stay in ${CITY_NAME} — inside the city or a day trip away does not",
    "   matter; judge only by how much they really go. Rank them 1-" +
      N +
      " and give each its ballot_no.",
    "   A village, an old town or a hilltop town that people visit as a destination in itself IS a place — vote",
    "   for it like any other. Skip only entries that are a whole region or country, a hotel, or a transfer or airport.",
    "   If two ballot entries are the same place under different names, vote for only one of them.",
    "   ONLY IF a place that clearly belongs in that top " +
      N +
      " is MISSING from the BALLOT (typically a free sight",
    "   people visit on their own, without a tour), you may put it in the " +
      N +
      ' with "ballot_no": 0 — at most 5 such',
    "   places, and never invent a place.",
  ].join("\n");
  let t = swap(
    body,
    '1) Select "landmarks" — TOP 20 globally representative landmarks.',
    NEW1,
  );
  t = swap(t, "RADIUS_KM: 100", "RADIUS_KM: " + radiusKm);
  t = swap(
    t,
    "For EACH of those 20 landmarks",
    "For EACH of those " + N + " landmarks",
  );
  t = swap(
    t,
    "20 x 3 = 60 restaurants",
    N + " x 3 = " + TOP_N * 3 + " restaurants",
  );
  t = swap(t, "near_landmark_rank (1-20,", "near_landmark_rank (1-" + N + ",");
  t = swap(t, "...20 items", "..." + N + " items");
  t = swap(t, "...60 items", "..." + TOP_N * 3 + " items");
  t = swap(
    t,
    /- rank\r?\n/,
    "- rank\n- (landmarks only) ballot_no (the number on the BALLOT, or 0 if it is not on the BALLOT)\n",
  );
  t = swap(
    t,
    /\r?\nOUTPUT \(strict JSON/,
    "\nBALLOT:\n" + ballotText + "\n\nOUTPUT (strict JSON",
  );
  return t;
}

(async () => {
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

  const today = new Date().toISOString().slice(0, 10);
  const apiPass = `[API-PASS] 도시=${city.name_en}(${cityId}) / 언어=${lang} / 행=없음(발굴) / 날짜=${today}`;
  const promptTpl = fs.readFileSync(
    path.join(__dirname, "prompt.txt"),
    "utf-8",
  );
  const ballotFile = ballotPath
    ? JSON.parse(fs.readFileSync(ballotPath, "utf-8"))
    : null;
  const ballot: any[] | null = ballotFile?.ballot ?? null;
  if (ballotPath && !ballot?.length) {
    console.error(`✗ 용지가 비었다 = ${ballotPath}`);
    await c.end();
    process.exit(1);
  }
  const fill = (t: string) =>
    t
      .replace(/\$\{CITY_NAME\}/g, city.name_en)
      .replace(/\$\{COUNTRY\}/g, city.country)
      .replace(/\$\{CITY_LAT\}/g, String(city.latitude))
      .replace(/\$\{CITY_LNG\}/g, String(city.longitude))
      .replace(/\$\{TODAY\}/g, today)
      .replace(/\$\{LANGUAGE\}/g, lang)
      .replace(/\$\{API_PASS\}/g, apiPass);
  const prompt = ballot
    ? fill(
        ballotPrompt(
          promptTpl.split(/═{30,}/)[2] || promptTpl,
          ballot
            .map(
              (b) => `${b.no}. ${b.name} (${Math.round(b.km)} km from center)`,
            )
            .join("\n"),
          Number(ballotFile.radiusKm),
        ),
      )
    : fill(promptTpl).split(/═{30,}/)[2] || promptTpl;

  console.log(`═══ 02-discover-best20-perlang ═══`);
  console.log(`city_id = ${cityId} (${city.name_en}, ${city.country})`);
  console.log(`center = (${city.latitude}, ${city.longitude})`);
  console.log(`language = ${lang}`);
  console.log(
    `방식 = ${ballot ? `투표(용지 ${ballot.length}곳 · 볼거리 ${TOP_N} + 식당 ${TOP_N * 3})` : "자유 발굴(v3.2)"}`,
  );
  console.log(`mode = ${dryRun ? "DRY-RUN (= 호출 X)" : "LIVE"}`);

  if (dryRun) {
    await c.end();
    console.log("\n=== 치환된 prompt 전문 ===");
    console.log(prompt);
    process.exit(0);
  }

  const { issueApiKey } = await import(
    pathToFileURL(
      path.join(ROOT, "worker/lib/services/shared/issue-api-key.ts"),
    ).href
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
  const text = (j.candidates?.[0]?.content?.parts || [])
    .map((x: any) => x.text || "")
    .join("");
  const finishReason = j.candidates?.[0]?.finishReason || "UNKNOWN";
  const usage = j.usageMetadata || {};
  console.log(
    `\n호출 = ${Date.now() - t0} ms / finishReason = ${finishReason} / 토큰 = ${usage.totalTokenCount || "?"}`,
  );

  function parse(t: string): any | null {
    const start = t.indexOf("{");
    if (start < 0) return null;
    try {
      return JSON.parse(t.slice(start, t.lastIndexOf("}") + 1));
    } catch {}
    for (let endIdx = t.length - 1; endIdx > start; endIdx--) {
      if (t[endIdx] !== "}") continue;
      const trimmed = t.slice(start, endIdx + 1);
      for (const suffix of ["]}}", "]}", "}", ""]) {
        try {
          const p = JSON.parse(trimmed + suffix);
          if (p.results) return p;
        } catch {}
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

  const { saveRaw } = await import(
    pathToFileURL(path.join(ROOT, "worker/lib/services/shared/save-raw.ts"))
      .href
  );
  await saveRaw({
    source: "gemini",
    contextId: cityId,
    tag: `best20perlang-${lang}`,
    request: {
      prompt,
      model: "gemini-3-flash-preview",
      lang,
      ...(ballot ? { ballot: path.basename(ballotPath), top: TOP_N } : {}),
    },
    raw: { parsed, text, finishReason, usage },
  });
  console.log(
    `✓ raw 저장 완료 = ${rawDirOf(cityId)}/${today}_gemini-best20perlang-${lang}.json (+ R2 동일 경로)`,
  );

  await c.end();
})();
