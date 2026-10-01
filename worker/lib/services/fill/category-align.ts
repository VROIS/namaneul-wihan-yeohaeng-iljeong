// ⚠️ 수정금지(승인필요) 2026-09-30 사장님 결정 = 분류 정렬 = 구글 분류 글자(google_primary_type)가 이미 있는 행을 페이지 안 열고(0원) finalCategory 1벌로 확정 = 장소 아님 → 삭제(껍데기 0) · 구글이 이김 · 핫스팟은 태그로 · 표에 없는 글자는 산출표 "새 글자"로 (정본 §)
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { finalCategory } from "../shared/place-category-map";
import { fileStamp } from "../../../../shared/r2-paths";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../../..");
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
    .map(([k, v]) => [k, v ?? "true"]),
);
const cityId = Number(argv["city-id"] || 0);
const apply = argv["apply"] === "true";
const TAG = `category-align-${new Date().toISOString().slice(0, 10)}`;

(async () => {
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
  const { deletePlaceRow, upsertPlace } = await import("../place-upsert");
  const city = (
    await c.query("SELECT name_en FROM cities WHERE id=$1", [cityId])
  ).rows[0];
  const rows: {
    id: number;
    name_en: string;
    seed_category: string;
    google_primary_type: string;
    category_tags: string[] | null;
  }[] = (
    await c.query(
      `SELECT id, name_en, seed_category, google_primary_type, category_tags, google_review_count AS rc, (best_rank IS NOT NULL) AS best
         FROM place_seed_raw
        WHERE city_id=$1 AND status <> 'merged' AND seed_category NOT LIKE 'bts_%' AND google_primary_type IS NOT NULL
        ORDER BY id`,
      [cityId],
    )
  ).rows;
  const changed: any[] = [];
  const deleted: any[] = [];
  const unknown = new Map<string, number>();
  for (const r of rows) {
    const fc = finalCategory(r.seed_category, r.google_primary_type, {
      reviewCount: (r as any).rc,
      best: (r as any).best,
    });
    if (fc.notPlace) {
      deleted.push({
        id: r.id,
        name: r.name_en,
        label: r.google_primary_type,
        was: r.seed_category,
      });
      continue;
    }
    if (fc.unknownLabel) {
      unknown.set(
        r.google_primary_type,
        (unknown.get(r.google_primary_type) || 0) + 1,
      );
      continue;
    }
    if (fc.changed)
      changed.push({
        id: r.id,
        name: r.name_en,
        label: r.google_primary_type,
        from: r.seed_category,
        to: fc.cat,
        hotspotTag: fc.hotspotTag,
      });
  }
  console.log(
    `═══ 분류 정렬 city ${cityId} ${city?.name_en} = 구글 분류 있는 행 ${rows.length} · 바꿀 ${changed.length} · 삭제(장소 아님) ${deleted.length} · 표에 없는 글자 ${unknown.size}종 · ${apply ? "APPLY" : "DRY"} · 유료 0 ═══`,
  );
  for (const d of deleted)
    console.log(`  🗑 #${d.id} ${d.name} (${d.label}, ${d.was})`);
  for (const x of changed)
    console.log(
      `  ✎ #${x.id} ${x.name} ${x.from} → ${x.to} (${x.label})${x.hotspotTag ? " +핫스팟 태그" : ""}`,
    );
  for (const [g, n] of [...unknown].sort((a, b) => b[1] - a[1]))
    console.log(`  ? 표에 없음 ${n}행: ${g}`);

  if (apply) {
    for (const d of deleted) await deletePlaceRow(d.id);
    for (const x of changed) {
      const r = await upsertPlace({
        targetRowId: x.id,
        cityId,
        seedCategory: x.to,
        overwriteSeedCategory: true,
        nameEn: x.name,
        categoryTags: x.hotspotTag ? ["hotspot"] : undefined,
        phaseTags: [TAG],
      });
      if (r.action !== "updated")
        console.log(`  ⚠️ #${x.id} 쓰기 이상: ${r.action} ${r.reason ?? ""}`);
    }
  }
  const dir = path.join(ROOT, "docs", "b1-reports", String(cityId));
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${fileStamp()}_category-align.json`);
  fs.writeFileSync(
    file,
    JSON.stringify(
      {
        cityId,
        city: city?.name_en,
        apply,
        changed,
        deleted,
        unknownLabels: Object.fromEntries(unknown),
      },
      null,
      2,
    ),
  );
  console.log(`═══ 분류 정렬 끝 · 산출표 ${path.relative(ROOT, file)} ═══`);
  await c.end();
  const { pool } = await import("../../db");
  await pool?.end();
  process.exit(0);
})().catch((e) => {
  console.error("✗ 분류 정렬 실패:", e?.message || e);
  process.exit(1);
});
