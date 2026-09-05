// ⚠️ 수정금지(승인필요) 2026-09-05 사장님 확정 = 창고 상태 백필 + 쌍둥이 병합(keep 흡수·태그/언어코드 합집합·번역행 복사·포인터 이동). DELETE 는 **같은 PID 로 확정된 loser 만**(deletableLosers) = PID 없는 짝은 흡수만 하고 행 보존. 폐업(CLOSED_*)은 컬럼값 우선, 태그만 있으면 CLOSED_PERMANENTLY 기록.
import * as fs from "node:fs";
import * as path from "node:path";
// ⚠️ 수정금지(승인필요) 2026-08-28 사장님 승인 = best_rank 쓰기 트랜잭션(SELECT FOR UPDATE→합집합→조건부 UPDATE) 1벌
import { bestRankUnion, writeBestRankUnion } from "../shared/best-rank";
// ⚠️ 수정금지(승인필요) 2026-08-28 사장님 승인 = 흡수 후보 컬럼 목록 1벌(§16 SSOT) = fillcity/dups-detail.ts 와 공용.
import { FILL_COLS } from "../shared/place-fill-columns";

const envRaw = fs.existsSync(path.join(process.cwd(), ".env"))
  ? fs.readFileSync(path.join(process.cwd(), ".env"), "utf-8")
  : "";
for (const line of envRaw.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_0-9]+)=(.*)$/);
  if (m && !process.env[m[1]])
    process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, "");
}

const argv: Record<string, string> = {};
for (const a of process.argv.slice(2)) {
  const m = a.match(/^--([a-z-]+)(?:=(.*))?$/);
  if (m) argv[m[1]] = m[2] ?? "true";
}
const cityId = Number(argv["city-id"] || 0);
const apply = argv["apply"] === "true";
const holds = (argv["holds"] || "").split(",").map(Number).filter(Boolean);
const quarantine = (argv["quarantine"] || "")
  .split(",")
  .map(Number)
  .filter(Boolean);
if (!cityId) {
  console.error(
    "Usage: --city-id=<N> [--holds=id,id] [--quarantine=id,id] [--apply]",
  );
  process.exit(1);
}

// ⚠️ 수정금지(승인필요) 2026-08-28 사장님 승인 = ① 흡수 컬럼 목록 = 손입력 재복사 금지, 공용 FILL_COLS(§16 SSOT,
const HANDLED_ELSEWHERE = new Set([
  "latitude",
  "longitude",
  "phase_tags",
  "category_tags",
]);
const DIRECT_COL_TYPE: Record<string, "jsonb" | "real"> = {
  google_rating: "real",
  opening_hours: "jsonb",
  vibe_keywords: "jsonb",
  names_i18n: "jsonb",
  photo_urls: "jsonb",
};
const FIELD_NAME_OVERRIDES: Record<string, string> = {
  editorial_summary: "shortformKo",
  summary_ko: "selectionReasonKo",
};
const toCamel = (s: string) =>
  s.replace(/_([a-z0-9])/g, (_, c) => c.toUpperCase());
const UPSERT_COLS: Record<string, string> = {};
const DIRECT_COLS: Record<string, "jsonb" | "real"> = {};
for (const col of [...FILL_COLS, "business_status"]) {
  if (HANDLED_ELSEWHERE.has(col)) continue;
  if (DIRECT_COL_TYPE[col]) DIRECT_COLS[col] = DIRECT_COL_TYPE[col];
  else UPSERT_COLS[col] = FIELD_NAME_OVERRIDES[col] || toCamel(col);
}
const NUMERIC_COLS = new Set([
  "price_eur",
  "google_review_count",
  "distance_km_from_center",
]);
const ABSORB_TAG = "pid-twin-absorbed";
// ③ closed 판정용 business_status 값(gmaps-pid-identity.ts 가 쓰는 3값 중 폐업·휴업 2개). 2026-08-28 사장님 확정.
const CLOSED_BIZ = new Set(["CLOSED_PERMANENTLY", "CLOSED_TEMPORARILY"]);

