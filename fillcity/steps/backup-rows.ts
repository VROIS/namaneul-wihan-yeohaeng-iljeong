// 필시티 v4 = 판을 시작하기 전에 그 거점 폴더의 행 전체와 번역을 파일로 떠 둔다(읽기만 · 되돌림용 · 2026-11-13 베른 판은 백업 없이 돌려 되돌릴 수 없었다) (정본 2026-11-14)
import fs from "fs";
import path from "path";
import {
  connectDb,
  loadEnv,
  parseArgs,
  reportDir,
  stamp,
  stampOf,
} from "./common";

loadEnv();
const argv = parseArgs();
const cityId = Number(argv["city-id"] || 0);
(async () => {
  if (!cityId) {
    console.error("Usage: --city-id=<N> [--since=<판 시작 시각>]");
    process.exit(1);
  }
  const dir = reportDir(cityId);
  const since = argv["since"] ? stampOf(String(argv["since"])) : null;
  const have = fs
    .readdirSync(dir)
    .filter(
      (f) =>
        /_rows-backup\.json$/.test(f) && (!since || f.slice(0, 17) >= since),
    )
    .sort()
    .pop();
  if (have) {
    console.log(`↪ 이어 돌기 = 이 판의 백업이 이미 있다 = ${have}`);
    process.exit(0);
  }
  const c = await connectDb();
  const rows = (
    await c.query(
      "SELECT * FROM place_seed_raw WHERE city_id = $1 ORDER BY id",
      [cityId],
    )
  ).rows;
  const translations = (
    await c.query(
      "SELECT t.* FROM place_translations t JOIN place_seed_raw p ON p.id = t.place_id WHERE p.city_id = $1",
      [cityId],
    )
  ).rows;
  await c.end();
  const out = path.join(dir, `${stamp()}_rows-backup.json`);
  fs.writeFileSync(
    out,
    JSON.stringify({
      cityId,
      at: new Date().toISOString(),
      rows,
      translations,
    }),
  );
  console.log(
    `═══ 백업 city ${cityId} = 행 ${rows.length} · 번역 ${translations.length} → ${out} (${Math.round(fs.statSync(out).size / 1024)}KB) ═══`,
  );
  process.exit(0);
})().catch((e) => {
  console.error("✗ 백업 실패:", e?.message || e);
  process.exit(1);
});
