// = 창고 = R2 단독(2026-08-07 사장님 "비워" = SP 창고 철거 1-5b. 옛 storage.objects SQL·SP 공개 URL 경로 완전 삭제 §19).
import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";
import { listR2, getR2PublicUrl } from "../shared/r2-client";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../..");
const PREFIX = "place-images"; // R2 키 = place-images/{cityId}/{cat}/{pid}.{ext} (옛 SP 버킷명 = R2 프리픽스 1:1)

export async function relinkStorageImages(opts: {
  cityId: number;
  apply: boolean;
  client: any;
  categories?: string[];
}): Promise<{
  relinkable: number;
  relinked: number;
  matchedIds: Set<number>;
  byCat: Record<string, { hit: number; linked: number; miss: number }>;
}> {
  const { cityId, apply, client: c } = opts;
  const useCat = !!(opts.categories && opts.categories.length > 0);
  const params: any[] = [cityId];
  if (useCat) params.push(opts.categories);
  const rows = (
    await c.query(
      `
    SELECT p.id, p.seed_category AS cat, p.name_en, p.name_local, p.google_place_id AS pid, p.rank, p.image_url AS cur_url
    FROM place_seed_raw p
    WHERE p.city_id = $1 AND p.google_place_id IS NOT NULL${useCat ? " AND p.seed_category = ANY($2::text[])" : ""}
  `,
      params,
    )
  ).rows;

  const objects = await listR2(`${PREFIX}/${cityId}/`);
  const byPid = new Map<string, string[]>();
  for (const o of objects) {
    const m = o.key.match(/^place-images\/\d+\/[^/]+\/(.+)\.[^.]+$/);
    if (!m) continue;
    const arr = byPid.get(m[1]) || [];
    arr.push(o.key);
    byPid.set(m[1], arr);
  }
  const findObj = (pid: string, cat: string): string | null => {
    const keys = byPid.get(pid);
    if (!keys?.length) return null;
    return (
      keys.find((k) => k.startsWith(`${PREFIX}/${cityId}/${cat}/`)) ||
      [...keys].sort()[0]
    );
  };

  // ⚠️ 수정금지(승인필요) 2026-06-14 사용자 SSOT = "구글이미지(창고 PID) 있으면 무조건 교체" (= PM 비용 절감 핵심).
  const withObj = rows.map((r: any) => ({ ...r, obj: findObj(r.pid, r.cat) }));
  const hasStorage = withObj.filter((r: any) => r.obj);
  const hits = hasStorage.filter(
    (r: any) => r.cur_url !== getR2PublicUrl(r.obj),
  );

  const hitIds = new Set<number>(hits.map((r: any) => r.id));
  const byCat: Record<string, { hit: number; linked: number; miss: number }> =
    {};
  for (const r of withObj) {
    byCat[r.cat] ??= { hit: 0, linked: 0, miss: 0 };
    if (!r.obj) byCat[r.cat].miss++;
    else if (hitIds.has(r.id)) byCat[r.cat].hit++;
    else byCat[r.cat].linked++;
  }
  const matchedIds = new Set<number>(hasStorage.map((r: any) => r.id));
  if (!apply)
    return { relinkable: hits.length, relinked: 0, matchedIds, byCat };

  const { upsertPlace } = await import(
    pathToFileURL(path.join(ROOT, "server/services/place-upsert.ts")).href
  );
  let ok = 0;
  for (const r of hits) {
    try {
      // ⚠️ 수정금지(승인필요) 2026-08-26 사장님 승인 = 행 확정(r.id) 직행 + followTriggerDup = 이미지 1칸 쓰기 = 식별컬럼 무변경 = 정식 면제
      const res = await upsertPlace({
        targetRowId: r.id,
        followTriggerDup: true,
        cityId,
        seedCategory: r.cat,
        nameEn: r.name_en,
        googlePlaceId: r.pid,
        imageUrl: getR2PublicUrl(r.obj),
      });
      if (res.action === "updated" || res.action === "inserted") ok++;
    } catch {}
  }
  return { relinkable: hits.length, relinked: ok, matchedIds, byCat };
}

if (
  (process.argv[1] || "")
    .replace(/\\/g, "/")
    .endsWith("fill/storage-image-relink.ts")
) {
  (async () => {
    process.chdir(ROOT);
    const envRaw = fs.readFileSync(".env", "utf-8").replace(/^﻿/, "");
    for (const line of envRaw.split(/\r?\n/)) {
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
    const cityId = Number(argv["city-id"] || 0);
    const apply = argv["apply"] === "true";
    if (!cityId) {
      console.error("Usage: --city-id=<N> [--apply]");
      process.exit(1);
    }
    const pg = await import("pg");
    const c = new (pg as any).default.Client({
      connectionString: process.env.SUPA_URL || process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false },
    });
    await c.connect();
    const r = await relinkStorageImages({ cityId, apply, client: c });
    console.log(
      `═══ storage-image-relink (city ${cityId}) = 재링크 ${apply ? r.relinked : "(dry)"} / 가능 ${r.relinkable} ═══`,
    );
    for (const [k, v] of Object.entries(r.byCat).sort())
      console.log(
        `  ${k}: 교체대상 ${v.hit} / 이미정상 ${v.linked} / PM필요 ${v.miss}`,
      );
    if (!apply) console.log(`\n=== DRY (--apply 로 재링크) ===`);
    await c.end();
  })();
}
