// ⚠️ 영구 컴포넌트 2026-08-24 사장님 승인 = 창고 상태 백필 = 새 창고 필터(신원 사다리)의 시뮬 확정 결과를 행 상태로 기입.
// = 상태 규칙(우선순위 순): ① 같은 PID 다중행 = RC 최대 1행만 남기고 나머지 status='merged' + merged_into(포인터, 행 보존)
//   ② wrong-city-suspect 태그 또는 --quarantine 지목 = 'quarantined' ③ 영구폐업 태그 = 'closed' + business_status
//   ④ --holds 지목(시뮬 오매칭 의심) = 'hold' ⑤ PID 없음 = 'candidate'(목격담 보존·서빙 밖) ⑥ 나머지 = 'active'
// = 삭제 0 · 외부호출 0 · **재실행 멱등**(2026-08-24) = 현재 status 를 읽어 "달라진 행만" 갱신 =
//   태그를 떼거나 TS 검증으로 PID·RC 가 채워지면 다음 실행에서 자동으로 active 복귀(가두지 않음).
//   원복(전체) = UPDATE place_seed_raw SET status='active', merged_into=NULL WHERE city_id=N. 시뮬 정본 = .claude/worktrees/psr-filter-sim/sim/(2026-08-23 검증).
// = 사용: npx tsx server/services/fill/status-backfill.ts --city-id=141 [--holds=1,2] [--quarantine=3,4] [--apply]
import * as fs from "node:fs";
import * as path from "node:path";

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

async function main() {
  const { pool } = await import("../../db");
  if (!pool) throw new Error("DB 연결 없음");
  const rows = (
    await pool.query(
      `SELECT id, seed_category, google_place_id, google_review_count, phase_tags,
              status AS cur_status, merged_into AS cur_merged_into
         FROM place_seed_raw WHERE city_id = $1 ORDER BY id`,
      [cityId],
    )
  ).rows;

  // ① 같은 PID 다중행 = 승자(RC 최대) 외 merged
  const byPid = new Map<string, any[]>();
  for (const r of rows) {
    if (!r.google_place_id) continue;
    if (!byPid.has(r.google_place_id)) byPid.set(r.google_place_id, []);
    byPid.get(r.google_place_id)!.push(r);
  }
  const mergedInto = new Map<number, number>();
  for (const grp of byPid.values()) {
    if (grp.length < 2) continue;
    const keep = grp.reduce((a, b) =>
      (b.google_review_count ?? 0) > (a.google_review_count ?? 0) ||
      ((b.google_review_count ?? 0) === (a.google_review_count ?? 0) &&
        b.id > a.id)
        ? b
        : a,
    );
    for (const g of grp) if (g.id !== keep.id) mergedInto.set(g.id, keep.id);
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
    const tags: string[] = r.phase_tags || [];
    let status = "active";
    let into: number | undefined;
    let biz: string | undefined;
    if (mergedInto.has(r.id)) {
      status = "merged";
      into = mergedInto.get(r.id);
    } else if (quarSet.has(r.id) || tags.includes("wrong-city-suspect"))
      status = "quarantined";
    else if (tags.includes("영구폐업")) {
      status = "closed";
      biz = "CLOSED_PERMANENTLY";
    } else if (holdSet.has(r.id)) status = "hold";
    else if (!r.google_place_id) status = "candidate";
    // ⚠️ 2026-08-24 판단3종 지적 반영 = 현재값과 다르면 전부 plan 에(= active 복귀 포함).
    //   옛 "active 아닌 것만 담기" 폐기 §19 = 태그를 떼거나 검증이 채워져도 되돌아오지 못해
    //   행이 손님상 밖에 영구히 갇히던 결함(원재료를 가두는 구조 = 근원 치유 원칙에 반함).
    if (
      status !== r.cur_status ||
      (into ?? null) !== (r.cur_merged_into ?? null)
    )
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
    const finalStatus = p ? p.status : r.cur_status || "active";
    if (finalStatus === "active") {
      if (r.google_place_id) s.after++;
    } else s.ch[finalStatus] = (s.ch[finalStatus] || 0) + 1;
  }
  console.log(
    `═══ status-backfill city ${cityId} = ${rows.length}행 | 변경 ${plan.length}행 (삭제 0)`,
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
  if (!apply) {
    console.log("=== DRY (쓰기 0) = --apply 로 실행 ===");
    await pool.end();
    return;
  }
  // 반영 = 상태 컬럼만 UPDATE. ⚠️ 병합 진 행은 승자와 같은 PID = BEFORE 트리거 불변1에 걸리므로
  //   wrongcity-quarantine 과 동일한 정식 면제(트랜잭션 한정 skip_dup_check, 식별·내용 컬럼 무변경 = 안전) 사용.
  let n = 0;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.skip_dup_check','on', true)`);
    // 병합 = 자산 결합: 승자의 빈 필수요소(사진·한국어명·요약·카피·로컬명·가격)를 진 행 값으로 승계(§14 뼈대 보존)
    for (const [loser, winner] of mergedInto) {
      await client.query(
        `UPDATE place_seed_raw w SET
            image_url = COALESCE(NULLIF(w.image_url,''), l.image_url),
            image_attribution = COALESCE(w.image_attribution, l.image_attribution),
            name_ko = COALESCE(w.name_ko, l.name_ko),
            name_local = COALESCE(w.name_local, l.name_local),
            summary_ko = COALESCE(w.summary_ko, l.summary_ko),
            editorial_summary = COALESCE(w.editorial_summary, l.editorial_summary),
            price_eur = COALESCE(w.price_eur, l.price_eur),
            category_tags = (SELECT ARRAY(SELECT DISTINCT unnest(COALESCE(w.category_tags,'{}') || COALESCE(l.category_tags,'{}'))))
          FROM place_seed_raw l WHERE w.id = $1 AND l.id = $2`,
        [winner, loser],
      );
    }
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
