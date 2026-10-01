// ⚠️ 수정금지(승인필요) 2026-10-01 사장님 결정 = 필시티 에이전트 명단 내보내기 = 표가 못 정하는 행·장소 아님 남음·같은 장소 쌍·호텔 페이지를 한 파일로 모으고 고정 지시문(04-classify-agent)과 조 나누기·적용 명령을 알려 준다(DB 쓰기 없음) (정본 §)
import fs from "fs";
import path from "path";
import {
  ROOT,
  connectDb,
  latestReport,
  loadEnv,
  parseArgs,
  reportDir,
  stamp,
  AGENT_CHUNK,
} from "./common";

loadEnv();
const argv = parseArgs();
const cityId = Number(argv["city-id"] || 0);

(async () => {
  if (!cityId) {
    console.error("Usage: --city-id=<N>  (먼저 post-read-scan)");
    process.exit(1);
  }
  const scanFile = latestReport(cityId, "scan");
  if (!scanFile) {
    console.error("✗ 읽은 뒤 탐지 결과가 없다 = post-read-scan 을 먼저");
    process.exit(1);
  }
  const scan = JSON.parse(fs.readFileSync(scanFile, "utf-8"));
  const c = await connectDb();
  const ids: number[] = [
    ...scan.undecided.map((x: any) => x.id),
    ...scan.notPlace.map((x: any) => x.id),
    ...scan.dup.flatMap((d: any) => [d.a.id, d.b.id]),
    ...scan.hotelPages.map((x: any) => x.id),
  ];
  const uniq = [...new Set(ids)];
  const info = new Map<number, any>(
    (uniq.length
      ? (
          await c.query(
            `SELECT id, name_en, name_ko, name_local, seed_category AS cat, category_tags AS tags,
                      google_primary_type AS label, address, summary_ko, editorial_summary,
                      google_review_count AS rc, price_eur::float8 AS price
                 FROM place_seed_raw WHERE id = ANY($1::int[])`,
            [uniq],
          )
        ).rows
      : []
    ).map((r: any) => [r.id, r]),
  );
  const full = (id: number) => info.get(id) ?? { id };
  const hotelIds = new Set<number>(scan.hotelPages.map((x: any) => x.id));
  let order = 0;
  const numbered = (list: any[]) => list.map((x) => ({ order: order++, ...x }));
  const rows = {
    undecided: numbered(
      scan.undecided
        .filter((x: any) => !hotelIds.has(x.id))
        .map((x: any) => full(x.id)),
    ),
    nonPlace: numbered(scan.notPlace.map((x: any) => full(x.id))),
    dup: numbered(
      scan.dup.map((d: any) => ({
        meters: d.meters,
        a: full(d.a.id),
        b: full(d.b.id),
      })),
    ),
    hotel: numbered(
      scan.hotelPages.map((x: any) => ({
        ...full(x.id),
        roomRate: x.roomRate,
      })),
    ),
  };
  const total =
    rows.undecided.length +
    rows.nonPlace.length +
    rows.dup.length +
    rows.hotel.length;
  const file = path.join(reportDir(cityId), `${stamp()}_agent-input.json`);
  fs.writeFileSync(
    file,
    JSON.stringify(
      {
        cityId,
        instruction: "fillcity/prompts/04-classify-agent/instruction.txt",
        logs: `docs/raw/${cityId}/*_gmaps-page-read-N.json`,
        sections: rows,
      },
      null,
      2,
    ),
  );
  const agents = total ? Math.ceil(total / AGENT_CHUNK) : 0;
  console.log(
    `═══ 에이전트 명단 city ${cityId} = 표가 못 정하는 행 ${rows.undecided.length} · 장소 아님 남음 ${rows.nonPlace.length} · 같은 장소 쌍 ${rows.dup.length} · 호텔 페이지 ${rows.hotel.length} = 합 ${total}건 → 에이전트 ${agents}명(${AGENT_CHUNK}건씩) → ${path.relative(ROOT, file)} ═══`,
  );
  await c.end();
  process.exit(0);
})().catch((e) => {
  console.error("✗ 에이전트 명단 실패:", e?.message || e);
  process.exit(1);
});
