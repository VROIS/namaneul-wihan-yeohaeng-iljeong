// ⚠️ 수정금지(승인필요) 2026-10-29 사장님 결정 = Clef 시뮬레이션 = 지난 최종 점검 판정과 채점(질문·재료 = clef-gate 1벌), 쓰기 0 (정본 Clef)
import fs from "fs";
import path from "path";
import { connectDb, loadEnv, parseArgs, reportDir, stamp } from "./common";
import { lastGoogleLogs } from "../../worker/lib/services/shared/local-paths";
import {
  clefDecide,
  type ClefAnswer,
  type ClefModel,
} from "../../worker/lib/services/shared/clef-client";
import { QUESTIONS, geminiEnrichOf, loadClefKeys, stateOf } from "./clef-gate";

type Row = Record<string, any>;

interface SimRow {
  id: number;
  name: string;
  page: boolean;
  gemini: boolean;
  label: {
    keep: boolean;
    category: string;
    delete: boolean;
    status: string;
    textFixed: boolean;
    priceFixed: boolean;
  };
  answers: Record<string, ClefAnswer>;
}

function bucket(p: number): string {
  return p >= 0.9
    ? "0.9~1"
    : p >= 0.7
      ? "0.7~0.9"
      : p >= 0.5
        ? "0.5~0.7"
        : p >= 0.3
          ? "0.3~0.5"
          : "0~0.3";
}

function grade(rows: SimRow[]) {
  const keep: Record<string, { n: number; keep: number }> = {};
  for (const r of rows) {
    const b = bucket(r.answers.experience?.noul ?? 0);
    keep[b] = keep[b] || { n: 0, keep: 0 };
    keep[b].n++;
    if (r.label.keep) keep[b].keep++;
  }
  const rate = (f: (r: SimRow) => boolean) =>
    rows.length ? +(rows.filter(f).length / rows.length).toFixed(3) : 0;
  return {
    rows: rows.length,
    labelKeep: rows.filter((r) => r.label.keep).length,
    experienceBuckets: keep,
    categoryAgree: rate((r) => r.answers.category?.choice === r.label.category),
    statusAgree: rate((r) => r.answers.status?.choice === r.label.status),
    deleteAgree: rate(
      (r) => (r.answers.not_a_place?.noul ?? 0) >= 0.5 === r.label.delete,
    ),
    textAgree: rate(
      (r) => (r.answers.text_fits?.noul ?? 1) < 0.5 === r.label.textFixed,
    ),
    priceAgree: rate(
      (r) => (r.answers.price_fits?.noul ?? 1) < 0.5 === r.label.priceFixed,
    ),
  };
}

async function simulate(
  cityId: number,
  checkDir: string,
  model: ClefModel,
  limit: number,
): Promise<void> {
  const before = path.basename(checkDir).replace("final-check-", "");
  const verdicts = new Map<string, any>();
  for (const f of fs
    .readdirSync(checkDir)
    .filter((f) => /^verdict-\d+\.json$/.test(f)))
    for (const v of JSON.parse(
      fs.readFileSync(path.join(checkDir, f), "utf-8"),
    ))
      verdicts.set(String(v.cid), v);
  const table = JSON.parse(
    fs.readFileSync(path.join(checkDir, "final-table.json"), "utf-8"),
  );
  const atCheck = new Map<string, any>(
    (table.mismatch || []).map((m: any) => [String(m.cid), m]),
  );
  const pages = lastGoogleLogs(cityId);
  const gem = geminiEnrichOf(cityId, before);

  const c = await connectDb();
  const rows: Row[] = (
    await c.query(
      `SELECT *, substring(google_maps_uri from 'cid=([0-9]+)') AS cid, price_eur::float8 AS price_eur
         FROM place_seed_raw WHERE city_id=$1 AND google_maps_uri LIKE '%cid=%'`,
      [cityId],
    )
  ).rows;
  await c.end();

  const out: SimRow[] = [];
  const todo = rows.filter((r) => verdicts.has(String(r.cid))).slice(0, limit);
  for (const r of todo) {
    const v = verdicts.get(String(r.cid));
    const fix = v.fix || {};
    const was = atCheck.get(String(r.cid));
    const pre: Row = {
      ...r,
      seed_category:
        was?.cat ?? (fix.seed_category ? undefined : r.seed_category),
      price_eur: was?.price ?? r.price_eur,
      category_tags: [
        ...((r.category_tags || []) as string[]).filter(
          (t) => !(fix.tags || []).includes(t),
        ),
        ...(fix.remove_tags || []),
      ],
      business_status: fix.business_status ? "OPERATIONAL" : r.business_status,
      summary_ko: fix.summary_ko
        ? (gem.get(r.id)?.summary_ko ?? null)
        : r.summary_ko,
      editorial_summary: fix.editorial_summary
        ? (gem.get(r.id)?.editorial_summary ?? null)
        : r.editorial_summary,
    };
    const answers = await clefDecide(
      stateOf(pre, pages.get(r.id), gem.get(r.id)),
      QUESTIONS,
      { model, contextId: cityId, rawTag: `clef-sim-${r.id}` },
    );
    out.push({
      id: r.id,
      name: r.name_en,
      page: pages.has(r.id),
      gemini: gem.has(r.id),
      label: {
        keep: !!v.keep,
        category: fix.seed_category || pre.seed_category,
        delete: !!v.delete,
        status: fix.business_status || r.business_status || "OPERATIONAL",
        textFixed: !!(fix.summary_ko || fix.editorial_summary),
        priceFixed: fix.price_eur != null,
      },
      answers,
    });
    process.stdout.write(".");
  }
  const result = { cityId, checkDir, model, grade: grade(out), rows: out };
  const file = path.join(
    reportDir(cityId),
    `${stamp()}_clef-sim-${model}.json`,
  );
  fs.writeFileSync(file, JSON.stringify(result, null, 2));
  console.log(`\n✓ ${cityId} ${model} ${out.length}행 → ${file}`);
  console.log(JSON.stringify(result.grade, null, 1));
}

async function main(): Promise<void> {
  loadEnv();
  const args = parseArgs();
  await loadClefKeys();
  if (!args.simulate)
    throw new Error("[clef-judge] 지금은 --simulate=<최종 점검 폴더> 만");
  await simulate(
    Number(args["city-id"]),
    path.resolve(args.simulate),
    args.model === "clef-flash" ? "clef-flash" : "clef",
    Number(args.limit || 100000),
  );
}

void main();
