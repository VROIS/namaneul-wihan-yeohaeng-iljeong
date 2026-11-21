// ⚠️ 수정금지(승인필요) 2026-11-21 사장님 결정 = 필시티 v4.1 거점 통폐합 = 없어지는 도시 폴더의 행은 한 장소씩 붙을 거점(nearestHub 1벌 = 같은 나라 거점 우선 · 없으면 가장 가까운 거점 · 후보 = 깃발 거점(hubCities 1벌) + 받는 거점)으로 이사(좌표 없는 행은 받는 거점) · 순서 고정 = ① 백업 ② 옛 폴더 쓰레기 버림 ③ 덮인 등수 되돌림 ④ 행 이사 ⑤ 여정·가이드·외부 호출 기록 도시 번호 ⑥ 저장소(R2·이 PC) 붙이고 주소 바꿈 ⑦ 옛 주소 0 확인 뒤 옛 R2 폴더·도시 행 삭제 · 끝난 단계는 다시 돌려도 건너뛴다 (정본 2026-11-21)
import fs from "fs";
import path from "path";
import { ROOT, connectDb, loadEnv, parseArgs, runTsx, stamp } from "./common";
import { countryOfAddress, hubCities, nearestHub } from "./ballot-common";
import { listR2 } from "../../worker/lib/services/shared/r2-client";

loadEnv();
const argv = parseArgs();
const to = Number(argv["to"] || 0);
const froms = String(argv["from"] || "")
  .split(",")
  .map(Number)
  .filter(Boolean);
const hubIds = [
  ...new Set([
    to,
    ...String(argv["hubs"] || "")
      .split(",")
      .map(Number)
      .filter(Boolean),
  ]),
];
const apply = argv["apply"] === "true";
const clean = argv["clean"] !== "false";
const REPO = String(argv["repo"] || "C:/Users/hzino/Desktop/my-handy-guide2");
const repoStep = (rel: string) => path.join(REPO, rel);
const labStep = (rel: string) => path.join(ROOT, rel);
const NO_DATA = `(latitude IS NULL OR latitude = 0) AND address IS NULL AND COALESCE(google_review_count, 0) = 0 AND google_place_id IS NULL AND (google_maps_uri IS NULL OR google_maps_uri NOT LIKE '%cid=%') AND best_rank IS NULL AND verify_source IS NULL`;
const must = async (label: string, script: string, args: string[]) => {
  console.log(`\n── ${label}`);
  const code = await runTsx(script, args);
  if (code !== 0)
    throw new Error(
      `${label} = 종료 코드 ${code} = 병합을 멈춘다(다시 돌리면 이 단계부터)`,
    );
};

