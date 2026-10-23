// ⚠️ 수정금지(승인필요) 2026-10-06 사장님 결정 = ① LLM 검토 = 명단만 보고 쓰레기를 거른다 · --judge = 일꾼 4명이 기준대로 판정 → 합친 판정 파일 → --write=true 면 바로 적용(행 0 이면 건너뜀 = 신도시) · 이름만 엉터리이고 PID 가 있는 행은 지우지 않는다(PID 짝 맞추기가 살린다) (정본 §)
import fs from "fs";
import path from "path";
import { fileStamp } from "../../shared/r2-paths";
import {
  AGENT_WORKERS,
  ROOT,
  connectDb,
  loadEnv,
  parseArgs,
  reportDir,
  runAgents,
  shareRanges,
} from "./common";
import { checkFixItem, chromeVisits, waitHistory } from "./procedure-check";

loadEnv();
const argv = parseArgs();
const cityId = Number(argv["city-id"] || 0);
const INSTRUCTION = path.join(
  ROOT,
  "fillcity/prompts/08-llm-review/instruction.txt",
);

export const CRITERIA = `창고(place_seed_raw) 행 검토 = 아래 중 하나에 확실히 해당하면 삭제, 아니면 보존.
1. 장소가 아닌 것 = 요리·음식 이름(예 "Bibimbap", "Street food of Indonesia"), 위키 항목 제목, 나라·지역·도시 이름, 사람 이름, 추상 개념(예 "Nightlife", "Cuisine of ...").
2. 엉터리 이름 = 두 가게 이름이 붙은 것, 주소가 이름 칸에 든 것, 언어가 섞여 뜻이 안 되는 것, "Results"·"Untitled"·우편번호 같은 자리표.
3. 여행 손님상에 오를 수 없는 곳 = 주유소·관공서·병원·학교·부동산·가구점·사무실·주차장·주거 건물.
4. 그 도시가 아닌 곳이 분명한 것(이름·주소에 다른 나라·다른 도시가 박혀 있고 좌표도 없음).
5. 식당으로 분류됐는데 실제로는 음식 종류·요리법·체인 브랜드 일반명(특정 지점이 아님)인 것.
6. 가격이 명백히 틀린 행(입장료·한 끼가 1,000€ 를 넘거나 그 도시 물가에 맞지 않는 값, 예 85,000) = 삭제가 아니라 가격 비움 = {"id": <번호>, "fix": {"clear_price": true}, "reason": "<한 줄>"} (2026-10-06 사장님 = 모르는 가격은 NULL, 0 은 확인된 무료만).
보류는 없다 = 고치거나 지운다(2026-09-30 사장님). 이름 칸만 엉터리이고 현지 이름·주소·후기로 진짜 장소가 확인되면 지우지 말고 이름을 고친다. 이름은 엉터리인데 PID(구글 연결)·주소·후기가 있는 행은 지우지 않는다 = 다음 단계가 PID 로 페이지를 열어 이름을 바로잡는다(2026-10-06 사장님). 반대로 PID 만 있고 주소·후기·좌표가 전부 없는 행은 그 PID 도 믿을 수 없다 = 이름이 1~5 에 걸리면 삭제.
보존 = 위에 확실히 안 걸리면 보존(다음 단계 = 구글맵 페이지가 검증한다). 시장·거리·광장·전망대·다리·동네는 장소다. 분류가 틀린 것은 삭제 사유가 아니다(분류 정렬이 고친다). 베스트 행은 지우지 않는다. 같은 장소가 두 행이면 자료가 빈 쪽을 지운다.
답 형식 = JSON 배열만: 삭제 = {"id": <번호>, "reason": "<위 1~5 중 번호 + 한 줄>"} · 이름 고침 = {"id": <번호>, "fix": {"name_en": "<맞는 영어 이름>"}, "reason": "<한 줄>"} · 분류 고침 = {"id": <번호>, "fix": {"seed_category": "<분류>"}, "reason": "<한 줄>"}. 할 것이 없으면 [].`;

