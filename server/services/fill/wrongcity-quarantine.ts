// ⚠️ 수정금지(승인필요) 2026-08-18 사장님 승인 = 소속오염 행 격리 = 영구 컴포넌트(§16 fill/ 표준).
// = 능력: 소속도시 중심에서 실좌표 100km 초과인 행(= 소속 오염 = 토론토 소속 바르샤바·아스완·뉴멕시코 등
//   전수 136행 실측, 2026-08-18 세계일주 여정 실사고 근본)을 찾아 **격리**한다.
//   격리 = day_zone → NULL(후보 조회에서 숨김) + phase_tags 에 'wrong-city-suspect' 표식.
//   행 삭제·이동 절대 없음(= 사장님 SSOT "DB는 무조건 남긴다") = 사후 검토·재배치용 표식만.
// = 거리식 = shared/pool-radius distanceKmFromCoords 1벌(§16).
// = day_zone 만 바꾸는 UPDATE 도 문지기(prevent_dup)가 전 불변조건을 재검사하므로, PID 형제중복 행은
//   불변1에 막힌다 → 그 행만 트랜잭션 한정 검문 면제(SET LOCAL app.skip_dup_check)로 재시도.
//   면제 정당성 = 식별컬럼(PID·주소·좌표·이름)은 1글자도 안 바꾸고 day_zone/phase_tags 만 변경 = 검문 무의미.
//
// 호출:
//   npx tsx server/services/fill/wrongcity-quarantine.ts                # DRY = 전 도시 오염 목록(쓰기 0)
//   npx tsx server/services/fill/wrongcity-quarantine.ts --city-id=110 # DRY = 한 도시만
//   npx tsx server/services/fill/wrongcity-quarantine.ts --apply       # 실제 격리
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");
process.chdir(ROOT);
const env = fs.readFileSync(".env", "utf-8").replace(/^﻿/, "");
for (const line of env.split(/\r?\n/)) {
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
const onlyCity = Number(argv["city-id"] || 0) || null;
const apply = argv["apply"] === "true";
// ⚠️ 수정금지(승인필요) 2026-08-18 사장님 승인(정규화) = --ids=a,b,c 수동지정 격리 = 자동탐지(거리·자기모순)로
//   못 잡는 쓰레기 행(예: 토론토 hotspot rank15 "Gentrification" = 개념어인데 PID 보유로 게이트 통과)을
//   사람이 지목해 격리. 격리 방식은 동일(day_zone NULL + 태그, 행 보존).
const manualIds: number[] | null = argv["ids"]
  ? String(argv["ids"])
      .split(",")
      .map((s) => Number(s.trim()))
      .filter(Number.isFinite)
  : null;
const TAG = "wrong-city-suspect";

(async () => {
  const pg = await import("pg");
  const c = new (pg as any).default.Client({
    connectionString:
      process.env.SUPA_URL ||
      process.env.SUPABASE_DATABASE_URL ||
      process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  const { distanceKmFromCoords } = await import(
    pathToFileURL(path.join(ROOT, "server/services/shared/pool-radius.ts")).href
  );

  // 오염 판정 2종(도시 무관 보편 규칙):
  //   ① 소속오염 = 좌표가 소속도시 중심 100km 초과 (트리니티·바르샤바형)
  //   ② 자기모순 = 저장된 distance_km_from_center 와 좌표계산 거리가 100km 이상 어긋남 (키이우형 =
  //      좌표를 시내로 위조했지만 거리컬럼 7,600km 가 정직하게 남아 행 내부가 서로 모순 = 2026-08-18 실측).
  const all = (
    await c.query(
      `SELECT p.id, p.city_id, ci.name_en AS city, p.name_en, p.seed_category, p.day_zone,
              p.latitude::float8 AS lat, p.longitude::float8 AS lng,
              p.distance_km_from_center::float8 AS dist_col,
              ci.latitude::float8 AS clat, ci.longitude::float8 AS clng
       FROM place_seed_raw p JOIN cities ci ON ci.id = p.city_id
       WHERE p.latitude IS NOT NULL AND p.longitude IS NOT NULL
         AND p.latitude <> 0 AND p.longitude <> 0
         AND ci.latitude IS NOT NULL AND ci.longitude IS NOT NULL
         AND p.seed_category NOT LIKE 'bts%'
         ${onlyCity ? "AND p.city_id = $1" : ""}
       ORDER BY p.city_id, p.id`,
      onlyCity ? [onlyCity] : [],
    )
  ).rows;
  const rows = manualIds
    ? (
        await c.query(
          `SELECT p.id, p.city_id, ci.name_en AS city, p.name_en, p.seed_category, p.day_zone,
                  NULL::float8 AS dist_col
           FROM place_seed_raw p JOIN cities ci ON ci.id = p.city_id
           WHERE p.id = ANY($1::bigint[])`,
          [manualIds],
        )
      ).rows.map((r: any) => {
        r._realKm = 0;
        r._why = "수동지정";
        return r;
      })
    : all.filter((r: any) => {
        const realKm = distanceKmFromCoords(r.clat, r.clng, r.lat, r.lng);
        const farOff = realKm > 100;
        const selfContradiction =
          r.dist_col != null && Math.abs(r.dist_col - realKm) > 100;
        (r as any)._realKm = realKm;
        (r as any)._why = farOff
          ? "소속오염"
          : selfContradiction
            ? "자기모순"
            : "";
        return farOff || selfContradiction;
      });

  console.log(
    `═══ 소속오염 격리 (${onlyCity ? "city " + onlyCity : "전 도시"}) = 대상 ${rows.length}행 ${apply ? "(APPLY)" : "(DRY)"} ═══`,
  );
  for (const r of rows) {
    console.log(
      `  [${(r as any)._why}] ${r.city}(${r.city_id}) id=${r.id} cat=${r.seed_category} zone=${r.day_zone} 거리컬럼=${r.dist_col} 실거리=${Math.round((r as any)._realKm)}km "${r.name_en}"`,
    );
  }
  if (!apply) {
    console.log("=== DRY (쓰기 0) = --apply 로 격리 ===");
    await c.end();
    return;
  }

  let done = 0,
    viaSkip = 0,
    failed = 0;
  for (const r of rows) {
    const upd = `UPDATE place_seed_raw SET day_zone = NULL,
        phase_tags = (SELECT ARRAY(SELECT DISTINCT unnest(COALESCE(phase_tags, ARRAY[]::text[]) || ARRAY['${TAG}'])))
      WHERE id = $1`;
    try {
      await c.query(upd, [r.id]);
      done++;
    } catch (e: any) {
      if (/\[중복차단\]/.test(e.message || "")) {
        // PID 형제중복 행 = 검문이 식별컬럼 무변경 UPDATE 도 막음 → 트랜잭션 한정 면제 재시도
        try {
          await c.query("BEGIN");
          await c.query("SELECT set_config('app.skip_dup_check','on',true)");
          await c.query(upd, [r.id]);
          await c.query("COMMIT");
          done++;
          viaSkip++;
        } catch (e2: any) {
          await c.query("ROLLBACK").catch(() => {});
          failed++;
          console.log(`  ✗ id=${r.id} 격리 실패: ${e2.message}`);
        }
      } else {
        failed++;
        console.log(`  ✗ id=${r.id} 격리 실패: ${e.message}`);
      }
    }
  }
  console.log(
    `\n═══ 격리 결과 = ${done}행 (검문면제 경유 ${viaSkip}) / 실패 ${failed} ═══`,
  );
  await c.end();
})();
