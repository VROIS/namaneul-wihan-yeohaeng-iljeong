// ⚠️ 수정금지(승인필요) 2026-09-04 사장님 확정 = 소속오염 행 = 좌표가 절대값 = 가장 가까운 도시로 이동(격리 폐기 = 2026-09-04 §19). 영구 컴포넌트(§16 fill/ 표준).
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../../..");
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
// ⚠️ 수정금지(승인필요) 2026-08-18 사장님 승인(정규화) = --ids=a,b,c 수동지정 이동 = 자동탐지(거리·자기모순)로
const manualIds: number[] | null = argv["ids"]
  ? String(argv["ids"])
      .split(",")
      .map((s) => Number(s.trim()))
      .filter(Number.isFinite)
  : null;
// ⚠️ 수정금지(승인필요) 2026-09-04 사장님 확정 = 격리 폐기·이동으로 전환 = 2026-09-04 §19. 격리 태그를 쓰면 status-backfill 이 quarantined 로 되돌려 옮겨도 손님상에 못 나간다.
const TAG = `city-moved-${new Date().toISOString().slice(0, 10)}`;

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
  // ⚠️ 수정금지(승인필요) 2026-09-29 사장님 결정 = 좌표가 절대값 = 소속이 틀린 행은 가장 가까운 도시로 옮기고 500km 안에 없으면 삭제 = 도시 판정은 geo-distance 1벌(구글맵 사진과 같이 씀) · 사진도 그 도시 폴더로 따라간다 (정본 §)
  const {
    distanceKmFromCoords,
    nearestCity: nearestOf,
    OWN_CITY_KM,
    MOVE_MAX_KM,
  } = await import(
    pathToFileURL(path.join(ROOT, "worker/lib/services/shared/geo-distance.ts"))
      .href
  );
  const { copyR2Object, deleteFromR2 } = await import(
    pathToFileURL(path.join(ROOT, "worker/lib/services/shared/r2-client.ts"))
      .href
  );
  const { placeImageKeyInCity } = await import(
    pathToFileURL(path.join(ROOT, "shared/r2-paths.ts")).href
  );
  const r2Prefix = (process.env.R2_PUBLIC_URL || "").replace(/\/+$/, "") + "/";
  const keyOfR2 = (url: string | null): string | null =>
    url && r2Prefix.length > 1 && url.startsWith(r2Prefix)
      ? url.slice(r2Prefix.length)
      : null;
  const cityList = (
    await c.query(
      `SELECT id, name, latitude::float8 AS lat, longitude::float8 AS lng
         FROM cities WHERE latitude IS NOT NULL AND longitude IS NOT NULL`,
    )
  ).rows;
  const nearestCity = (lat: number, lng: number) =>
    nearestOf(cityList, lat, lng);
  const photoAway = (key: string | null, cityId: number): boolean => {
    const m = key?.match(/^(\d+)\/images\//);
    return !!m && Number(m[1]) !== cityId;
  };

  const all = (
    await c.query(
      `SELECT p.id, p.city_id, ci.name_en AS city, p.name_en, p.seed_category, p.day_zone, p.image_url,
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
          `SELECT p.id, p.city_id, ci.name_en AS city, p.name_en, p.seed_category, p.day_zone, p.image_url,
                  p.latitude::float8 AS lat, p.longitude::float8 AS lng,
                  NULL::float8 AS dist_col
           FROM place_seed_raw p JOIN cities ci ON ci.id = p.city_id
           WHERE p.id = ANY($1::bigint[])
             AND p.latitude IS NOT NULL AND p.longitude IS NOT NULL
             AND p.latitude <> 0 AND p.longitude <> 0`,
          [manualIds],
        )
      ).rows.map((r: any) => {
        r._realKm = 0;
        r._why = "수동지정";
        return r;
      })
    : all.filter((r: any) => {
        const realKm = distanceKmFromCoords(r.clat, r.clng, r.lat, r.lng);
        const farOff = realKm > OWN_CITY_KM;
        const selfContradiction =
          r.dist_col != null && Math.abs(r.dist_col - realKm) > OWN_CITY_KM;
        (r as any)._realKm = realKm;
        (r as any)._why = farOff
          ? "소속오염"
          : selfContradiction
            ? "자기모순"
            : "";
        return farOff || selfContradiction;
      });

  console.log(
    `═══ 소속오염 이동 (${onlyCity ? "city " + onlyCity : "전 도시"}) = 대상 ${rows.length}행 ${apply ? "(APPLY)" : "(DRY)"} ═══`,
  );
  for (const r of rows) {
    const to =
      r.lat != null && r.lng != null ? nearestCity(r.lat, r.lng) : null;
    (r as any)._to = to;
    if (to && to.id === r.city_id && to.d <= MOVE_MAX_KM) {
      if (photoAway(keyOfR2(r.image_url), r.city_id))
        console.log(
          `  [사진자리] ${r.city}(${r.city_id}) id=${r.id} "${r.name_en}" 행은 제자리 · 사진만 ${keyOfR2(r.image_url)} → ${r.city_id} 폴더`,
        );
      continue;
    }
    console.log(
      `  [${(r as any)._why}] ${r.city}(${r.city_id}) id=${r.id} 실거리=${Math.round((r as any)._realKm)}km "${r.name_en}" → ${!to ? "좌표없음 = 이동불가" : to.d > MOVE_MAX_KM ? `가장 가까운 ${to.name} 도 ${Math.round(to.d)}km = 붙을 데 없음 = 삭제` : `${to.name}(${to.id}) ${Math.round(to.d)}km`}`,
    );
  }
  if (!apply) {
    console.log("=== DRY (쓰기 0) = --apply 로 이동 ===");
    await c.end();
    return;
  }

  let done = 0,
    viaSkip = 0,
    orphan = 0,
    photoOnly = 0,
    failed = 0;
  const { zoneForDistanceKm } = await import(
    pathToFileURL(path.join(ROOT, "worker/lib/services/shared/pool-radius.ts"))
      .href
  );
  const dropPhoto = async (key: string | null, url: string, rowId: number) => {
    if (!key) return;
    const shared = (
      await c.query(
        "SELECT 1 FROM place_seed_raw WHERE image_url = $1 AND id <> $2 LIMIT 1",
        [url, rowId],
      )
    ).rows.length;
    if (shared) return;
    await deleteFromR2(key).catch((e: any) =>
      console.log(`  ⚠️ 옛 사진 삭제 실패 ${key}: ${e?.message || e}`),
    );
  };
  for (const r of rows) {
    const to = (r as any)._to;
    if (!to) {
      failed++;
      console.log(`  ✗ id=${r.id} 좌표 없음 = 이동 불가`);
      continue;
    }
    const oldKey = keyOfR2(r.image_url);
    // ⚠️ 수정금지(승인필요) 2026-09-29 사장님 결정 = 도착지가 지금 도시면(500km 안) 행은 건드리지 않는다(rank·zone 헛갱신 방지). 가장 가까운 도시가 자기 도시여도 500km 밖이면 삭제. 사진만 다른 도시 폴더에 있으면 사진을 행의 도시로 (정본 §)
    const stay = to.id === r.city_id && to.d <= MOVE_MAX_KM;
    if (stay && !photoAway(oldKey, r.city_id)) continue;
    // ⚠️ 수정금지(승인필요) 2026-09-29 사장님 결정 = 붙을 도시가 없는 행 = 삭제(격리로 묻어두지 않는다) · 그 사진도 같이 지운다 (정본 §)
    if (!stay && to.d > MOVE_MAX_KM) {
      try {
        await c.query("DELETE FROM place_seed_raw WHERE id = $1", [r.id]);
        orphan++;
        console.log(
          `  🗑 id=${r.id} "${r.name_en}" 삭제(500km 안에 붙을 도시 없음)`,
        );
        await dropPhoto(oldKey, r.image_url, r.id);
      } catch (e: any) {
        failed++;
        console.log(`  ✗ id=${r.id} 삭제 실패: ${e.message}`);
      }
      continue;
    }
    const newKey = oldKey ? placeImageKeyInCity(oldKey, to.id) : null;
    const newUrl =
      oldKey && newKey && newKey !== oldKey
        ? await copyR2Object(oldKey, newKey, "image/jpeg")
        : null;
    if (oldKey && newKey && newKey !== oldKey && !newUrl)
      console.log(`  ⚠️ id=${r.id} 사진 복사 실패(옛 자리 없음): ${oldKey}`);
    if (stay && !newUrl) continue;
    // ⚠️ 수정금지(승인필요) 2026-09-29 사장님 결정 = 이동 = city_id 를 옮기고 rank 는 비워 도착 도시 기준으로 트리거가 다시 매긴다. zone 도 새 도시 중심 기준 재계산. 사진 주소도 새 도시 폴더로 (정본 §)
    const upd = stay
      ? `UPDATE place_seed_raw SET image_url = $2 WHERE id = $1`
      : `UPDATE place_seed_raw SET city_id = ${to.id}, rank = NULL,
        day_zone = ${zoneForDistanceKm(to.d) === null ? "NULL" : `'${zoneForDistanceKm(to.d)}'`},
        distance_km_from_center = ${Math.round(to.d * 10) / 10},
        image_url = COALESCE($2, image_url),
        phase_tags = (SELECT ARRAY(SELECT DISTINCT unnest(COALESCE(phase_tags, ARRAY[]::text[]) || ARRAY['${TAG}'])))
      WHERE id = $1`;
    let moved = false;
    try {
      await c.query(upd, [r.id, newUrl]);
      moved = true;
    } catch (e: any) {
      if (/\[중복차단\]/.test(e.message || "")) {
        try {
          await c.query("BEGIN");
          await c.query("SELECT set_config('app.skip_dup_check','on',true)");
          await c.query(upd, [r.id, newUrl]);
          // ⚠️ 수정금지(승인필요) 2026-09-08 사장님 확정 = 통과증(skip_dup_check)은 쓰고 나서 반드시 손으로 반납(RESET) = 풀 백엔드에 켜진 채 남아 검문 전체가 꺼졌던 사고.
          await c.query("RESET app.skip_dup_check");
          await c.query("COMMIT");
          viaSkip++;
          moved = true;
        } catch (e2: any) {
          await c.query("ROLLBACK").catch(() => {});
          failed++;
          console.log(`  ✗ id=${r.id} 이동 실패: ${e2.message}`);
        }
      } else {
        failed++;
        console.log(`  ✗ id=${r.id} 이동 실패: ${e.message}`);
      }
    }
    if (moved && stay) photoOnly++;
    else if (moved) done++;
    if (moved && newUrl) await dropPhoto(oldKey, r.image_url, r.id);
    else if (!moved && newUrl && newKey)
      await deleteFromR2(newKey).catch((e: any) =>
        console.log(`  ⚠️ 새 사진 되돌림 실패 ${newKey}: ${e?.message || e}`),
      );
  }
  console.log(
    `\n═══ 이동 ${done}행 (검문면제 경유 ${viaSkip}) / 사진만 제자리로 ${photoOnly}행 / 삭제 ${orphan}행 / 실패 ${failed} ═══`,
  );
  await c.end();
})();