type Verdict = {
  id: number;
  reason: string;
  fix?: {
    name_en?: string;
    seed_category?: string;
    tags?: string[];
    remove_tags?: string[];
    clear_price?: boolean;
    // ⚠️ 수정금지(승인필요) 2026-10-07 사장님 결정 = 최종 점검에 걸린 행은 외부 호출 없이 클로드·사장님이 페이지 사실로 직접 써서 같은 판정 파일(--apply)로 넣는다 = 가격·대사·카피·원어이름·한글이름·주소 (정본 §)
    price_eur?: number;
    summary_ko?: string;
    editorial_summary?: string;
    name_local?: string;
    name_ko?: string;
    address?: string;
    business_status?:
      | "OPERATIONAL"
      | "CLOSED_TEMPORARILY"
      | "CLOSED_PERMANENTLY";
    google_maps_uri?: string; // 잘못 짝지어진 CID 를 페이지 사실의 CID 로(검문 통과 = 같은 CID 행이 있으면 흡수)
  };
};

async function exportList(c: any): Promise<{ file: string; rows: any[] }> {
  const city = (
    await c.query("SELECT name_en, country FROM cities WHERE id=$1", [cityId])
  ).rows[0];
  const rows = (
    await c.query(
      `SELECT id, name_en, name_local, name_ko, seed_category, category_tags, google_primary_type, address,
              latitude::float8 AS lat, longitude::float8 AS lng, google_review_count AS rc, price_eur, status,
              (google_place_id IS NOT NULL OR google_maps_uri LIKE '%cid=%') AS pid,
              summary_ko, editorial_summary, image_url, best_rank IS NOT NULL AS best
         FROM place_seed_raw
        WHERE city_id=$1 AND status <> 'merged' AND seed_category NOT LIKE 'bts_%'
        ORDER BY seed_category, id`,
      [cityId],
    )
  ).rows.map((r: any, order: number) => ({ order, ...r }));
  const file = path.join(
    reportDir(cityId),
    `${fileStamp()}_llm-review-input.json`,
  );
  fs.writeFileSync(
    file,
    JSON.stringify(
      {
        cityId,
        city: city?.name_en,
        country: city?.country,
        criteria: CRITERIA,
        rows,
      },
      null,
      2,
    ),
  );
  console.log(
    `═══ LLM 검토 명단 city ${cityId} ${city?.name_en} = ${rows.length}행 → ${path.relative(ROOT, file)} ═══`,
  );
  return { file, rows };
}

