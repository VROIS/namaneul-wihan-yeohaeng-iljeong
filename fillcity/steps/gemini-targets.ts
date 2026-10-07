// ⚠️ 수정금지(승인필요) 2026-10-05 사장님 결정 = v3.2 최적화 (정본 §)
import fs from "fs";
import path from "path";
import {
  ROOT,
  connectDb,
  loadEnv,
  nameTokens,
  parseArgs,
  reportDir,
  runTsx,
  stamp,
} from "./common";

loadEnv();
const argv = parseArgs();
const cityId = Number(argv["city-id"] || 0);
const call = argv["call"] === "true"; // 🔴 유료 = 제미니 호출
const PARTS = 4;
const isBlank = (x: unknown) => x == null || String(x).trim() === "";

(async () => {
  if (!cityId) {
    console.error(
      "Usage: --city-id=<N> [--mismatch=<에이전트 어긋남 JSON,…>] [--call=true]",
    );
    process.exit(1);
  }
  const c = await connectDb();
  const rows = (
    await c.query(
      `SELECT id, name_en, name_local, name_ko, summary_ko, editorial_summary,
              google_review_count AS rc, price_eur::float8 AS price
         FROM place_seed_raw
        WHERE city_id=$1 AND status='active' AND seed_category NOT LIKE 'bts%' AND seed_category<>'hotel'
          AND (business_status IS NULL OR business_status NOT IN ('CLOSED_PERMANENTLY','CLOSED_TEMPORARILY'))
          AND google_maps_uri LIKE '%cid=%'`,
      [cityId],
    )
  ).rows;
  const reason = new Map<number, Set<string>>();
  const add = (id: number, k: string) =>
    (reason.get(id) ?? reason.set(id, new Set()).get(id)!).add(k);

  for (const r of rows)
    if (
      [r.name_ko, r.name_local, r.summary_ko, r.editorial_summary].some(isBlank)
    )
      add(r.id, "빈 칸");

  // 같은 요약·카피가 다른 행에도 있음(전 도시 대상)
  const dupTexts = new Set<string>(
    (
      await c.query(
        `SELECT t FROM (
           SELECT summary_ko AS t FROM place_seed_raw WHERE status='active' AND length(summary_ko) > 12
           UNION ALL
           SELECT editorial_summary FROM place_seed_raw WHERE status='active' AND length(editorial_summary) > 12
         ) x GROUP BY t HAVING count(*) > 1`,
      )
    ).rows.map((r: any) => r.t),
  );
  for (const r of rows)
    if (
      dupTexts.has(String(r.summary_ko || "").trim()) ||
      dupTexts.has(String(r.editorial_summary || "").trim())
    )
      add(r.id, "같은 글 중복");

  // 원어 이름이 구글 이름과 낱말이 하나도 안 겹침(영어·원어 표기 차이는 가짜 의심 = 호출로 정리됨)
  for (const r of rows) {
    if (!r.name_local) continue;
    const a = new Set(nameTokens(r.name_en));
    const b = nameTokens(r.name_local);
    if (!a.size || !b.length) continue;
    const hit = b.filter(
      (w) => a.has(w) || [...a].some((x) => x.includes(w) || w.includes(x)),
    ).length;
    if (hit === 0) add(r.id, "이름 불일치 후보");
  }

  // 에이전트 보고 어긋남
  for (const f of String(argv["mismatch"] || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean))
    for (const x of JSON.parse(fs.readFileSync(f, "utf-8")))
      add(Number(x.id), "에이전트 보고 어긋남");

  const byId = new Map<number, any>(rows.map((r: any) => [r.id, r]));
  const targets = [...reason.keys()]
    .filter((id) => byId.has(id))
    .sort((a, b) => (byId.get(b).rc || 0) - (byId.get(a).rc || 0)); // 손님상(리뷰 많은 순) 먼저
  const dir = reportDir(cityId);
  const st = stamp();
  const batches: number[][] = Array.from({ length: PARTS }, () => []);
  targets.forEach((id, i) => batches[i % PARTS].push(id)); // 리뷰 많은 순으로 돌려 담아 몫마다 비슷하게
  while (batches.length && !batches[batches.length - 1].length) batches.pop();
  const files = batches.map((b, k) => {
    const f = path.join(dir, `${st}_gemini-ids-${k + 1}.json`);
    fs.writeFileSync(f, JSON.stringify(b));
    return f;
  });
  fs.writeFileSync(
    path.join(dir, `${st}_gemini-before.json`),
    JSON.stringify(
      targets.map((id) => {
        const r = byId.get(id);
        return {
          id,
          name_ko: r.name_ko,
          name_local: r.name_local,
          summary_ko: r.summary_ko,
          editorial_summary: r.editorial_summary,
          price_eur: r.price,
          reasons: [...reason.get(id)!],
        };
      }),
    ),
  );
  const kinds: Record<string, number> = {};
  for (const id of targets)
    for (const k of reason.get(id)!) kinds[k] = (kinds[k] || 0) + 1;
  console.log(
    `═══ 제미니 호출 대상 city ${cityId} = ${targets.length}행(hotel·폐업 제외) · 이유별 ${JSON.stringify(kinds)} · 호출 ${batches.length}번 ${call ? "" : "(명단만 = 호출하려면 --call=true)"} ═══`,
  );
  await c.end();
  if (call) {
    // ⚠️ 수정금지(승인필요) 2026-10-07 사장님 결정 = 2차 호출 실행 = 기존 도구 gemini-apply.ts 를 공용 runTsx 1벌로 부른다 (정본 §)
    const gemini = path.join(ROOT, "worker/lib/services/fill/gemini-apply.ts");
    const sh = (args: string[]) =>
      runTsx(gemini, [`--city-id=${cityId}`, ...args]);
    console.log(
      `🔴 제미니 호출 ${files.length}번 동시 (${batches.map((b) => b.length).join("·")}행)`,
    );
    const codes = await Promise.all(
      files.map((f, k) =>
        sh(["--call=true", `--ids-file=${f}`, `--part=${k + 1}`, "--apply"]),
      ),
    );
    const rawDir = path.join(ROOT, "docs", "raw", String(cityId));
    let stillFailed = 0;
    for (const [k, code] of codes.entries()) {
      if (code === 0) continue;
      // 저장된 응답이 있으면 그것을 적용(돈을 다시 쓰지 않는다) · 없을 때만 그 몫을 다시 부른다
      const saved = fs
        .readdirSync(rawDir)
        .filter(
          (x) =>
            x.endsWith(`_gemini-enrich-after-google-${k + 1}.json`) && x >= st,
        )
        .sort()
        .pop();
      console.error(
        `⚠️ 제미니 호출 ${k + 1} 실패 = ${saved ? "저장된 응답을 적용" : "그 몫만 다시 호출"}`,
      );
      const retry = saved
        ? await sh([
            `--raw=${path.join(rawDir, saved)}`,
            `--part=${k + 1}`,
            "--apply",
          ])
        : await sh([
            "--call=true",
            `--ids-file=${files[k]}`,
            `--part=${k + 1}`,
            "--apply",
          ]);
      if (retry !== 0) stillFailed++;
    }
    if (stillFailed) {
      console.error(`✗ 제미니 호출 ${stillFailed}몫이 끝내 실패 = 멈춤`);
      process.exit(1);
    }
  }
  process.exit(0);
})().catch((e) => {
  console.error("✗ 제미니 호출 대상 실패:", e?.message || e);
  process.exit(1);
});