function isEmpty(v: any): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === "object") return Object.keys(v).length === 0;
  return false;
}
const validCoord = (v: any) =>
  v != null && Number(v) !== 0 && !Number.isNaN(Number(v));

interface TwinPlan {
  pid: string;
  keep: any;
  losers: any[]; // RC DESC → id DESC(흡수 우선순위)
  absorb: { col: string; from: number; value: any }[]; // upsertPlace 칸
  direct: { col: string; from: number; value: any }[]; // 직접 COALESCE 칸
  coords: { from: number; lat: number; lng: number } | null;
  catTags: string[];
  newCat: string[]; // keep 에 없는 것만(표시용)
  phaseTags: string[];
  newPhase: string[];
  bestRank: number | null; // 그룹 합집합
  translations: { place_id: number; language: string }[]; // keep 미보유 언어만
  guides: number;
  cityRefs: number;
  pointerRefs: number; // 그룹 밖에서 loser 를 가리키는 merged_into
}

async function planTwinGroup(
  pool: any,
  keep: any,
  losers: any[],
): Promise<TwinPlan> {
  const rows = [keep, ...losers];
  const loserIds = losers.map((l) => l.id);
  const absorb: TwinPlan["absorb"] = [];
  const direct: TwinPlan["direct"] = [];
  for (const col of Object.keys(UPSERT_COLS)) {
    if (!isEmpty(keep[col])) continue;
    const src = losers.find((l) => !isEmpty(l[col]));
    if (src) absorb.push({ col, from: src.id, value: src[col] });
  }
  for (const col of Object.keys(DIRECT_COLS)) {
    if (!isEmpty(keep[col])) continue;
    const src = losers.find((l) => !isEmpty(l[col]));
    if (src) direct.push({ col, from: src.id, value: src[col] });
  }
  let coords: TwinPlan["coords"] = null;
  if (!validCoord(keep.latitude) || !validCoord(keep.longitude)) {
    const src = losers.find(
      (l) => validCoord(l.latitude) && validCoord(l.longitude),
    );
    if (src)
      coords = {
        from: src.id,
        lat: Number(src.latitude),
        lng: Number(src.longitude),
      };
  }
  const keepCat: string[] = keep.category_tags || [];
  const keepPhase: string[] = keep.phase_tags || [];
  const catTags = [
    ...new Set(
      rows.flatMap((r) => [...(r.category_tags || []), r.seed_category]),
    ),
  ].filter(Boolean) as string[];
  const phaseTags = [
    ...new Set([...losers.flatMap((l) => l.phase_tags || []), ABSORB_TAG]),
  ] as string[];
  const bestRank = rows.reduce(
    (acc: number | null, r) => bestRankUnion(acc, r.best_rank),
    null,
  );
  const translations = (
    await pool.query(
      `SELECT DISTINCT ON (t.language) t.place_id, t.language FROM place_translations t
        WHERE t.place_id = ANY($1::int[])
          AND NOT EXISTS (SELECT 1 FROM place_translations k WHERE k.place_id = $2 AND k.language = t.language)
        ORDER BY t.language, array_position($1::int[], t.place_id)`,
      [loserIds, keep.id],
    )
  ).rows;
  const guides = (
    await pool.query(
      `SELECT count(*)::int AS n FROM guides WHERE place_id = ANY($1::int[])`,
      [loserIds],
    )
  ).rows[0].n;
  const cityRefs = (
    await pool.query(
      `SELECT count(*)::int AS n FROM cities
        WHERE override_hero_place_id = ANY($1::int[]) OR override_highlight_place_ids && $1::int[]`,
      [loserIds],
    )
  ).rows[0].n;
  const pointerRefs = (
    await pool.query(
      `SELECT count(*)::int AS n FROM place_seed_raw
        WHERE merged_into = ANY($1::int[]) AND id <> ALL($2::int[])`,
      [loserIds, [keep.id, ...loserIds]],
    )
  ).rows[0].n;
  return {
    pid: keep.google_place_id,
    keep,
    losers,
    absorb,
    direct,
    coords,
    catTags,
    newCat: catTags.filter((t) => !keepCat.includes(t)),
    phaseTags,
    newPhase: phaseTags.filter((t) => !keepPhase.includes(t)),
    bestRank,
    translations,
    guides,
    cityRefs,
    pointerRefs,
  };
}

