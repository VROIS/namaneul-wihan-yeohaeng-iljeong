// ⚠️ 수정금지(승인필요) 2026-09-29 사장님 결정 = 앞 도시 다시 정제(--rebest) = ③ 앞에서 그 도시 베스트 번호를 비우고(옛 판이 잘못 붙인 표로 부풀려진 것 제거 · 비우기 전 값은 보고서 폴더에 남김), ③ 뒤에서 흡수할 행의 번역 중 남는 무리 언어 밖 것을 지운다(잘못 붙었던 가게 설명). 그다음 ④ 가 받아 둔 제미니 원본으로 다시 입힌다 = 제미니 재호출 0 (정본 §)
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { latestVersioned } from "../../worker/lib/services/shared/raw-filename";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
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
const step = String(argv["step"] || "");
const apply = argv["apply"] === "true";

(async () => {
  if (!cityId || !["reset", "clean-tr"].includes(step)) {
    console.error("Usage: --city-id=<N> --step=reset|clean-tr [--apply]");
    process.exit(1);
  }
  const dir = path.join(ROOT, "docs", "b1-reports", String(cityId));
  const pg = await import("pg");
  const c = new (pg as any).default.Client({
    connectionString: process.env.SUPA_URL || process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();
  if (step === "reset") {
    const before = (
      await c.query(
        "SELECT id, name_en, best_rank FROM place_seed_raw WHERE city_id = $1 AND best_rank IS NOT NULL AND seed_category NOT LIKE 'bts_%' ORDER BY id",
        [cityId],
      )
    ).rows;
    console.log(
      `═══ 베스트 비우기 city ${cityId} = ${before.length}행 ${apply ? "(APPLY)" : "(DRY)"} ═══`,
    );
    if (apply && before.length) {
      fs.mkdirSync(dir, { recursive: true });
      const file = path.join(
        dir,
        `${new Date().toISOString().slice(0, 19).replace("T", "_").replace(/:/g, "")}_best-before.json`,
      );
      fs.writeFileSync(file, JSON.stringify(before, null, 2));
      await c.query("BEGIN");
      await c.query("SELECT set_config('app.skip_dup_check', 'on', true)");
      await c.query(
        "UPDATE place_seed_raw SET best_rank = NULL WHERE city_id = $1 AND best_rank IS NOT NULL AND seed_category NOT LIKE 'bts_%'",
        [cityId],
      );
      await c.query("RESET app.skip_dup_check");
      await c.query("COMMIT");
      console.log(`  비우기 전 값 = ${file}`);
    }
  } else {
    const files = fs.existsSync(dir)
      ? fs
          .readdirSync(dir)
          .filter((f) => /_b1-discovery-diff(_\d+)?\.json$/.test(f))
      : [];
    if (!files.length) {
      console.error(`✗ ${dir} 에 산출표 없음`);
      process.exit(1);
    }
    const latest = files.sort().reverse()[0];
    const chosen =
      latestVersioned(dir, latest.replace(/_\d+\.json$/, ".json")) || latest;
    const rep = JSON.parse(fs.readFileSync(path.join(dir, chosen), "utf-8"));
    let n = 0;
    for (const k of ["landmarks", "restaurants"])
      for (const x of rep.report[k].confirm) {
        const keep = [...new Set(x.copies.map((cp: any) => cp.lang))].filter(
          (l) => l !== "ko",
        );
        const q = `FROM place_translations WHERE place_id = $1 AND NOT (language = ANY($2::text[]))`;
        const rows = (
          await c.query(`SELECT language ${q}`, [x.psrHint.psrId, keep])
        ).rows;
        if (!rows.length) continue;
        n += rows.length;
        console.log(
          `  #${x.psrHint.psrId} ${x.psrHint.psrName}: ${rows.map((r: any) => r.language).join(",")} 지움 (남는 무리 언어 ${keep.join(",")})`,
        );
        if (apply) await c.query(`DELETE ${q}`, [x.psrHint.psrId, keep]);
      }
    console.log(
      `═══ 오염 번역 ${n}줄 ${apply ? "지움" : "(DRY)"} = 산출표 ${chosen} ═══`,
    );
  }
  await c.end();
})().catch((e) => {
  console.error("✗", e?.message || e);
  process.exit(1);
});
