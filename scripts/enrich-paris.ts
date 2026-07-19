/**
 * ⚠️ 수정금지(승인필요) 2026-05-17 = 파리 DB-only 전환 3 단계 표준화 CLI
 *
 * 사용:
 *   npx tsx scripts/enrich-paris.ts                          # dry-run, batch=40, offset=0
 *   npx tsx scripts/enrich-paris.ts --batch=30 --offset=40   # 다음 batch
 *   npx tsx scripts/enrich-paris.ts --apply                  # DB UPDATE 진행 (= 사용자 명시 후만)
 *
 * = 헌법 §16 = 영구 컴포넌트 (= 다른 도시도 --city=N 으로 동일 호출 보장)
 */

import "dotenv/config";
import * as fs from "fs";
import * as path from "path";
import { loadApiKeysFromDb } from "../server/services/shared/api-keys-loader";
import { enrichPlaceByGemini } from "../server/services/seed/enrich-place";

interface CliArgs {
  city: number;
  batch: number;
  offset: number;
  apply: boolean;
  output?: string;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { city: 19, batch: 40, offset: 0, apply: false };
  for (const a of argv.slice(2)) {
    if (a === "--apply") args.apply = true;
    else if (a.startsWith("--city=")) args.city = Number(a.slice(7));
    else if (a.startsWith("--batch=")) args.batch = Number(a.slice(8));
    else if (a.startsWith("--offset=")) args.offset = Number(a.slice(9));
    else if (a.startsWith("--output=")) args.output = a.slice(9);
  }
  // 기본 출력 파일 = tmp/paris-enrich-batch-<offset>.json (= 사용자 IDE 열기용)
  if (!args.output) args.output = `tmp/paris-enrich-batch-${args.offset}.json`;
  return args;
}

(async () => {
  const args = parseArgs(process.argv);
  const t0 = Date.now();

  console.log("═════════════════════════════════════════════════════════════");
  console.log(`Step 1 = Gemini 호출 (= plan §1) = city ${args.city}`);
  console.log(
    `batch=${args.batch} offset=${args.offset} dryRun=${!args.apply}`,
  );
  console.log("═════════════════════════════════════════════════════════════");

  // = 사용자 SSOT (= 2026-05-17) = "모든 키 = db api_keys 에 다 있음"
  const keysLoaded = await loadApiKeysFromDb();
  console.log(
    `[api_keys] loaded=${keysLoaded.loaded} skipped=${keysLoaded.skipped}`,
  );

  const r = await enrichPlaceByGemini(args.city, {
    batchSize: args.batch,
    offset: args.offset,
    dryRun: !args.apply,
  });

  console.log("");
  console.log(`▶ inputCount = ${r.inputCount}`);
  console.log(`▶ finishReason = ${r.finishReason}`);
  if (r.parseError) console.log(`▶ parseError = ${r.parseError}`);
  console.log(`▶ parsed.places = ${r.parsedPlaces.length}`);
  console.log(
    `▶ missingIds (= 입력에 있는데 응답 없음) = ${r.missingIds.length}`,
  );
  if (r.missingIds.length > 0)
    console.log(`   ${JSON.stringify(r.missingIds)}`);
  console.log(
    `▶ unexpectedIds (= 입력에 없는데 응답에 있음) = ${r.unexpectedIds.length}`,
  );
  if (r.unexpectedIds.length > 0)
    console.log(`   ${JSON.stringify(r.unexpectedIds)}`);
  console.log("");

  if (r.upsertSummary) {
    console.log("▶ upsertSummary:");
    console.log(`  inserted=${r.upsertSummary.inserted}`);
    console.log(`  updated=${r.upsertSummary.updated}`);
    console.log(`  skipped=${r.upsertSummary.skipped}`);
    console.log(`  errors=${r.upsertSummary.errors.length}`);
    if (r.upsertSummary.errors.length > 0) {
      for (const e of r.upsertSummary.errors) console.log(`   - ${e}`);
    }
    console.log("");
  }

  // 파일 저장 (= 사용자 IDE 직접 열기용 = console tail 잘림 방지)
  if (args.output) {
    const outDir = path.dirname(args.output);
    if (outDir && !fs.existsSync(outDir))
      fs.mkdirSync(outDir, { recursive: true });
    const fileBody = {
      meta: {
        cityId: args.city,
        batchSize: args.batch,
        offset: args.offset,
        dryRun: !args.apply,
        finishReason: r.finishReason,
        parseError: r.parseError || null,
        inputCount: r.inputCount,
        parsedCount: r.parsedPlaces.length,
        missingIds: r.missingIds,
        unexpectedIds: r.unexpectedIds,
        upsertSummary: r.upsertSummary || null,
        timestamp: new Date().toISOString(),
      },
      rawResponse: r.rawResponse,
      parsedPlaces: r.parsedPlaces,
    };
    fs.writeFileSync(args.output, JSON.stringify(fileBody, null, 2), "utf8");
    console.log(`📄 파일 저장 = ${args.output} (= IDE 에서 열기)`);
  }

  console.log(`(완료 ${Date.now() - t0}ms)`);

  process.exit(0);
})().catch((e) => {
  console.error("[enrich-paris] ERROR:", e?.message || e);
  console.error(e?.stack || "");
  process.exit(1);
});