// ⚠️ 수정금지(승인필요) 2026-09-05 사장님 확정 = 삭제해도 되는 loser = **같은 PID 로 확정된 행만** 1벌 판정. PID 없는 짝은 트리거 불변7·8(이름 문자열 = 가변·의심 메모)로 붙은 것이라 다른 장소일 수 있다 = 흡수만 하고 행은 남긴다.
const deletableLosers = (p: TwinPlan): any[] =>
  p.losers.filter((l: any) => l.google_place_id === p.pid);

function printTwinPlan(p: TwinPlan) {
  const rowStr = (r: any) =>
    `#${r.id} "${r.name_local || r.name_en}" [${r.seed_category}/${r.status}${r.merged_into ? "→#" + r.merged_into : ""}] (RC=${r.google_review_count ?? "null"}, img=${r.image_url ? "Y" : "N"}, best=${r.best_rank ?? "null"})`;
  console.log(`PID=${p.pid}`);
  console.log(`  KEEP   ${rowStr(p.keep)}`);
  for (const l of p.losers) console.log(`  LOSER  ${rowStr(l)}`);
  const absorbStr = [
    ...p.absorb.map((a) => `${a.col}←#${a.from}`),
    ...p.direct.map((a) => `${a.col}←#${a.from}(직접)`),
    ...(p.coords ? [`latitude,longitude←#${p.coords.from}`] : []),
  ];
  console.log(
    `  흡수   ${absorbStr.length ? absorbStr.join(", ") : "0(keep 빈칸 없음)"}`,
  );
  console.log(
    `  tags   category ∪ [${p.catTags.join(",")}] (+${p.newCat.length}) | phase +[${p.newPhase.join(",") || "-"}]`,
  );
  console.log(
    `  best   ${[p.keep, ...p.losers].map((r) => r.best_rank ?? "null").join(" ∪ ")} → ${p.bestRank ?? "null"}${p.bestRank === (p.keep.best_rank ?? null) ? " (변경 없음)" : ""}`,
  );
  console.log(
    `  번역행 ${p.translations.length ? p.translations.map((t) => `#${t.place_id}/${t.language}`).join(", ") + " → keep 사본 복사(loser 행 보존)" : "0(복사할 언어 없음)"}`,
  );
  console.log(
    `  포인터 guides ${p.guides}행 · cities 선별입력 ${p.cityRefs}행 · merged_into ${p.pointerRefs}행 → keep`,
  );
}

