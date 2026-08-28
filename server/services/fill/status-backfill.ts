// ⚠️ 영구 컴포넌트 2026-08-24 사장님 승인 · 2026-08-28 A안 확정 = 창고 상태 백필 + 같은 PID 쌍둥이 소프트 병합(keep 흡수·태그/언어코드 합집합·번역행 복사·포인터 이동, 행 삭제 0).
// = 상태 규칙(우선순위 순): ① 같은 PID 다중행 = RC 최대(동률 = id 큰 쪽) 1행 = keep, 나머지 status='merged' + merged_into(포인터, 행 보존).
//   ⚠️ 수정금지(승인필요) 2026-08-28 사장님 확정 = A안 = keep 이 그룹 내용을 흡수한다(absorbTwinGroup, 행 DELETE 없음) =
//   ⓐ keep 빈칸(흡수 컬럼표 + 좌표쌍)만 loser 값으로 = upsertPlace(targetRowId=keep, followTriggerDup=true) 1콜(COALESCE §14 뼈대 보존)
//      + UpsertPayload 에 칸이 없는 컬럼(DIRECT_COLS) = 직접 COALESCE 1문장. category_tags = 그룹 전 행 tags ∪ seed_category / phase_tags = loser tags ∪ 'pid-twin-absorbed'.
//   ⓑ best_rank = 현재값 ∪ 그룹 합집합(bestRankUnion, FOR UPDATE) ⓒ place_translations = keep 사본 INSERT ON CONFLICT DO NOTHING(loser 번역행 보존)
//   ⓓ guides.place_id · cities.override_hero_place_id / override_highlight_place_ids · merged_into 포인터 → keep. 그룹당 1 트랜잭션(skip_dup_check 면제).
//   = 이미 merged 인 그룹도 매번 다시 돈다(멱등). keep 규칙 = 08-24 승인분 유지 = fillcity/dups-detail.ts 의 keep 순서는 이 규칙으로 대체됨.
//   ② wrong-city-suspect 태그 또는 --quarantine 지목 = 'quarantined'
//   ③ 영구폐업 태그 **또는** business_status 현재값 CLOSED_PERMANENTLY / CLOSED_TEMPORARILY(gmaps-pid-identity.ts --verify 가 씀) = 'closed'
//      (2026-08-28 사장님 확정 = 컬럼이 이미 CLOSED_* 면 그 값 유지, 태그만 있으면 business_status=CLOSED_PERMANENTLY 기록. 뮌헨 #67813 Olympiaturm CLOSED_TEMPORARILY 가 rank 6 으로 서빙되던 구멍 봉합)
//   ④ --holds 지목(시뮬 오매칭 의심) = 'hold' ⑤ PID 없음 = 'candidate'(목격담 보존·서빙 밖) ⑥ 나머지 = 'active'
//   (keep 의 ②③ 판정 = 흡수 후 태그(keep ∪ loser) 기준 = 같은 PID = 같은 장소.)
// = 삭제 0 · 외부호출 0 · **재실행 멱등**(2026-08-24) = 현재 status 를 읽어 "달라진 행만" 갱신 =
//   태그를 떼거나 TS 검증으로 PID·RC 가 채워지거나 --verify 가 business_status 를 OPERATIONAL 로 되돌리면 다음 실행에서 자동으로 active 복귀(가두지 않음).
//   원복(상태) = UPDATE place_seed_raw SET status='active', merged_into=NULL WHERE city_id=N. 시뮬 정본 = .claude/worktrees/psr-filter-sim/sim/(2026-08-23 검증).
// = 사용: npx tsx server/services/fill/status-backfill.ts --city-id=141 [--holds=1,2] [--quarantine=3,4] [--apply]
import * as fs from "node:fs";
import * as path from "node:path";
// ⚠️ 수정금지(승인필요) 2026-08-28 사장님 승인 = best_rank 쓰기 트랜잭션(SELECT FOR UPDATE→합집합→조건부 UPDATE) 1벌
//   = writeBestRankUnion() = discovery-verify-and-insert.ts(B2) 와 공용(§16, 옛 이 파일 자체 인라인 구현 완전삭제).
import { bestRankUnion, writeBestRankUnion } from "../shared/best-rank";
// ⚠️ 수정금지(승인필요) 2026-08-28 사장님 승인 = 흡수 후보 컬럼 목록 1벌(§16 SSOT) = fillcity/dups-detail.ts 와 공용.
import { FILL_COLS } from "../shared/place-fill-columns";

// .env 선로드(다른 fill/ 도구와 동일 패턴 = db.ts import 전에)
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
//   server/services/shared/place-fill-columns.ts, fillcity/dups-detail.ts 와 공용)에서 유도 + 이 파일 전용
//   business_status 만 추가(둘이 손으로 각자 베끼다 드리프트 나던 것 차단). 좌표(latitude/longitude)·태그
//   (phase_tags/category_tags)는 이 파일이 좌표쌍·UNION 으로 따로 처리하므로 제외. UpsertPayload 에 칸이 있는
//   컬럼 = UPSERT_COLS(필드명, 카멜케이스 자동변환 예외만 FIELD_NAME_OVERRIDES) / 칸이 없는 컬럼 = DIRECT_COLS
//   (직접 COALESCE, place-upsert.ts 보호파일 무변경). 값 매핑 결과는 기존과 100% 동일(교체 전 20개 전수 대조 확인).
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
// ③ closed 판정용 business_status 값(gmaps-pid-identity.ts --verify 가 쓰는 3값 중 폐업·휴업 2개). 2026-08-28 사장님 확정.
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

