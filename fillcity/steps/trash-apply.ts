// 필시티 v4 = 사장님이 지우라고 정한 행(결정 파일 *_boss-fix.json)을 지우기 전에 그 장소의 구글 번호(CID·PID)를 "지운 장소 장부"(docs/b1-reports/{도시}/deleted-places.json)에 적는다 → 목록 선별·모험 단계가 이 장부를 보고 같은 장소를 다시 넣지 않는다 · 삭제 자체는 기존 길(llm-review --apply) (정본 2026-11-14)
import fs from "fs";
import path from "path";
import {
  ROOT,
  connectDb,
  loadEnv,
  parseArgs,
  reportDir,
  runTsx,
} from "./common";

export type Deleted = {
  cid: string | null;
  pid: string | null;
  name: string;
  at: string;
  reason: string;
};
export const deletedPath = (cityId: number) =>
  path.join(reportDir(cityId), "deleted-places.json");
/** 그 도시의 지운 장소 장부(없으면 빈 목록). */
export function readDeleted(cityId: number): Deleted[] {
  const p = deletedPath(cityId);
  return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, "utf-8")) : [];
}

if (process.argv[1] && /trash-apply\.ts$/.test(process.argv[1]))
  (async () => {
    loadEnv();
    const argv = parseArgs();
    const cityId = Number(argv["city-id"] || 0);
    const file = String(argv["file"] || "");
    if (!cityId || !file || !fs.existsSync(file)) {
      console.error("Usage: --city-id=<N> --file=<결정 파일 *_boss-fix.json>");
      process.exit(1);
    }
    const verdicts: any[] = JSON.parse(fs.readFileSync(file, "utf-8")).filter(
      (v: any) => !v.fix,
    );
    const c = await connectDb();
    const rows: any[] = (
      await c.query(
        "SELECT id, name_en, google_place_id pid, substring(google_maps_uri from 'cid=([0-9]+)') cid FROM place_seed_raw WHERE id = ANY($1::int[])",
        [verdicts.map((v) => Number(v.id))],
      )
    ).rows;
    await c.end();
    const book = readDeleted(cityId);
    const at = new Date().toISOString();
    let added = 0;
    for (const r of rows) {
      if (!r.cid && !r.pid) continue;
      if (
        book.some(
          (b) => (r.cid && b.cid === r.cid) || (r.pid && b.pid === r.pid),
        )
      )
        continue;
      book.push({
        cid: r.cid ?? null,
        pid: r.pid ?? null,
        name: r.name_en,
        at,
        reason: String(
          verdicts.find((v) => Number(v.id) === r.id)?.reason ?? "",
        ),
      });
      added++;
    }
    fs.writeFileSync(deletedPath(cityId), JSON.stringify(book, null, 2));
    console.log(
      `═══ 지운 장소 장부 city ${cityId} = 이번에 적은 곳 ${added} · 장부 전체 ${book.length} · 지울 행 ${rows.length}/${verdicts.length} ═══`,
    );
    if (!rows.length) process.exit(0);
    process.exit(
      await runTsx(path.join(ROOT, "fillcity/steps/llm-review.ts"), [
        `--city-id=${cityId}`,
        `--apply=${file}`,
      ]),
    );
  })().catch((e) => {
    console.error("✗ 쓰레기 행 삭제 실패:", e?.message || e);
    process.exit(1);
  });