async function absorbTwinGroup(
  pool: any,
  upsertPlace: (x: any) => Promise<any>,
  p: TwinPlan,
) {
  const keepId = p.keep.id;
  const loserIds = p.losers.map((l) => l.id);
  if (p.absorb.length || p.coords || p.newCat.length || p.newPhase.length) {
    const payload: any = {
      targetRowId: keepId,
      followTriggerDup: true,
      cityId: p.keep.city_id,
      seedCategory: p.keep.seed_category,
      nameEn: p.keep.name_en ?? null,
      categoryTags: p.catTags,
      phaseTags: p.phaseTags,
    };
    for (const a of p.absorb)
      payload[UPSERT_COLS[a.col]] = NUMERIC_COLS.has(a.col)
        ? Number(a.value)
        : a.value;
    if (p.coords) {
      payload.latitude = p.coords.lat;
      payload.longitude = p.coords.lng;
    }
    const r = await upsertPlace(payload);
    if (r.action !== "updated")
      throw new Error(
        `upsertPlace keep #${keepId} 실패: ${r.reason || r.action}`,
      );
  }
  const c = await pool.connect();
  try {
    await c.query("BEGIN");
    await c.query(`SELECT set_config('app.skip_dup_check','on', true)`);
    if (p.direct.length) {
      const sets = p.direct.map((d, i) =>
        DIRECT_COLS[d.col] === "jsonb"
          ? `${d.col} = CASE WHEN ${d.col} IS NULL OR ${d.col}::text IN ('{}','[]','null') THEN $${i + 2}::jsonb ELSE ${d.col} END`
          : `${d.col} = COALESCE(${d.col}, $${i + 2}::real)`,
      );
      const vals = p.direct.map((d) =>
        DIRECT_COLS[d.col] === "jsonb" ? JSON.stringify(d.value) : d.value,
      );
      await c.query(
        `UPDATE place_seed_raw SET ${sets.join(", ")} WHERE id = $1`,
        [keepId, ...vals],
      );
    }
    // ⚠️ 수정금지(승인필요) 2026-08-28 사장님 승인 = ⓑ best_rank = writeBestRankUnion() SSOT 호출(B2 discovery-verify-and-insert.ts
    const { cur, result } = await writeBestRankUnion(c, keepId, p.bestRank);
    await c.query(
      `INSERT INTO place_translations (place_id, language, summary, editorial_summary)
       SELECT DISTINCT ON (language) $1, language, summary, editorial_summary
         FROM place_translations WHERE place_id = ANY($2::int[])
        ORDER BY language, array_position($2::int[], place_id)
       ON CONFLICT (place_id, language) DO NOTHING`,
      [keepId, loserIds],
    );
    await c.query(
      `UPDATE guides SET place_id = $1 WHERE place_id = ANY($2::int[])`,
      [keepId, loserIds],
    );
    await c.query(
      `UPDATE cities SET override_hero_place_id = $1 WHERE override_hero_place_id = ANY($2::int[])`,
      [keepId, loserIds],
    );
    for (const lid of loserIds)
      await c.query(
        `UPDATE cities SET override_highlight_place_ids = array_replace(override_highlight_place_ids, $2, $1)
          WHERE $2 = ANY(override_highlight_place_ids)`,
        [keepId, lid],
      );
    await c.query(
      `UPDATE place_seed_raw SET merged_into = $1 WHERE merged_into = ANY($2::int[]) AND id <> $1`,
      [keepId, loserIds],
    );
    await c.query("COMMIT");
    return { cur, result };
  } catch (e) {
    await c.query("ROLLBACK");
    throw e;
  } finally {
    c.release();
  }
}

