// ⚠️ 수정금지(승인필요) 2026-10-06 사장님 결정 = ④ 뒤 못 찾은 베스트 = 장부의 거부(제미니 힌트 통째)를 일꾼 4명이 사람처럼 구글맵에서 찾아 CID 를 돌려주면, 창고에 그 CID 행이 있으면 흡수(베스트 언어·번역·제미니 몫) · 없으면 upsertPlace 로 넣고 직행 읽기 엔진이 그 행만 1번 열어 9요소를 채운다 (정본 §)
import fs from "fs";
import path from "path";
import {
  ROOT,
  AGENT_WORKERS,
  connectDb,
  ledgerPath,
  loadEnv,
  parseArgs,
  readLedger,
  reportDir,
  runAgents,
  shareRanges,
  stamp,
  type Ledger,
  type LedgerEntry,
} from "./common";
import {
  codeOf,
  inTxn,
  kindWordOf,
  loadPriceCtx,
  newStat,
  upsertTranslations,
} from "../../worker/lib/services/fill/gmaps-shared";
import { absorbInto } from "../../worker/lib/services/fill/gmaps-absorb";
import { decidePrice } from "../../worker/lib/services/shared/price-eur";
import { upsertPlace } from "../../worker/lib/services/place-upsert";

loadEnv();
const argv = parseArgs();
const cityId = Number(argv["city-id"] || 0);
const apply = argv["apply"] === "true";
const since = argv["since"] ? Date.parse(String(argv["since"])) : 0;
const INSTRUCTION = path.join(
  ROOT,
  "fillcity/prompts/07-find-best/instruction.txt",
);
const TAG = `find-best-${new Date().toISOString().slice(0, 10)}`;

type Found = {
  order: number;
  name_en: string;
  found: boolean;
  google_name?: string;
  cid?: string;
  reviews?: number;
  label?: string;
  query_used?: string;
  note?: string;
};