// 같은 구글 장소(CID 또는 PID 가 같음)가 한 거점에 두 행이면 한 행으로 모은다 = 앞선 행(스탬프 최신 → CID → PID → 마지막 갱신)의 값을 기존 upsertPlace 의 쌍둥이 흡수 길로 써서 다른 행에 덮고(그 행에만 있는 칸은 그대로 남음) 베스트·가이드·여정 연결을 옮긴 뒤 앞선 행을 지운다 · 번역은 요약과 한 짝이라 앞선 행 것이 따라간다 · BTS 행은 일부러 따로 둔 것이라 뺀다
const TWIN_KEY = `COALESCE(substring(google_maps_uri from 'cid=([0-9]+)'), google_place_id)`;
async function mergeTwins(c: any, hub: number): Promise<number> {
  const groups: any[] = (
    await c.query(
      `SELECT ${TWIN_KEY} AS k, array_agg(id) AS ids FROM place_seed_raw
        WHERE city_id = $1 AND status <> 'merged' AND seed_category NOT LIKE 'bts_%' AND ${TWIN_KEY} IS NOT NULL
        GROUP BY 1 HAVING count(*) > 1`,
      [hub],
    )
  ).rows;
  console.log(`  ④-2 같은 구글 장소 겹침(거점 ${hub}) = ${groups.length}쌍`);
  if (!groups.length) return 0;
  const { upsertPlace } = await import(
    "../../worker/lib/services/place-upsert"
  );
  for (const g of groups) {
    for (let guard = 0; guard < 10; guard++) {
      const rows: any[] = (
        await c.query(
          `SELECT *, (google_maps_uri LIKE '%cid=%') AS has_cid FROM place_seed_raw WHERE id = ANY($1::int[])
            ORDER BY verified_at DESC NULLS LAST, (google_maps_uri LIKE '%cid=%') DESC, (google_place_id IS NOT NULL) DESC, updated_at DESC NULLS LAST, id DESC`,
          [g.ids],
        )
      ).rows;
      if (rows.length < 2) break;
      const [w, k] = rows;
      console.log(
        `    · #${w.id} ${w.name_en}(스탬프 ${w.verified_at ? new Date(w.verified_at).toISOString().slice(0, 10) : "없음"} · 갱신 ${w.updated_at ? new Date(w.updated_at).toISOString().slice(0, 10) : "-"}) 의 값 → #${k.id} ${k.name_en} 에 덮고 한 행으로`,
      );
      if (!apply) break;
      const tr = (
        await c.query(
          "SELECT count(*)::int n FROM place_translations WHERE place_id=$1",
          [w.id],
        )
      ).rows[0].n;
      if (tr) {
        await c.query("BEGIN");
        await c.query("DELETE FROM place_translations WHERE place_id=$1", [
          k.id,
        ]);
        await c.query(
          "UPDATE place_translations SET place_id=$2 WHERE place_id=$1",
          [w.id, k.id],
        );
        await c.query("COMMIT");
      }
      const num = (v: any) => (v == null ? null : Number(v));
      const res = await upsertPlace({
        targetRowId: w.id,
        dupCheckOnWrite: true,
        cityId: hub,
        seedCategory: w.seed_category,
        overwriteSeedCategory: !!w.verify_source,
        nameEn: w.name_en,
        nameKo: w.name_ko,
        nameLocal: w.name_local,
        address: w.address,
        latitude: num(w.latitude),
        longitude: num(w.longitude),
        googlePlaceId: w.google_place_id,
        googleMapsUri: w.google_maps_uri,
        googleReviewCount: num(w.google_review_count),
        businessStatus: w.business_status,
        googlePrimaryType: w.google_primary_type,
        priceEur: num(w.price_eur),
        selectionReasonKo: w.summary_ko,
        shortformKo: w.editorial_summary,
        dayZone: w.day_zone,
        distanceKmFromCenter: num(w.distance_km_from_center),
        categoryTags: w.category_tags ?? [w.seed_category],
        phaseTags: [...(w.phase_tags ?? []), "hub-merge-twin"],
        ...(k.image_url
          ? {}
          : { imageUrl: w.image_url, imageAttribution: w.image_attribution }),
      } as any);
      const gone =
        (
          await c.query(
            "SELECT count(*)::int n FROM place_seed_raw WHERE id=$1",
            [w.id],
          )
        ).rows[0].n === 0;
      if (!gone)
        throw new Error(
          `같은 구글 장소 합치기 실패 = #${w.id} ↔ #${k.id} (${res.action}${res.reason ? ": " + res.reason : ""}) = 멈춘다`,
        );
    }
  }
  return groups.length;
}

