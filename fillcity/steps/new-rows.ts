import fs from "fs";
import path from "path";
import { distanceKmFromCoords } from "../../worker/lib/services/shared/geo-distance";
import { ROOT, runTsx } from "./common";

// ⚠️ 수정금지(승인필요) 2026-10-26 사장님 결정 = 시설 안 새 식당 넣기 1벌 = 일꾼이 찾은 그 단계에서 바로 넣는다(분류 04 · 최종 점검 06 공용) · 창고에 같은 CID 가 있으면 넣지 않는다 · 목록 입력 1벌(discovery-lists-insert --report) → 일꾼이 적은 한글 이름·요약·묘사·(머리줄 없으면) 가격 (정본 §2026-10-26)
export async function insertNewRows(
  db: any,
  cityId: number,
  dir: string,
  source: string,
): Promise<number> {
  const found: any[] = [];
  for (const f of fs
    .readdirSync(dir)
    .filter((x) => /^new-rows-\d+\.json$/.test(x)))
    try {
      const a = JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8"));
      if (Array.isArray(a)) found.push(...a);
    } catch (e: any) {
      console.log(`  ✘ ${f} 읽기 실패 = 건너뜀(${e?.message || e})`);
    }
  const cids = found
    .map((n) => String(n?.cid ?? ""))
    .filter((cid) => /^\d+$/.test(cid));
  if (!cids.length) return 0;
  const have = new Set(
    (
      await db.query(
        `SELECT substring(google_maps_uri from 'cid=([0-9]+)') AS cid FROM place_seed_raw WHERE city_id=$1 AND merged_into IS NULL AND substring(google_maps_uri from 'cid=([0-9]+)') = ANY($2::text[])`,
        [cityId, cids],
      )
    ).rows.map((r: any) => String(r.cid)),
  );
  const city = (
    await db.query(
      "SELECT latitude::float8 AS lat, longitude::float8 AS lng FROM cities WHERE id=$1",
      [cityId],
    )
  ).rows[0];
  const picks: any[] = [];
  const texts = new Map<string, any>();
  for (const n of found) {
    const cid = String(n?.cid ?? "");
    if (have.has(cid) || texts.has(cid)) continue;
    const st = String(n["영업상태"] ?? "OPERATIONAL");
    if (!/^\d+$/.test(cid) || st !== "OPERATIONAL") {
      console.log(
        `  ✘ ${n["이름"]} = 안 넣음(${!/^\d+$/.test(cid) ? `CID 가 숫자가 아님 "${cid}"` : `영업상태 "${st}" ≠ OPERATIONAL`})`,
      );
      continue;
    }
    picks.push({
      cat: "restaurant",
      name: n["이름"],
      cid,
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
    texts.set(cid, {
      name_ko: n["한글이름"] ?? null,
      summary_ko: n["요약"] ?? null,
      editorial_summary: n["묘사"] ?? null,
      price_eur: typeof n["가격_유로"] === "number" ? n["가격_유로"] : null,
    });
  }
  console.log(
    `새 식당 후보 = ${found.length}곳 · 창고에 이미 있음 ${cids.filter((x) => have.has(x)).length} · 넣을 곳 ${picks.length}`,
  );
  if (!picks.length) return 0;
  const file = path.join(dir, "new-rows-select.json");
  fs.writeFileSync(
    file,
    JSON.stringify(
      { generatedAt: new Date().toISOString(), source, picks },
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
            reason: `${source} = 한글 이름·요약·묘사·(머리줄 없으면) 가격`,
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
  return rows.length;
}