(async () => {
  if (!cityId) {
    console.error("Usage: --city-id=<N> [--since=<ISO 시각>] [--apply]");
    process.exit(1);
  }
  const ledger: Ledger = readLedger(cityId);
  const targets: (LedgerEntry & { key: string })[] = Object.entries(ledger)
    .filter(
      ([, e]) =>
        e.verdict === "rejected" && e.entry && Date.parse(e.at) >= since,
    )
    .map(([key, e]) => ({ ...e, key }));
  if (!targets.length) {
    console.log(
      `═══ 못 찾은 베스트 city ${cityId} = 장부에 거부 0 = 일꾼 안 띄움 ═══`,
    );
    process.exit(0);
  }
  const dir = path.join(reportDir(cityId), `find-best-${stamp()}`);
  fs.mkdirSync(dir, { recursive: true });
  const items = targets.map((t, order) => {
    const n = t.entry;
    const ko = (n.copies ?? []).find((x: any) => x.lang === "ko");
    return {
      order,
      key: t.key,
      name_en: n.name,
      name_local: n.nameLocal ?? null,
      name_ko: n.nameKo ?? null,
      kind: n.cat,
      kind_word: kindWordOf(n.cat),
      lat: n.lat,
      lng: n.lng,
      address: n.address ?? null,
      langs: n.langs,
      what_to_do_ko: ko?.summary ?? null,
      code_tried: t.why,
      code_page: t.pageName ?? null,
    };
  });
  const listFile = path.join(dir, "list.json");
  fs.writeFileSync(listFile, JSON.stringify({ cityId, items }, null, 2));
  const ranges = shareRanges(items.length);
  console.log(
    `═══ 못 찾은 베스트 city ${cityId} = 장부 거부 ${items.length}곳 → 일꾼 ${ranges.length}명(${AGENT_WORKERS}명 균등, 동시) → ${path.relative(ROOT, dir)} ═══`,
  );
  for (const x of items)
    console.log(
      `  [${x.langs}] ${x.name_en} (${x.kind}) · 코드 = ${x.code_tried}`,
    );
  if (!apply) {
    console.log("DRY = --apply 로 일꾼을 띄우고 찾은 CID 를 창고에 넣는다");
    process.exit(0);
  }
  await runAgents({
    label: "find",
    instruction: INSTRUCTION,
    ranges,
    promptOf: (j) =>
      [
        `- 명단 파일 = ${listFile}`,
        `- 네게 배정된 순서 = 명단 항목의 order 값이 ${j.from}부터 ${j.to}까지(끝 번호 포함, 도시 번호 ${cityId}, 조 번호 ${j.k})`,
        `- 결과 폴더 = ${dir}`,
      ].join("\n"),
    doneOf: (j) => fs.existsSync(path.join(dir, `result-${j.k}.json`)),
    dir,
  });
  const byOrder = new Map<number, Found>();
  for (const j of ranges) {
    const f = path.join(dir, `result-${j.k}.json`);
    if (!fs.existsSync(f)) continue;
    try {
      const arr: Found[] = JSON.parse(fs.readFileSync(f, "utf-8"));
      for (const r of Array.isArray(arr) ? arr : [])
        if (Number.isInteger(r.order) && r.order >= j.from && r.order <= j.to)
          byOrder.set(r.order, r);
    } catch (e: any) {
      console.log(`  ✘ result-${j.k}.json 읽기 실패: ${e?.message || e}`);
    }
  }
  const found = items.filter(
    (x) =>
      byOrder.get(x.order)?.found &&
      /^\d+$/.test(String(byOrder.get(x.order)?.cid || "")),
  );
  console.log(
    `\n일꾼 결과 = ${items.length}곳 중 찾음 ${found.length} · 못 찾음 ${items.length - found.length}`,
  );
  if (!found.length) process.exit(0);

  const c = await connectDb();
  const { writeBestRankUnion } = await import(
    "../../worker/lib/services/shared/best-rank"
  );
  const made: number[] = [];
  for (const x of found) {
    const r = byOrder.get(x.order)!;
    const n = ledger[x.key].entry;
    const uri = `https://maps.google.com/?cid=${r.cid}`;
    const code = codeOf(n.name, n.langs, n.copies ?? []);
    const exist = (
      await c.query(
        `SELECT id, name_en, seed_category, category_tags, status FROM place_seed_raw WHERE city_id=$1 AND google_maps_uri LIKE $2 AND merged_into IS NULL LIMIT 1`,
        [cityId, `%cid=${r.cid}`],
      )
    ).rows[0];
    const ko = (n.copies ?? []).find((t: any) => t.lang === "ko");
    if (exist) {
      // ⚠️ 수정금지(승인필요) 2026-10-07 사장님 결정 = 창고에 그 CID 행이 있으면 흡수 도구 1벌(gmaps-absorb absorbInto)로 합친다 = 제미니 몫·가격 결정·베스트 언어·번역이 ④ 흡수와 같은 길 · gmaps-shared 부품은 정적 import 한 번 (정본 §)
      const stat = newStat();
      await absorbInto(
        c,
        upsertPlace,
        {
          ...n,
          psrHint: {
            psrId: exist.id,
            psrName: exist.name_en,
            psrCat: exist.seed_category,
            psrTags: exist.category_tags ?? null,
          },
        },
        { cityId, provenanceTag: TAG },
        stat,
      );
      if (stat.absorbedHint)
        ledger[x.key] = {
          ...ledger[x.key],
          verdict: "worker-absorbed",
          rowId: exist.id,
          cid: String(r.cid),
          at: new Date().toISOString(),
        };
      continue;
    }
    const res = await upsertPlace({
      cityId,
      seedCategory: n.cat,
      nameEn: r.google_name || n.name,
      nameKo: n.nameKo ?? null,
      nameLocal: n.nameLocal ?? null,
      latitude: n.lat,
      longitude: n.lng,
      address: n.address ?? null,
      googleMapsUri: uri,
      // 가격 결정 1벌(제미니 값 그대로, 0 = 무료 · 없으면 비움) = 이 행은 바로 뒤 직행 읽기가 페이지 값으로 다시 정한다
      priceEur: decidePrice({
        geminiPrice: n.avgPrice ?? null,
        pageOpened: false,
      }).price,
      selectionReasonKo: ko?.summary || null,
      shortformKo: ko?.editorial || null,
      categoryTags: [n.cat],
      phaseTags: [TAG],
    });
    if (!res.rowId) {
      console.log(
        `  ⚠️ 넣기 이상(${res.action} ${res.reason ?? ""}): ${n.name}`,
      );
      continue;
    }
    const br = await inTxn(c, async () => {
      const b = await writeBestRankUnion(c, res.rowId!, code);
      await upsertTranslations(c, res.rowId!, n.copies ?? []);
      return b;
    });
    ledger[x.key] = {
      ...ledger[x.key],
      verdict: "worker-inserted",
      rowId: res.rowId,
      cid: String(r.cid),
      at: new Date().toISOString(),
    };
    made.push(res.rowId);
    console.log(
      `  ✅ #${res.rowId} ${r.google_name || n.name} ← ${n.name} (${res.action} · 후기 ${r.reviews ?? "-"} · ${r.label ?? "-"} · best_rank ${br.cur} ∪ ${code} → ${br.result})`,
    );
  }
  fs.writeFileSync(ledgerPath(cityId), JSON.stringify(ledger, null, 2));
  if (made.length) {
    const { chromium } = await import("playwright");
    const { launchBrowser } = await import(
      "../../worker/lib/services/fill/gmaps-pid-identity/page-reader"
    );
    const { PID_ROWS_SELECT, verifyPidRows } = await import(
      "../../worker/lib/services/fill/gmaps-pid-identity/run"
    );
    const { r2PrefixOf } = await import(
      "../../worker/lib/services/fill/gmaps-post"
    );
    const { distanceKmFromCoords } = await import(
      "../../worker/lib/services/shared/geo-distance"
    );
    const { PHOTO_MAX_WIDTH_PX } = await import(
      "../../worker/lib/services/shared/ts-client"
    );
    const city = (
      await c.query(
        "SELECT name_en, latitude::float8 AS lat, longitude::float8 AS lng FROM cities WHERE id=$1",
        [cityId],
      )
    ).rows[0];
    const rows = (
      await c.query(
        `${PID_ROWS_SELECT} WHERE city_id=$1 AND id = ANY($3::int[]) ORDER BY id`,
        [cityId, r2PrefixOf(process.env.R2_PUBLIC_URL), made],
      )
    ).rows;
    const priceCtx = await loadPriceCtx(c, cityId);
    const browser = await launchBrowser(chromium);
    try {
      await verifyPidRows({
        browser,
        rows,
        city,
        lang: "en",
        photoWidth: PHOTO_MAX_WIDTH_PX,
        distanceKmFromCoords,
        upsertPlace,
        client: c,
        cityId,
        apply: true,
        writeCtx: { ...priceCtx },
        onResult: (x: any) =>
          console.log(
            `  ${x.gate} #${x.id} ${x.name_en} rc=${x.rc_page ?? "-"} ${x.photo_url ? "사진" : "사진없음"} ${x.upsert || ""}`,
          ),
      });
    } finally {
      await browser.close().catch(() => {});
    }
  }
  const after = (
    await c.query(
      `SELECT id, name_en, name_local, seed_category, best_rank, google_review_count rc, google_primary_type gt, status FROM place_seed_raw WHERE id = ANY($1::int[]) ORDER BY id`,
      [
        found
          .map((x) => ledger[x.key].rowId)
          .filter((v): v is number => typeof v === "number"),
      ],
    )
  ).rows;
  console.log("\n쓴 뒤 SELECT:");
  for (const r of after)
    console.log(
      `  #${r.id} ${r.name_en} · ${r.name_local ?? "-"} · ${r.seed_category} · best ${r.best_rank} · 후기 ${r.rc ?? "-"} · ${r.gt ?? "-"} · ${r.status}`,
    );
  await c.end();
  const { pool } = await import("../../worker/lib/db");
  await pool?.end?.();
  console.log(
    `═══ 못 찾은 베스트 끝 = 찾음 ${found.length} / ${items.length} · 새 행 ${made.length} · 장부 = ${path.relative(ROOT, ledgerPath(cityId))} ═══`,
  );
  process.exit(0);
})().catch((e) => {
  console.error("✗ 못 찾은 베스트 실패:", e?.message || e);
  process.exit(1);
});