// ── ① keep 흡수 = ⓐ upsertPlace(드리즐 연결, 트랜잭션 전 = B2 와 같은 순서) → ⓑ~ⓓ pg 트랜잭션 1개(skip_dup_check 면제 = 형제 PID 행이 살아있어 문지기 불변1이 keep UPDATE 를 막음) ──
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
    //   와 공용, §16) = 현재값 ∪ 그룹 합집합, 값이 같으면 UPDATE 생략(멱등 = updated_at 무변동).
    const { cur, result } = await writeBestRankUnion(c, keepId, p.bestRank);
    // ⓒ 번역행 = keep 사본 INSERT(언어당 1행 = 흡수 우선순위 loser 먼저). loser 번역행은 보존(행 삭제 0).
    await c.query(
      `INSERT INTO place_translations (place_id, language, summary, editorial_summary)
       SELECT DISTINCT ON (language) $1, language, summary, editorial_summary
         FROM place_translations WHERE place_id = ANY($2::int[])
        ORDER BY language, array_position($2::int[], place_id)
       ON CONFLICT (place_id, language) DO NOTHING`,
      [keepId, loserIds],
    );
    // ⓓ 포인터 이동
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

  // ① 같은 PID 다중행 = keep(RC 최대 → id 큰 쪽) 외 merged + keep 흡수 계획
  const byPid = new Map<string, any[]>();
  for (const r of rows) {
    if (!r.google_place_id) continue;
    if (!byPid.has(r.google_place_id)) byPid.set(r.google_place_id, []);
    byPid.get(r.google_place_id)!.push(r);
  }
  const mergedInto = new Map<number, number>();
  const twinPlans: TwinPlan[] = [];
  const keepTags = new Map<number, string[]>(); // keep 의 흡수 후 phase_tags(②③ 판정용)
  for (const grp of byPid.values()) {
    if (grp.length < 2) continue;
    const keep = grp.reduce((a, b) =>
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
      // ⚠️ 수정금지(승인필요) 2026-08-28 사장님 확정 = ③ closed = 영구폐업 태그 ∪ business_status 현재값 CLOSED_*(gmaps-pid-identity --verify 기록).
      //   컬럼이 이미 CLOSED_* 면 biz 미지정 = COALESCE 로 컬럼값 유지 / 태그만 있으면 CLOSED_PERMANENTLY 기록.
      //   --verify 가 OPERATIONAL 로 되돌리면 태그 없는 한 status 가 active 로 계산되어 아래 "달라진 행만" 비교에서 자동 복귀.
      status = "closed";
      if (!CLOSED_BIZ.has(r.business_status)) biz = "CLOSED_PERMANENTLY";
    } else if (holdSet.has(r.id)) status = "hold";
    else if (!r.google_place_id) status = "candidate";
    // ⚠️ 2026-08-24 판단3종 지적 반영 = 현재값과 다르면 전부 plan 에(= active 복귀 포함).
    //   옛 "active 아닌 것만 담기" 폐기 §19 = 태그를 떼거나 검증이 채워져도 되돌아오지 못해
    //   행이 손님상 밖에 영구히 갇히던 결함(원재료를 가두는 구조 = 근원 치유 원칙에 반함).
    if (status !== r.status || (into ?? null) !== (r.merged_into ?? null))
      plan.push({ id: r.id, cat: r.seed_category, status, into, biz });
  }

  // 카테고리별 전<>후 표
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
    // ⚠️ 2026-08-24 = 표는 **적용 후 최종 상태** 기준(= 현재 status 를 반영). 옛 "새 계산만" 폐기 §19
    //   (= 이미 non-active 인 행을 서빙 수에 넣어 실제보다 많게 보고 = 승인 근거가 틀어짐).
    const finalStatus = p ? p.status : r.status || "active";
    if (finalStatus === "active") {
      if (r.google_place_id) s.after++;
    } else s.ch[finalStatus] = (s.ch[finalStatus] || 0) + 1;
  }
  console.log(
    `═══ status-backfill city ${cityId} = ${rows.length}행 | 변경 ${plan.length}행 | PID 그룹 ${twinPlans.length}개 (삭제 0)`,
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
      `── ① 같은 PID 그룹 ${twinPlans.length}개 = keep 흡수 + 소프트 병합(행 삭제 0) ──`,
    );
    for (const p of twinPlans) printTwinPlan(p);
  }
  if (!apply) {
    console.log("=== DRY (쓰기 0) = --apply 로 실행 ===");
    await pool.end();
    return;
  }
  // 반영 ① = 그룹당 흡수(그룹당 1 트랜잭션, 실패 = ROLLBACK 후 중단 = 재실행 멱등)
  if (twinPlans.length) {
    const { upsertPlace } = await import("../place-upsert");
    for (const p of twinPlans) {
      const br = await absorbTwinGroup(pool, upsertPlace, p);
      console.log(
        `  ✅ 흡수 keep #${p.keep.id} ← ${p.losers.map((l) => "#" + l.id).join(",")} (best_rank ${br.cur} ∪ ${p.bestRank} → ${br.result})`,
      );
    }
  }
  // 반영 ②~⑥ + 소프트 병합 표식 = 상태 컬럼만 UPDATE. ⚠️ 병합 진 행은 승자와 같은 PID = BEFORE 트리거 불변1에 걸리므로
  //   wrongcity-quarantine 과 동일한 정식 면제(트랜잭션 한정 skip_dup_check, 식별·내용 컬럼 무변경 = 안전) 사용.
  let n = 0;
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
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
  console.log(
    `✅ 반영 ${n}행 (원복 = UPDATE place_seed_raw SET status='active', merged_into=NULL WHERE city_id=${cityId})`,
  );
  await pool.end();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