(async () => {
  if (!to || !froms.length) {
    console.error(
      "Usage: --to=<거점 번호> --from=<옛 도시 번호,...> [--hubs=<다른 거점 번호,...>] [--clean=false] [--apply]",
    );
    process.exit(1);
  }
  const c = await connectDb();
  const hubs: any[] = (await hubCities(c, hubIds)).filter(
    (h) => !froms.includes(h.id),
  );
  if (!hubs.some((h) => h.id === to))
    throw new Error(`거점 ${to} 도시 행이 없다`);
  console.log(
    `═══ 거점 병합 = ${froms.join(",")} → ${to}(${hubs.find((h) => h.id === to).name}) · 한 장소씩 붙을 거점 후보 ${hubs.length}곳 · ${apply ? "APPLY" : "DRY(쓰기 0)"} ═══`,
  );

  for (const from of froms) {
    const city = (await c.query("SELECT * FROM cities WHERE id=$1", [from]))
      .rows[0];
    const rows: any[] = (
      await c.query(
        "SELECT * FROM place_seed_raw WHERE city_id=$1 ORDER BY id",
        [from],
      )
    ).rows;
    const its: any[] = (
      await c.query(
        "SELECT id, title, status FROM itineraries WHERE city_id=$1",
        [from],
      )
    ).rows;
    const guides: any[] = (
      await c.query("SELECT id, place_id FROM guides WHERE city_id=$1", [from])
    ).rows;
    const calls = (
      await c.query(
        "SELECT count(*)::int n FROM external_calls WHERE city_id=$1",
        [from],
      )
    ).rows[0].n;
    const noData = (
      await c.query(
        `SELECT count(*)::int n FROM place_seed_raw WHERE city_id=$1 AND ${NO_DATA}`,
        [from],
      )
    ).rows[0].n;
    const r2 = ((await listR2(`${from}/`)) as any[]).length;
    const reportDirRepo = path.join(REPO, "docs/b1-reports", String(from));
    const hasRanks =
      fs.existsSync(reportDirRepo) &&
      fs
        .readdirSync(reportDirRepo)
        .some((x) => /_b1-discovery-diff(_\d+)?\.json$/.test(x));
    console.log(
      `\n■ ${from} ${city ? city.name : "(도시 행 없음 = 이미 지움)"} = 행 ${rows.length}(자료 전무 ${noData} · 베스트 ${rows.filter((r) => r.best_rank != null).length}) · 여정 ${its.length} · 가이드 ${guides.length} · 외부 호출 기록 ${calls} · R2 ${r2}개 · 순위표 ${hasRanks ? "있음" : "없음"}`,
    );
    if (
      !city &&
      !rows.length &&
      !r2 &&
      !its.length &&
      !guides.length &&
      !calls
    ) {
      console.log("  ⏭ 남은 것 없음 = 건너뜀");
      continue;
    }

    // ① 백업
    const backup = path.join(
      ROOT,
      "docs/sim",
      `hub-merge-backup-${from}-to-${to}-${stamp()}.json`,
    );
    if (apply && (rows.length || city)) {
      fs.mkdirSync(path.dirname(backup), { recursive: true });
      fs.writeFileSync(
        backup,
        JSON.stringify(
          {
            at: new Date().toISOString(),
            city,
            rows,
            itineraries: its,
            guides,
          },
          null,
          1,
        ),
      );
      console.log(`  ① 백업 = ${backup}`);
    } else console.log("  ① 백업(쓸 때 만든다)");

    // ② 옛 폴더 쓰레기 버림 = 자료 전무 행 삭제 + LLM 검토(구글 연결·베스트 행은 삭제 후보로만 남는다)
    if (clean && rows.length) {
      if (apply) {
        if (noData) {
          const ids = (
            await c.query(
              `SELECT id FROM place_seed_raw WHERE city_id=$1 AND ${NO_DATA}`,
              [from],
            )
          ).rows.map((r: any) => r.id);
          const f = path.join(
            ROOT,
            "docs/sim",
            `${stamp()}_nodata-${from}_boss-fix.json`,
          );
          fs.writeFileSync(
            f,
            JSON.stringify(
              ids.map((id: number) => ({
                id,
                reason:
                  "자료 전무(좌표·주소·후기·구글 연결 없음) = 병합 전 삭제(사장님 결정 2026-11-12)",
              })),
            ),
          );
          await must(
            `② 자료 전무 ${ids.length}행 삭제`,
            repoStep("fillcity/steps/llm-review.ts"),
            [`--city-id=${from}`, `--apply=${f}`],
          );
        }
        const leftRows = (
          await c.query(
            "SELECT count(*)::int n FROM place_seed_raw WHERE city_id=$1 AND status <> 'merged'",
            [from],
          )
        ).rows[0].n;
        if (leftRows)
          await must(
            "② LLM 검토(일꾼 4명 · 삭제·고침 적용)",
            repoStep("fillcity/steps/llm-review.ts"),
            [`--city-id=${from}`, "--judge", "--write=true"],
          );
      } else
        console.log(
          `  ② 쓰레기 버림 = 자료 전무 ${noData}행 삭제 + 나머지 LLM 검토(쓸 때 돈다)`,
        );
    }

    // ③ 덮인 등수 되돌림 = 옛 도시 순위표로 기존 등수 도구
    if (hasRanks && rows.some((r) => r.best_rank != null))
      await must(
        `③ 등수 되돌림(${from} 순위표)`,
        repoStep("fillcity/steps/best-ordinal.ts"),
        [`--city-id=${from}`, ...(apply ? ["--apply=true"] : [])],
      );
    else console.log("  ③ 등수 되돌림 = 순위표나 베스트가 없어 건너뜀");

    // ④ 행 이사 = 한 장소씩 붙을 거점으로(좌표 없는 행은 받는 거점)
    const live: any[] = (
      await c.query(
        "SELECT id, address, verified_at IS NOT NULL AS read, latitude::float8 AS lat, longitude::float8 AS lng FROM place_seed_raw WHERE city_id=$1 ORDER BY id",
        [from],
      )
    ).rows;
    const plan = new Map<number, number[]>();
    for (const r of live) {
      const dst =
        r.lat && r.lng
          ? nearestHub(hubs, r.lat, r.lng, countryOfAddress(r.address, r.read))
          : to;
      plan.set(dst, [...(plan.get(dst) ?? []), r.id]);
    }
    console.log(
      `  ④ 행 이사 = ${[...plan].map(([h, ids]) => `${h} ${hubs.find((x) => x.id === h)?.name ?? ""} 로 ${ids.length}행`).join(" · ") || "옮길 행 없음"}`,
    );
    if (apply)
      for (const [h, ids] of plan)
        for (let i = 0; i < ids.length; i += 150)
          await must(
            `④ 행 이동 → ${h}`,
            labStep("worker/lib/services/fill/wrongcity-quarantine.ts"),
            [
              `--ids=${ids.slice(i, i + 150).join(",")}`,
              `--to=${h}`,
              "--apply",
            ],
          );

    // ④-2 같은 구글 장소가 두 행이면 한 행으로(옮겨 간 거점마다)
    for (const h of new Set([to, ...plan.keys()])) await mergeTwins(c, h);

    // ⑤ 여정·가이드·외부 호출 기록의 도시 번호
    if (apply) {
      const stay = (
        await c.query(
          "SELECT count(*)::int n FROM place_seed_raw WHERE city_id=$1",
          [from],
        )
      ).rows[0].n;
      if (stay)
        throw new Error(
          `④ 뒤에도 ${from} 폴더에 행 ${stay}개가 남았다 = 멈춘다`,
        );
      const a = await c.query(
        "UPDATE itineraries SET city_id=$2, updated_at=now() WHERE city_id=$1",
        [from, to],
      );
      const g = await c.query(
        "UPDATE guides SET city_id = COALESCE((SELECT city_id FROM place_seed_raw p WHERE p.id = guides.place_id), $2) WHERE city_id=$1",
        [from, to],
      );
      console.log(
        `  ⑤ 도시 번호 = 여정 ${a.rowCount} · 가이드 ${g.rowCount}(외부 호출 기록은 ⑥ 에서)`,
      );
    } else
      console.log(
        `  ⑤ 도시 번호 = 여정 ${its.length} · 가이드 ${guides.length} · 외부 호출 기록 ${calls}`,
      );

    // ⑥ 저장소 붙이기 + 주소 바꾸기 → ⑦ 옛 주소 0 확인 뒤 옛 R2 폴더 삭제
    await must(
      "⑥ 저장소 붙이기",
      labStep("fillcity/steps/hub-storage-merge.ts"),
      [
        `--from=${from}`,
        `--to=${to}`,
        ...(apply ? ["--apply", "--delete-old"] : []),
      ],
    ).catch((e) => {
      if (apply) throw e;
      console.log(`  ⑥ 저장소 = 행을 옮긴 뒤에 돈다(지금은 DRY)`);
    });

    // ⑦ 옛 도시 행 삭제 = 가리키는 것이 0 일 때만
    if (apply && city) {
      const refs = (
        await c.query(
          "SELECT (SELECT count(*) FROM place_seed_raw WHERE city_id=$1)::int + (SELECT count(*) FROM itineraries WHERE city_id=$1)::int + (SELECT count(*) FROM guides WHERE city_id=$1)::int + (SELECT count(*) FROM external_calls WHERE city_id=$1)::int AS n",
          [from],
        )
      ).rows[0].n;
      const left = ((await listR2(`${from}/`)) as any[]).length;
      if (refs !== 0 || left !== 0)
        throw new Error(
          `옛 도시 ${from} 을 지우지 않음 = 가리키는 것 ${refs} · R2 ${left}개`,
        );
      const d = await c.query(
        "DELETE FROM cities WHERE id=$1 RETURNING id, name",
        [from],
      );
      console.log(
        `  ⑦ 옛 도시 행 삭제 = ${d.rows.map((x: any) => x.id + " " + x.name).join(", ")}`,
      );
    } else
      console.log("  ⑦ 옛 도시 행 삭제(쓸 때 · 가리키는 것 0 · R2 0 확인 뒤)");
  }
  const hub = (
    await c.query(
      "SELECT count(*) FILTER (WHERE status='active')::int active, count(best_rank)::int best FROM place_seed_raw WHERE city_id=$1",
      [to],
    )
  ).rows[0];
  console.log(
    `\n═══ 거점 ${to} 지금 = 활성 ${hub.active} · 베스트 ${hub.best} ═══`,
  );
  await c.end();
  process.exit(0);
})().catch((e) => {
  console.error("✗ 거점 병합 멈춤:", e?.message || e);
  process.exit(1);
});