async function applyFile(c: any, file: string): Promise<number> {
  const verdicts: Verdict[] = JSON.parse(fs.readFileSync(file, "utf-8"));
  // ⚠️ 수정금지(승인필요) 2026-10-23 사장님 결정 = ⑦ 최종 검수 판정(final-fix-claude.json)은 항목마다 근거 칸(제미니 원본·로그·구글 검색·구글맵)이 있고 크롬 방문 기록과 맞아야 넣는다 · 하나라도 어기면 파일 전체를 넣지 않는다 (정본 §)
  if (/final-fix-claude\.json$/.test(file)) {
    await waitHistory();
    const visits = chromeVisits(Date.now() - 48 * 3600e3, Date.now());
    const rawDir = path.join(ROOT, "docs", "raw", String(cityId));
    const bad = verdicts
      .map((v) => ({ id: v.id, why: checkFixItem(v, rawDir, visits) }))
      .filter((x) => x.why.length);
    if (bad.length) {
      for (const b of bad) console.log(`  ✘ #${b.id} = ${b.why.join(" · ")}`);
      throw new Error(
        `판단 순서 검문 불통과 ${bad.length}건 = 이 파일은 넣지 않는다`,
      );
    }
  }
  const ids = verdicts.map((v) => Number(v.id)).filter(Boolean);
  const mine = new Map<number, string>(
    (
      await c.query(
        "SELECT id, name_en FROM place_seed_raw WHERE city_id=$1 AND id = ANY($2::int[]) AND seed_category NOT LIKE 'bts_%'",
        [cityId, ids],
      )
    ).rows.map((r: any) => [r.id, r.name_en]),
  );
  const { deletePlaceRow, upsertPlace } = await import(
    "../../worker/lib/services/place-upsert"
  );
  const done: any[] = [];
  for (const v of verdicts) {
    if (!mine.has(Number(v.id))) {
      console.log(`  ⏭ #${v.id} 이 도시 행 아님/이미 없음`);
      continue;
    }
    if (
      v.fix &&
      Object.values(v.fix).some((x) =>
        Array.isArray(x) ? x.length > 0 : x != null && x !== false,
      )
    ) {
      const cat = (
        await c.query("SELECT seed_category FROM place_seed_raw WHERE id=$1", [
          Number(v.id),
        ])
      ).rows[0]?.seed_category;
      // ⚠️ 수정금지(승인필요) 2026-10-07 사장님 결정 = CID 를 바꿔 쌍둥이에 흡수될 때 진 행(작은 등록)의 이름이 원행 이름을 덮지 않는다 = 그 CID 를 이미 가진 행이 있으면 그 행의 이름을 넘긴다(마르세유·니스·스트라스부르에서 손으로 복원하던 것) (정본 §)
      const cid = String(v.fix.google_maps_uri || "").match(/cid=(\d+)/)?.[1];
      const twin =
        cid && !v.fix.name_en
          ? (
              await c.query(
                `SELECT id, name_en FROM place_seed_raw WHERE city_id=$1 AND id<>$2 AND merged_into IS NULL AND google_maps_uri ~ ('cid=' || $3 || '(\\D|$)')`,
                [cityId, Number(v.id), cid],
              )
            ).rows[0]
          : null;
      const r = await upsertPlace({
        targetRowId: Number(v.id),
        cityId,
        seedCategory: v.fix.seed_category ?? cat,
        nameEn: v.fix.name_en ?? twin?.name_en ?? mine.get(Number(v.id)),
        overwriteSeedCategory: !!v.fix.seed_category,
        categoryTags: [v.fix.seed_category ?? cat, ...(v.fix.tags ?? [])],
        removeCategoryTags: v.fix.remove_tags,
        priceEur: v.fix.price_eur ?? null,
        clearPriceEur: !!v.fix.clear_price,
        selectionReasonKo: v.fix.summary_ko ?? null,
        shortformKo: v.fix.editorial_summary ?? null,
        businessStatus: v.fix.business_status ?? null,
        nameLocal: v.fix.name_local ?? null,
        nameKo: v.fix.name_ko ?? null,
        address: v.fix.address ?? null,
        ...(v.fix.google_maps_uri
          ? {
              googleMapsUri: v.fix.google_maps_uri,
              followTriggerDup: true,
              dupCheckOnWrite: true,
            }
          : {}),
        phaseTags: ["llm-fix"],
      });
      const kept = r.rowId && r.rowId !== Number(v.id) ? r.rowId : null;
      done.push({
        id: v.id,
        fixed: v.fix,
        reason: v.reason,
        result: r.action,
        ...(kept ? { absorbedInto: kept } : {}),
      });
      console.log(
        `  ✎ #${v.id} ${mine.get(Number(v.id))} → ${JSON.stringify(v.fix)} (${r.action}${kept ? `, 🧲 흡수 → #${kept} = 재읽기는 이 번호로` : ""}) = ${v.reason}`,
      );
      continue;
    }
    await deletePlaceRow(Number(v.id));
    done.push({ id: v.id, name: mine.get(Number(v.id)), reason: v.reason });
    console.log(`  🗑 #${v.id} ${mine.get(Number(v.id))} 삭제 = ${v.reason}`);
  }
  const out = path.join(
    reportDir(cityId),
    `${fileStamp()}_llm-review-deleted.json`,
  );
  fs.writeFileSync(out, JSON.stringify({ cityId, deleted: done }, null, 2));
  console.log(
    `═══ LLM 삭제·고침 끝 = ${done.length}행 · 기록 ${path.relative(ROOT, out)} ═══`,
  );
  return done.length;
}

