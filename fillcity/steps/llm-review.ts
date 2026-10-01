// ⚠️ 수정금지(승인필요) 2026-10-01 사장님 결정 = 에이전트 적용 도구에 멀티태그 입력(fix.tags)과 태그 빼기(fix.remove_tags) = 대표 분류 하나에 할 수 있는 다른 일을 담고 틀린 옛 태그를 걷어낸다 (정본 §)
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { fileStamp } from "../../shared/r2-paths";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
process.chdir(ROOT);
for (const line of fs
  .readFileSync(".env", "utf-8")
  .replace(/^﻿/, "")
  .split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]])
    process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const argv = Object.fromEntries(
  process.argv
    .slice(2)
    .map((a) => a.replace(/^--/, "").split("="))
    .map(([k, ...v]) => [k, v.length ? v.join("=") : "true"]),
);
const cityId = Number(argv["city-id"] || 0);

// 판정 기준 = 선임이 손으로 하던 것을 글로 고정. 에이전트는 이 기준으로만 "삭제" 를 고른다. 의심만 되는 행은 남긴다(삭제는 되돌릴 수 없다).
export const CRITERIA = `창고(place_seed_raw) 행 검토 = 아래 중 하나에 확실히 해당하면 삭제, 아니면 보존.
1. 장소가 아닌 것 = 요리·음식 이름(예 "Bibimbap", "Street food of Indonesia"), 위키 항목 제목, 나라·지역·도시 이름, 사람 이름, 추상 개념(예 "Nightlife", "Cuisine of ...").
2. 엉터리 이름 = 두 가게 이름이 붙은 것, 주소가 이름 칸에 든 것, 언어가 섞여 뜻이 안 되는 것, "Results"·"Untitled" 같은 자리표.
3. 여행 손님상에 오를 수 없는 곳 = 주유소·관공서·병원·학교·부동산·가구점·사무실·주차장·주거 건물.
4. 그 도시가 아닌 곳이 분명한 것(이름·주소에 다른 나라·다른 도시가 박혀 있고 좌표도 없음).
5. 식당으로 분류됐는데 실제로는 음식 종류·요리법·체인 브랜드 일반명(특정 지점이 아님)인 것.
보류는 없다 = 고치거나 지운다(2026-09-30 사장님). 이름 칸만 엉터리이고 현지 이름·주소·리뷰로 진짜 장소가 확인되면 지우지 말고 이름을 고친다.
보존 = 위에 확실히 안 걸리면 보존(다음 단계 = 구글맵 페이지가 검증한다). 시장·거리·광장·전망대·다리·동네는 장소다. 분류가 틀린 것은 삭제 사유가 아니다(분류 정렬이 고친다). 리뷰 1,000 이상·베스트 행은 지우지 않는다.
답 형식 = JSON 배열만: 삭제 = {"id": <번호>, "reason": "<위 1~5 중 번호 + 한 줄>"} · 이름 고침 = {"id": <번호>, "fix": {"name_en": "<맞는 영어 이름>"}, "reason": "<한 줄>"}. 할 것이 없으면 [].`;

(async () => {
  if (!cityId) {
    console.error(
      "Usage: --city-id=<N> --export | --apply=<판정 JSON 파일> | --criteria",
    );
    process.exit(1);
  }
  if (argv["criteria"] === "true") {
    console.log(CRITERIA);
    process.exit(0);
  }
  const pg = await import("pg");
  const c = new (pg as any).default.Client({
    connectionString: process.env.SUPA_URL || process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const city = (
    await c.query("SELECT name_en, country FROM cities WHERE id=$1", [cityId])
  ).rows[0];
  const dir = path.join(ROOT, "docs", "b1-reports", String(cityId));
  fs.mkdirSync(dir, { recursive: true });

  if (argv["export"] === "true") {
    const rows = (
      await c.query(
        `SELECT id, name_en, name_local, name_ko, seed_category, category_tags, google_primary_type, address,
                latitude::float8 AS lat, longitude::float8 AS lng, google_review_count AS rc, price_eur, status,
                summary_ko, editorial_summary, image_url, best_rank IS NOT NULL AS best
           FROM place_seed_raw
          WHERE city_id=$1 AND status <> 'merged' AND seed_category NOT LIKE 'bts_%'
          ORDER BY seed_category, id`,
        [cityId],
      )
    ).rows;
    const file = path.join(dir, `${fileStamp()}_llm-review-input.json`);
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
    await c.end();
    process.exit(0);
  }

  if (argv["apply"] && argv["apply"] !== "true") {
    const verdicts: {
      id: number;
      reason: string;
      fix?: {
        name_en?: string;
        seed_category?: string;
        tags?: string[];
        remove_tags?: string[];
      };
    }[] = JSON.parse(fs.readFileSync(String(argv["apply"]), "utf-8"));
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
      // 고침 = 지우지 않고 upsertPlace 1벌로 영어 이름·분류만(보류 없음 = 2026-09-30 사장님)
      if (
        v.fix?.name_en ||
        v.fix?.seed_category ||
        v.fix?.tags?.length ||
        v.fix?.remove_tags?.length
      ) {
        const cat = (
          await c.query(
            "SELECT seed_category FROM place_seed_raw WHERE id=$1",
            [Number(v.id)],
          )
        ).rows[0]?.seed_category;
        const r = await upsertPlace({
          targetRowId: Number(v.id),
          cityId,
          seedCategory: v.fix.seed_category ?? cat,
          nameEn: v.fix.name_en ?? mine.get(Number(v.id)),
          overwriteSeedCategory: !!v.fix.seed_category,
          categoryTags: [v.fix.seed_category ?? cat, ...(v.fix.tags ?? [])],
          removeCategoryTags: v.fix.remove_tags,
          phaseTags: ["llm-fix"],
        });
        done.push({
          id: v.id,
          fixed: v.fix,
          reason: v.reason,
          result: r.action,
        });
        console.log(
          `  ✎ #${v.id} ${mine.get(Number(v.id))} → ${JSON.stringify(v.fix)} (${r.action}) = ${v.reason}`,
        );
        continue;
      }
      await deletePlaceRow(Number(v.id));
      done.push({ id: v.id, name: mine.get(Number(v.id)), reason: v.reason });
      console.log(`  🗑 #${v.id} ${mine.get(Number(v.id))} 삭제 = ${v.reason}`);
    }
    const file = path.join(dir, `${fileStamp()}_llm-review-deleted.json`);
    fs.writeFileSync(file, JSON.stringify({ cityId, deleted: done }, null, 2));
    console.log(
      `═══ LLM 삭제 끝 = ${done.length}행 · 기록 ${path.relative(ROOT, file)} ═══`,
    );
    await c.end();
    const { pool } = await import("../../worker/lib/db");
    await pool?.end();
    process.exit(0);
  }
  console.error("--export 또는 --apply=<파일> 을 주세요");
  await c.end();
  process.exit(1);
})().catch((e) => {
  console.error("✗ LLM 검토 도구 실패:", e?.message || e);
  process.exit(1);
});