async function main() {
  const { pool } = await import("../../db");
  if (!pool) throw new Error("DB 연결 없음");
  const rows = (
    await pool.query(
      `SELECT * FROM place_seed_raw WHERE city_id = $1 ORDER BY id`,
      [cityId],
    )
  ).rows;

  const byPid = new Map<string, any[]>();
  for (const r of rows) {
    if (!r.google_place_id) continue;
    if (!byPid.has(r.google_place_id)) byPid.set(r.google_place_id, []);
    byPid.get(r.google_place_id)!.push(r);
  }
  // ⚠️ 수정금지(승인필요) 2026-09-04 사장님 확정 = 판정은 트리거(의심대상-N), 집행은 이 도구. 여기서 자체 매칭을 재발명하지 않는다(§16).
  //   PID 있는 행이 최종 = PID 없는 짝은 그 그룹에 넣어 흡수 후 삭제한다.
  const byId = new Map<number, any>(rows.map((r: any) => [r.id, r]));
  for (const r of rows) {
    if (r.google_place_id) continue;
    const targets = (r.phase_tags || [])
      .filter((t: string) => t.startsWith("의심대상-"))
      .map((t: string) => Number(t.replace("의심대상-", "")));
    let host = targets
      .map((id: number) => byId.get(id))
      .find((h: any) => h?.google_place_id);
    if (!host)
      host = rows.find(
        (h: any) =>
          h.google_place_id &&
          (h.phase_tags || []).includes(`의심대상-${r.id}`),
      );
    if (host) byPid.get(host.google_place_id)!.push(r);
  }
  const mergedInto = new Map<number, number>();
  const twinPlans: TwinPlan[] = [];
  const keepTags = new Map<number, string[]>(); // keep 의 흡수 후 phase_tags(②③ 판정용)
  for (const grp of byPid.values()) {
    if (grp.length < 2) continue;
    // ⚠️ 수정금지(승인필요) 2026-09-04 사장님 확정 = PID 있는 쪽이 최종 = keep 후보는 PID 보유 행에서만 고른다.
    const cands = grp.filter((g: any) => g.google_place_id);
    const keep = (cands.length ? cands : grp).reduce((a: any, b: any) =>
      (b.google_review_count ?? 0) > (a.google_review_count ?? 0) ||
      ((b.google_review_count ?? 0) === (a.google_review_count ?? 0) &&
        b.id > a.id)
        ? b
        : a,
    );
    const losers = grp
      .filter((g) => g.id !== keep.id)
      .sort(
        (a, b) =>
          (b.google_review_count ?? 0) - (a.google_review_count ?? 0) ||
          b.id - a.id,
      );
    for (const g of losers) mergedInto.set(g.id, keep.id);
    const p = await planTwinGroup(pool, keep, losers);
    twinPlans.push(p);
    keepTags.set(keep.id, [
      ...new Set([...(keep.phase_tags || []), ...p.phaseTags]),
    ]);
  }

  const holdSet = new Set(holds);
  const quarSet = new Set(quarantine);
  const plan: {
    id: number;
    cat: string;
    status: string;
    into?: number;
    biz?: string;
  }[] = [];
  for (const r of rows) {
    const tags: string[] = keepTags.get(r.id) ?? r.phase_tags ?? [];
    let status = "active";
    let into: number | undefined;
    let biz: string | undefined;
    if (mergedInto.has(r.id)) {
      status = "merged";
      into = mergedInto.get(r.id);
    } else if (quarSet.has(r.id) || tags.includes("wrong-city-suspect"))
      status = "quarantined";
    else if (tags.includes("영구폐업") || CLOSED_BIZ.has(r.business_status)) {
      // ⚠️ 수정금지(승인필요) 2026-08-28 사장님 확정 = ③ closed = 영구폐업 태그 ∪ business_status 현재값 CLOSED_*(gmaps-pid-identity 기록).
      status = "closed";
      if (!CLOSED_BIZ.has(r.business_status)) biz = "CLOSED_PERMANENTLY";
    } else if (holdSet.has(r.id)) status = "hold";
    else if (!r.google_place_id) status = "candidate";
    if (status !== r.status || (into ?? null) !== (r.merged_into ?? null))
      plan.push({ id: r.id, cat: r.seed_category, status, into, biz });
  }

  const cats = new Map<
    string,
    { pool: number; after: number; ch: Record<string, number> }
  >();
  const planById = new Map(plan.map((p) => [p.id, p]));
  for (const r of rows) {
    const c = r.seed_category || "?";
    if (!cats.has(c)) cats.set(c, { pool: 0, after: 0, ch: {} });
    const s = cats.get(c)!;
    if (r.google_place_id) s.pool++;
    const p = planById.get(r.id);
    const finalStatus = p ? p.status : r.status || "active";
    if (finalStatus === "active") {
      if (r.google_place_id) s.after++;
    } else s.ch[finalStatus] = (s.ch[finalStatus] || 0) + 1;
  }
  console.log(
    `═══ status-backfill city ${cityId} = ${rows.length}행 | 변경 ${plan.length}행 | PID 그룹 ${twinPlans.length}개 | 삭제예정 ${twinPlans.reduce((n: number, p: TwinPlan) => n + deletableLosers(p).length, 0)}행`,
  );
  for (const [c, s] of [...cats.entries()].sort(
    (a, b) => b[1].pool - a[1].pool,
  ))
    console.log(
      `  ${c.padEnd(12)} 풀 ${String(s.pool).padStart(3)} → 서빙 ${String(s.after).padStart(3)} | ${
        Object.entries(s.ch)
          .map(([k, v]) => `${k} ${v}`)
          .join(", ") || "-"
      }`,
    );
  if (twinPlans.length) {
    console.log(
      `── ① 같은 PID 그룹 ${twinPlans.length}개 = keep 흡수 · 삭제대상(같은 PID) = ${twinPlans.flatMap((p: TwinPlan) => deletableLosers(p).map((l: any) => "#" + l.id)).join(" ") || "없음"} ──`,
    );
    for (const p of twinPlans) printTwinPlan(p);
  }
  if (!apply) {
    console.log("=== DRY (쓰기 0) = --apply 로 실행 ===");
    await pool.end();
    return;
  }
  if (twinPlans.length) {
    const { upsertPlace } = await import("../place-upsert");
    for (const p of twinPlans) {
      const br = await absorbTwinGroup(pool, upsertPlace, p);
      console.log(
        `  ✅ 흡수 keep #${p.keep.id} ← ${p.losers.map((l) => "#" + l.id).join(",")} (best_rank ${br.cur} ∪ ${p.bestRank} → ${br.result})`,
      );
    }
  }
  let n = 0;
  let deleted = 0;
  let tagsCleared = 0;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.skip_dup_check','on', true)`);
    for (const p of plan) {
      await client.query(
        `UPDATE place_seed_raw SET status = $2, merged_into = $3,
                business_status = COALESCE($4, business_status)
          WHERE id = $1`,
        [p.id, p.status, p.into ?? null, p.biz ?? null],
      );
      n++;
    }
    // ⚠️ 수정금지(승인필요) 2026-09-05 사장님 확정 = 삭제 대상 = **이번 실행에서 absorbTwinGroup 을 거친 loser 중 같은 PID 로 확정된 행만**(deletableLosers).
    //   그 함수만 guides·override_hero·override_highlight 포인터를 keep 으로 옮기므로 옛 merged 행을 지우면 사장님이 지정한 도시 얼굴이 끊긴다. PID 없는 짝은 이름 문자열(가변·의심)로 붙은 것이라 다른 장소일 수 있다 = 흡수만.
    const absorbed = new Set(
      twinPlans.flatMap((p: TwinPlan) =>
        deletableLosers(p).map((l: any) => l.id),
      ),
    );
    const losers = plan
      .filter((p: any) => p.status === "merged" && p.into && absorbed.has(p.id))
      .map((p: any) => p.id);
    if (losers.length) {
      await client.query(
        `DELETE FROM place_translations WHERE place_id = ANY($1::int[])`,
        [losers],
      );
      const d = await client.query(
        `DELETE FROM place_seed_raw WHERE id = ANY($1::int[]) RETURNING id`,
        [losers],
      );
      deleted = d.rowCount ?? 0;
    }
    // ⚠️ 수정금지(승인필요) 2026-09-04 사장님 확정 = 처리가 끝난 표시는 뗀다 = 짝이 사라진 의심대상-N·중복의심, 병합 완료 이력(pid-twin-absorbed). 남기면 다음에 또 끌려나온다.
    const cl = await client.query(
      `UPDATE place_seed_raw p
          SET phase_tags = (SELECT ARRAY(SELECT t FROM unnest(COALESCE(p.phase_tags, ARRAY[]::text[])) t
                WHERE t <> 'pid-twin-absorbed'
                  AND NOT (t LIKE '의심대상-%' AND (replace(t,'의심대상-','')::int = p.id
                       OR NOT EXISTS (SELECT 1 FROM place_seed_raw q WHERE q.id = replace(t,'의심대상-','')::int)))
                  AND NOT (t = '중복의심' AND NOT EXISTS (SELECT 1 FROM unnest(COALESCE(p.phase_tags, ARRAY[]::text[])) u
                             WHERE u LIKE '의심대상-%' AND replace(u,'의심대상-','')::int <> p.id
                               AND EXISTS (SELECT 1 FROM place_seed_raw q WHERE q.id = replace(u,'의심대상-','')::int)))))
        WHERE p.city_id = $1
          AND ('pid-twin-absorbed' = ANY(p.phase_tags) OR '중복의심' = ANY(p.phase_tags)
               OR EXISTS (SELECT 1 FROM unnest(p.phase_tags) t WHERE t LIKE '의심대상-%'))
        RETURNING p.id`,
      [cityId],
    );
    tagsCleared = cl.rowCount ?? 0;
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
  console.log(
    `✅ 반영 ${n}행 · 흡수 후 삭제 ${deleted}행 · 낡은 표시 정리 ${tagsCleared}행`,
  );
  await pool.end();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
