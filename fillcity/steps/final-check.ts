// ⚠️ 수정금지(승인필요) 2026-10-24 사장님 결정 = 최종 점검 = 일꾼 판정을 검문(지시문대로 했는가) 통과분은 --apply 판에서 그 자리에서 창고에 넣는다(고침 = llm-review --apply · 새 식당 = discovery-lists-insert --report) · --apply 가 없으면 점검표만 · 사람(AI) 수작업 단계 없음 (정본 §2026-10-24)
import fs from "fs";
import path from "path";
import { rawDirOf } from "../../worker/lib/services/shared/local-paths";
import { distanceKmFromCoords } from "../../worker/lib/services/shared/geo-distance";
import {
  ROOT,
  AGENT_WORKERS,
  connectDb,
  loadEnv,
  parseArgs,
  reportDir,
  runAgents,
  runTsx,
  shareRanges,
  stamp,
} from "./common";
import { validateRefine } from "./refine-validate";
import {
  type AuditResult,
  auditWithRetry,
  checkCheckRow,
} from "./procedure-check";

loadEnv();
const argv = parseArgs();
const cityId = Number(argv["city-id"] || 0);
const INSTRUCTION = path.join(
  ROOT,
  "fillcity/prompts/06-final-check/instruction.txt",
);

(async () => {
  if (!cityId) {
    console.error("Usage: --city-id=<N>");
    process.exit(1);
  }
  const c = await connectDb();
  const items: any[] = (
    await c.query(
      `SELECT id, substring(google_maps_uri from 'cid=([0-9]+)') AS cid, name_en, seed_category, price_eur::float8 AS price_eur
         FROM place_seed_raw WHERE city_id=$1 AND merged_into IS NULL AND seed_category NOT LIKE 'bts%' AND google_maps_uri LIKE '%cid=%'
        ORDER BY id`,
      [cityId],
    )
  ).rows.map((r: any, order: number) => ({ order, ...r }));
  await c.end();
  const dir = argv["resume"]
    ? path.resolve(String(argv["resume"]))
    : path.join(reportDir(cityId), `final-check-${stamp()}`);
  fs.mkdirSync(dir, { recursive: true });
  const inputFile = path.join(dir, "final-input.json");
  fs.writeFileSync(
    inputFile,
    JSON.stringify(
      {
        cityId,
        items: items.map((x) => ({
          order: x.order,
          id: x.id,
          cid: x.cid,
          name_en: x.name_en,
        })),
      },
      null,
      2,
    ),
  );
  // ⚠️ 수정금지(승인필요) 2026-10-23 사장님 결정 = 일꾼 4명 = 전체 행을 정확히 4등분(shareRanges) 동시에 · 판단 순서 검문(procedure-check)을 통과 못 한 행은 결과로 받지 않고 그 행만 이유와 함께 한 번 되돌린다 · 못 한 행(인증·중단)은 인증이 풀린 뒤 다 할 때까지(최대 3번) 다시 맡긴다 · 두 번째도 어기면 단계 실패 (정본 §2026-10-23)
  const jobs = shareRanges(items.length);
  console.log(
    `═══ 최종 점검 city ${cityId} = PSR ${items.length}행 → 에이전트 ${jobs.length}명(${AGENT_WORKERS}명 고정 균등, 동시) → ${path.relative(ROOT, dir)} ═══`,
  );
  const logs = rawDirOf(cityId);
  const run = async (
    list: { k: number; from: number; to: number }[],
    retryFile?: string,
  ) =>
    runAgents({
      label: "check",
      instruction: INSTRUCTION,
      ranges: list,
      promptOf: (j) =>
        [
          `- 명단 파일 = ${inputFile}`,
          retryFile
            ? `- 네 몫 = ${retryFile} 의 "${j.k}" 목록(order 값). 이 행들은 아래 이유로 받지 않았다 = 이유를 읽고 지시문 순서대로 다시 한다(도시 번호 ${cityId}, 조 번호 ${j.k})`
            : `- 네게 배정된 순서 = 명단 항목의 order 값이 ${j.from}부터 ${j.to}까지(끝 번호 포함, 도시 번호 ${cityId}, 조 번호 ${j.k})`,
          `- 로그 폴더 = ${logs} (구글 페이지 읽기 *_gmaps-page-read-N.json · 제미니 *_gemini-*.json)`,
          `- 사장님 결정값 = ${reportDir(cityId)} 의 *_boss-fix.json (그 행·칸은 고치지 않는다)`,
          `- 결과 폴더 = ${dir}`,
        ].join("\n"),
      doneOf: (j) => fs.existsSync(path.join(dir, `verdict-${j.k}.json`)),
      dir,
      readDb: true,
    });
  // --resume=<이 판 결과 폴더> = 일꾼 첫 몫은 다시 돌리지 않고 검문·되돌림부터(유료 0)
  if (!argv["resume"]) await run(jobs);
  const byCid = new Map(items.map((x) => [String(x.cid), x]));
  // ⚠️ 수정금지(승인필요) 2026-10-23 사장님 결정 = 검문 = 어긴 행은 판정 파일에서 빼고 rejected-{k}.json 에 이유와 남긴다 · 결과가 없는 행은 못 한 행으로 따로 담는다 (정본 §2026-10-23)
  const audit = (): AuditResult => {
    const bad = new Map<number, string[]>();
    const missing = new Set<number>();
    const seen = new Set<string>();
    for (const f of fs
      .readdirSync(dir)
      .filter((x) => /^verdict-\d+\.json$/.test(x))) {
      let arr: any[] = [];
      try {
        arr = JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8"));
      } catch {
        continue;
      }
      const keep: any[] = [];
      const out: any[] = [];
      for (const v of Array.isArray(arr) ? arr : []) {
        const it = byCid.get(String(v?.cid ?? ""));
        seen.add(String(v?.cid ?? ""));
        if (!it) {
          keep.push(v);
          continue;
        }
        const why = checkCheckRow(v);
        if (why.length) {
          bad.set(it.order, why);
          out.push({ ...v, 받지않은이유: why });
        } else keep.push(v);
      }
      if (out.length) {
        fs.writeFileSync(path.join(dir, f), JSON.stringify(keep, null, 2));
        fs.writeFileSync(
          path.join(dir, f.replace("verdict-", "rejected-")),
          JSON.stringify(out, null, 2),
        );
      }
    }
    for (const it of items)
      if (!seen.has(String(it.cid))) missing.add(it.order);
    return { bad, missing };
  };
  const rejected = await auditWithRetry({
    audit,
    retry: run,
    dir,
    nextK: jobs.length + 1,
  });
  const v = validateRefine(
    items.map((x) => ({ order: x.order, cid: x.cid, name: x.name_en })),
    dir,
    ["db", "google-log", "gemini-log", "page"],
  );
  for (const [o, why] of rejected)
    v.errs.push(
      `order ${o} ${items[o]?.name_en}: 끝내 못 받은 행 = ${why.join(" · ")}`,
    );
  const bad = items.filter((x) => v.decided.get(x.cid)?.keep === false);
  // ⚠️ 수정금지(승인필요) 2026-10-24 사장님 결정 = 짝 맞음 = 일꾼 판정을 받아 맞다고 본 행만 · 끝내 못 받은 행(판정 빠짐)은 짝 맞음이 아니다(92번 사고 = 판정 0 인데 "짝 맞음 192" 거짓 숫자) (정본 §2026-10-24)
  const unjudged = rejected.size;
  const matched = items.length - bad.length - unjudged;
  console.log(
    `═══ 최종 점검 점검표 = ${items.length}행 · 짝 맞음 ${matched} · 짝 안 맞음 ${bad.length} · 판정 빠짐 ${unjudged} · 직접 연 판정 ${v.pages} · 검사 오류 ${v.errs.length}건 ═══`,
  );
  for (const e of v.errs.slice(0, 20)) console.log(`  ✘ ${e}`);
  for (const x of bad)
    console.log(
      `  #${x.id} ${x.name_en} [${x.seed_category}] ${x.price_eur == null ? "가격 없음" : `${x.price_eur}€`} | ${v.decided.get(x.cid).source} | ${String(v.decided.get(x.cid).reason).slice(0, 110)}`,
    );
  fs.writeFileSync(
    path.join(dir, "final-table.json"),
    JSON.stringify(
      {
        cityId,
        total: items.length,
        matched,
        unjudged,
        errs: v.errs,
        mismatch: bad.map((x) => ({
          id: x.id,
          name: x.name_en,
          cat: x.seed_category,
          price: x.price_eur,
          ...v.decided.get(x.cid),
        })),
      },
      null,
      2,
    ),
  );
  console.log(`점검표 = ${path.join(dir, "final-table.json")}`);
  if (argv["apply"] !== "true") {
    console.log("DRY = --apply 로 통과한 판정·새 식당을 창고에 넣는다");
    process.exit(v.errs.length ? 1 : 0);
  }
  // 통과한 판정은 그 자리에서 넣는다 = 고침·삭제(fix / delete) → llm-review --apply · 새 식당 후보 → discovery-lists-insert --report → 일꾼이 적은 한글 이름·요약·묘사·가격을 그 행에 넣기
  const db = await connectDb();
  const city = (
    await db.query(
      "SELECT latitude::float8 AS lat, longitude::float8 AS lng FROM cities WHERE id=$1",
      [cityId],
    )
  ).rows[0];
  const fixes: any[] = [];
  const picks: any[] = [];
  const texts = new Map<string, any>();
  const seenCid = new Set<string>();
  const readArr = (f: string): any[] => {
    try {
      const a = JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8"));
      return Array.isArray(a) ? a : [];
    } catch (e: any) {
      console.log(`  ✘ ${f} 읽기 실패 = 건너뜀(${e?.message || e})`);
      return [];
    }
  };
  // ⚠️ 수정금지(승인필요) 2026-10-24 사장님 결정 = 최종 점검 = 짝 판정만 받는다 · 이미 가격이 있는 행의 가격 고침은 받지 않는다(제미니 값 = 정답 · 58번 = 일꾼이 짝 맞는 행의 가격 23개를 페이지 높은 값으로 바꿈) (정본 §2026-10-24)
  const noPriceChange = (it: any, fix: any) => {
    if (fix?.price_eur == null || it.price_eur == null) return fix;
    console.log(
      `  ✘ #${it.id} ${it.name_en} 가격 ${it.price_eur}→${fix.price_eur} = 있는 가격은 바꾸지 않는다(안 받음)`,
    );
    const rest = { ...fix };
    delete rest.price_eur;
    return rest;
  };
  for (const f of fs.readdirSync(dir)) {
    if (/^verdict-\d+\.json$/.test(f))
      for (const x of readArr(f))
        if (x?.keep === false && byCid.has(String(x.cid))) {
          const it = byCid.get(String(x.cid));
          const fix = x.delete === true ? null : noPriceChange(it, x.fix);
          if (x.delete === true) fixes.push({ id: it.id, reason: x.reason });
          else if (Object.keys(fix ?? {}).length)
            fixes.push({ id: it.id, fix, reason: x.reason });
        }
    if (/^new-rows-\d+\.json$/.test(f))
      for (const n of readArr(f))
        if (
          /^\d+$/.test(String(n?.cid ?? "")) &&
          !seenCid.has(String(n.cid)) &&
          !byCid.has(String(n.cid)) &&
          String(n["영업상태"] ?? "OPERATIONAL") === "OPERATIONAL"
        ) {
          seenCid.add(String(n.cid));
          picks.push({
            cat: "restaurant",
            name: n["이름"],
            cid: String(n.cid),
            lat: n["위도"],
            lng: n["경도"],
            rv: n["후기수"],
            km: city
              ? Math.round(
                  distanceKmFromCoords(
                    Number(n["위도"]),
                    Number(n["경도"]),
                    city.lat,
                    city.lng,
                  ) * 10,
                ) / 10
              : 0,
            photospotTag: false,
          });
          texts.set(String(n.cid), {
            name_ko: n["한글이름"] ?? null,
            summary_ko: n["요약"] ?? null,
            editorial_summary: n["묘사"] ?? null,
            price_eur:
              typeof n["가격_유로"] === "number" ? n["가격_유로"] : null,
          });
        }
  }
  if (fixes.length) {
    const file = path.join(dir, "final-fix-worker.json");
    fs.writeFileSync(file, JSON.stringify(fixes, null, 2));
    const code = await runTsx(path.join(ROOT, "fillcity/steps/llm-review.ts"), [
      `--city-id=${cityId}`,
      `--apply=${file}`,
    ]);
    console.log(`통과 판정 넣기 = ${fixes.length}행 (종료 ${code})`);
    // CID 를 바꾼 행 = 새 장소 페이지를 다시 읽어 9요소를 맞춘다(페이지 읽기 1벌)
    const moved = fixes.filter((x) => x.fix?.google_maps_uri).map((x) => x.id);
    if (moved.length) {
      const c3 = await runTsx(
        path.join(ROOT, "worker/lib/services/fill/gmaps-pid-identity.ts"),
        [`--city-id=${cityId}`, `--ids=${moved.join(",")}`, "--apply"],
      );
      console.log(
        `CID 바꾼 행 페이지 다시 읽기 = ${moved.length}행 (종료 ${c3})`,
      );
    }
  }
  if (picks.length) {
    const file = path.join(dir, "new-rows-select.json");
    fs.writeFileSync(
      file,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          source: "최종 점검 일꾼 새 식당 후보",
          picks,
        },
        null,
        2,
      ),
    );
    const code = await runTsx(
      path.join(ROOT, "fillcity/steps/discovery-lists-insert.ts"),
      [`--city-id=${cityId}`, "--apply=true", `--report=${file}`],
    );
    console.log(`새 식당 넣기 = ${picks.length}곳 (종료 ${code})`);
    const rows = (
      await db.query(
        `SELECT id, substring(google_maps_uri from 'cid=([0-9]+)') AS cid, price_eur FROM place_seed_raw WHERE city_id=$1 AND merged_into IS NULL AND substring(google_maps_uri from 'cid=([0-9]+)') = ANY($2::text[])`,
        [cityId, picks.map((p) => p.cid)],
      )
    ).rows;
    const textFixes = rows
      .map((r: any) => {
        const t = texts.get(String(r.cid)) ?? {};
        const fix: any = {};
        for (const k of ["name_ko", "summary_ko", "editorial_summary"])
          if (typeof t[k] === "string" && t[k].trim()) fix[k] = t[k];
        if (r.price_eur == null && t.price_eur != null)
          fix.price_eur = t.price_eur;
        return Object.keys(fix).length
          ? {
              id: r.id,
              fix,
              reason:
                "최종 점검 일꾼 새 식당 = 한글 이름·요약·묘사·(머리줄 없으면) 가격",
            }
          : null;
      })
      .filter(Boolean);
    if (textFixes.length) {
      const tf = path.join(dir, "new-rows-fix.json");
      fs.writeFileSync(tf, JSON.stringify(textFixes, null, 2));
      const c2 = await runTsx(path.join(ROOT, "fillcity/steps/llm-review.ts"), [
        `--city-id=${cityId}`,
        `--apply=${tf}`,
      ]);
      console.log(`새 식당 글·가격 넣기 = ${textFixes.length}행 (종료 ${c2})`);
    }
  }
  await db.end();
  process.exit(v.errs.length ? 1 : 0);
})().catch((e) => {
  console.error("✗ 최종 점검 실패:", e?.message || e);
  process.exit(1);
});