async function judge(c: any): Promise<string | null> {
  const { file, rows } = await exportList(c);
  if (!rows.length) {
    console.log("행 0 = 검토할 것 없음(신도시) = 건너뜀");
    return null;
  }
  const dir = path.join(reportDir(cityId), `llm-review-${fileStamp()}`);
  fs.mkdirSync(dir, { recursive: true });
  const ranges = shareRanges(rows.length);
  console.log(
    `═══ LLM 검토 판정 = ${rows.length}행 → 일꾼 ${ranges.length}명(${AGENT_WORKERS}명 균등, 동시, 브라우저 없음) → ${path.relative(ROOT, dir)} ═══`,
  );
  await runAgents({
    label: "review",
    instruction: INSTRUCTION,
    ranges,
    promptOf: (j) =>
      [
        `- 명단 파일 = ${file}`,
        `- 네게 배정된 순서 = 명단 항목의 order 값이 ${j.from}부터 ${j.to}까지(끝 번호 포함, 도시 번호 ${cityId}, 조 번호 ${j.k})`,
        `- 결과 폴더 = ${dir}`,
      ].join("\n"),
    doneOf: (j) => fs.existsSync(path.join(dir, `verdict-${j.k}.json`)),
    dir,
  });
  const byId = new Map<number, any>(rows.map((r: any) => [r.id, r]));
  const merged: Verdict[] = [];
  let found = 0;
  for (const j of ranges) {
    const f = path.join(dir, `verdict-${j.k}.json`);
    if (!fs.existsSync(f)) continue;
    found++;
    try {
      const arr: Verdict[] = JSON.parse(fs.readFileSync(f, "utf-8"));
      for (const v of Array.isArray(arr) ? arr : []) {
        const r = byId.get(Number(v.id));
        if (!r || r.order < j.from || r.order > j.to) continue;
        // ⚠️ 수정금지(승인필요) 2026-10-07 사장님 결정 = 베스트 행·PID 있는 행은 삭제만 막고 고침(가격 비움·분류·이름)은 받는다 (정본 §)
        if (r.best && !v.fix) continue;
        if (r.pid && !v.fix && (r.address || (r.rc ?? 0) > 0)) continue;
        merged.push({
          id: Number(v.id),
          reason: String(v.reason || ""),
          ...(v.fix ? { fix: v.fix } : {}),
        });
      }
    } catch (e: any) {
      console.log(`  ✘ verdict-${j.k}.json 읽기 실패: ${e?.message || e}`);
    }
  }
  // ⚠️ 수정금지(승인필요) 2026-10-07 사장님 결정 = 일꾼 판정 파일이 하나도 없으면 단계 실패(검토 없이 "보존"으로 넘어가지 않는다) (정본 §)
  if (!found)
    throw new Error(
      `일꾼 ${ranges.length}명 판정 파일 0개 = 검토가 안 됐다(${path.relative(ROOT, dir)})`,
    );
  const out = path.join(dir, "verdict-merged.json");
  fs.writeFileSync(out, JSON.stringify(merged, null, 2));
  const del = merged.filter((v) => !v.fix).length;
  console.log(
    `═══ 판정 합침 = 삭제 ${del} · 고침 ${merged.length - del} · 보존 ${rows.length - merged.length} → ${path.relative(ROOT, out)} ═══`,
  );
  for (const v of merged) {
    const r = byId.get(v.id);
    console.log(
      `  ${v.fix ? "✎" : "🗑"} #${v.id} ${r.name_en}${v.fix ? " → " + JSON.stringify(v.fix) : ""} = ${v.reason}`,
    );
  }
  return out;
}

(async () => {
  if (!cityId) {
    console.error(
      "Usage: --city-id=<N> --export | --judge [--write=true] | --apply=<판정 JSON 파일> | --criteria",
    );
    process.exit(1);
  }
  if (argv["criteria"] === "true") {
    console.log(CRITERIA);
    process.exit(0);
  }
  const c = await connectDb();
  const finish = async (code: number) => {
    await c.end();
    const { pool } = await import("../../worker/lib/db");
    await pool?.end?.();
    process.exit(code);
  };
  if (argv["export"] === "true") {
    await exportList(c);
    await finish(0);
  }
  if (argv["judge"] === "true") {
    const out = await judge(c);
    if (out && argv["write"] === "true") await applyFile(c, out);
    else if (out) console.log("DRY = --write=true 로 합친 판정을 적용한다");
    await finish(0);
  }
  if (argv["apply"] && argv["apply"] !== "true") {
    await applyFile(c, String(argv["apply"]));
    await finish(0);
  }
  console.error("--export 또는 --judge 또는 --apply=<파일> 을 주세요");
  await finish(1);
})().catch((e) => {
  console.error("✗ LLM 검토 도구 실패:", e?.message || e);
  process.exit(1);
});
