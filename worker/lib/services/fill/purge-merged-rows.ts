// ⚠️ 수정금지(승인필요) 2026-09-13 사장님 결정 = 병합된 행(merged) 정리 CLI = 엔진 purgeMergedRows 1벌(가진 것을 원행으로 옮기고 삭제) = 시드발굴 v3 ① 백필 뒤·후처리 큐 끝에서 같은 함수를 부른다 (정본 §)
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../../../..");
for (const line of fs
  .readFileSync(path.join(ROOT, ".env"), "utf-8")
  .replace(/^﻿/, "")
  .split(/\r?\n/)) {
  const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
  if (m && !process.env[m[1]])
    process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
}
const cityId = Number(
  process.argv.find((a) => a.startsWith("--city-id="))?.split("=")[1] || 0,
);
const apply = process.argv.includes("--apply");
(async () => {
  const { pool } = await import("../../db");
  const { purgeMergedRows } = await import("../place-upsert");
  const rows = (
    await pool!.query(
      `SELECT m.id, m.merged_into, m.city_id, m.name_en FROM place_seed_raw m JOIN place_seed_raw k ON k.id = m.merged_into AND k.status = 'active' WHERE m.status = 'merged' ${cityId ? "AND m.city_id = $1" : ""} ORDER BY m.id`,
      cityId ? [cityId] : [],
    )
  ).rows;
  console.log(
    `═══ 병합 행 정리 ${cityId ? "city " + cityId : "전체"} = 대상 ${rows.length}행 (${apply ? "APPLY" : "DRY"}) ═══`,
  );
  for (const r of rows)
    console.log(`   #${r.id} ${r.name_en} → 원행 #${r.merged_into}`);
  if (apply && rows.length) {
    const res = await purgeMergedRows(cityId || undefined);
    console.log(`   삭제 ${res.purged}행 (${res.ids.join(",")})`);
  }
  await pool!.end();
})().catch((e) => {
  console.error("ERR", e?.message || e);
  process.exit(1);
});
