//   예외 1벌 = 문지기 판정 뒤·산출표 앞의 등급조정(regrade) v3 후처리(2026-08-29 사장님 결정, discovery-regrade.ts).
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
// ⚠️ 수정금지(승인필요) 2026-08-28 사장님 승인 = 산출표 저장(mkdir+versionedName+쓰기) 1벌 = saveVersionedReport()
import {
  rawDate,
  saveVersionedReport,
} from "../../server/services/shared/raw-filename";
// ⚠️ 수정금지(승인필요) 2026-08-29 사장님 승인 = 7개 언어 목록·순서 1벌(§16)
import { LANGS } from "../../server/services/shared/language-instruction";
import {
  PSR_COLS,
  regradeStaged,
  type Bucket,
  type PsrRow,
  type Staged,
} from "./discovery-regrade";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");
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
if (!cityId) {
  console.error(
    "Usage: npx tsx fillcity/steps/discovery-merge-diff.ts --city-id=<N>   (DRY 전용, DB 쓰기 0)",
  );
  process.exit(1);
}

const RESTAURANT_MIN_LANGS = 4; // 사장님 확정 2026-08-26 = 7개국어 중 과반(4+)
// ⚠️ 수정금지(승인필요) 2026-08-27 사장님 확정, 2026-08-28 사장님 승인으로 180→240 상향(브뤼셀 560항목이 180초에 3회 연속 553~556/560에서 컷오프 실측).
const MAX_TX_SECONDS = 240;

interface RawPlace {
  type: "landmarks" | "restaurants";
  lang: string;
  name_en?: string;
  name_local?: string;
  name_ko?: string;
  lat?: number;
  lng?: number;
  c?: string;
  price_eur?: number;
  address?: string;
  rank?: number; // 그 언어 응답 안에서의 순위(1-20) = 리포트 참고값(best_rank 원천 아님 — 2026-08-27 사장님 확정 = best_rank 는 언어코드)
  summary?: string; // 원어 요약(그 언어) = B2 place_translations 선충전 원천
  editorial?: string; // 원어 후킹카피(그 언어)
}

// ⚠️ 수정금지(승인필요) 2026-08-27 사장님 지시 = 그룹 감사 = 병합된 raw 항목 1건의 원본 필드(raw 필드명 그대로) + 문지기 판정 tier.
interface GroupMember {
  lang: string;
  type: "landmarks" | "restaurants";
  name_en?: string;
  name_local?: string;
  name_ko?: string;
  lat?: number;
  lng?: number;
  address?: string;
  tier: string; // 불변3 | 불변5 | 불변6 | 의심(영어명/한국어명) | 의심(영어명·유니크색인) | new
}

export interface Group {
  anchor: { kind: "psr" | "tmp"; id: number };
  type: "landmarks" | "restaurants";
  anchorCat: string;
  by: string; // 이 그룹이 만들어진 판정 tier(첫 합류 항목의 tier)
  langs: Set<string>;
  names: Set<string>;
  locals: Set<string>;
  kos: Set<string>;
  lats: number[];
  lngs: number[];
  cats: string[];
  prices: number[];
  addresses: Set<string>;
  ranks: number[];
  copies: { lang: string; summary?: string; editorial?: string }[];
  members: GroupMember[];
}

function norm(s?: string | null): string {
  if (!s) return "";
  return (
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      // ⚠️ 수정금지(승인필요) 2026-08-27 사장님 지시 = 결합기호 제거 후 NFC 재조합 = 한글 음절이 아래 허용범위(가-힯)에 남는다.
      .normalize("NFC")
      .replace(/[^a-z0-9一-鿿぀-ヿ가-힯 ]/g, " ")
      .replace(/\b(the|el|la|los|las|de|del|of|museo|museum)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}
// ⚠️ 수정금지(승인필요) 2026-08-27 사장님 지시 = 과병합 의심 판정(감사 플래그, 병합 판정에 영향 0).
function isMixedGroup(members: GroupMember[]): boolean {
  const distinct = [
    ...new Set(members.map((m) => norm(m.name_en)).filter(Boolean)),
  ];
  if (distinct.length <= 1) return false;
  const sets = distinct.map((n) => new Set(n.split(" ")));
  const largest = sets.reduce((a, b) => (b.size > a.size ? b : a));
  return !sets.every((s) => [...s].every((t) => largest.has(t)));
}

function majorityCat(cats: string[]): string {
  const cnt: Record<string, number> = {};
  for (const c of cats) cnt[c] = (cnt[c] || 0) + 1;
  return Object.entries(cnt).sort((a, b) => b[1] - a[1])[0]?.[0] || "unknown";
}

function avg(xs: number[]): number | null {
  return xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null;
}

(async () => {
  const dir = path.join(ROOT, "docs", "raw", String(cityId));
  if (!fs.existsSync(dir)) {
    console.error(`✗ docs/raw/${cityId} 없음 = 02-discover 선행 필요`);
    process.exit(1);
  }
  const files = fs.readdirSync(dir).filter((f) => f.includes("best20perlang"));
  const byLang = new Map<string, string>();
  for (const f of files.sort().reverse()) {
    const m = f.match(/best20perlang-([a-z]{2})/);
    if (m && LANGS.includes(m[1] as any) && !byLang.has(m[1]))
      byLang.set(m[1], f);
  }
  console.log(
    `═══ B1 선처리(①②③) — city ${cityId} — 판정기 = DB 문지기 place_seed_raw_prevent_dup 1벌(트랜잭션 ROLLBACK) ═══`,
  );
  console.log(`언어별 채택 파일 (${byLang.size}/${LANGS.length}):`);
  for (const [lang, f] of byLang) console.log(`  [${lang}] ${f}`);
  if (byLang.size < LANGS.length)
    console.warn(
      `⚠️ ${LANGS.filter((l) => !byLang.has(l)).join(",")} 언어 raw 없음 = 부분 실행`,
    );

  const all: RawPlace[] = [];
  for (const lang of LANGS) {
    const f = byLang.get(lang);
    if (!f) continue;
    const j = JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8"));
    const res = j.raw?.parsed?.results || j.parsed?.results;
    for (const type of ["landmarks", "restaurants"] as const) {
      for (const p of res?.[type] || []) {
        all.push({
          type,
          lang,
          name_en: p.name_en,
          name_local: p.name_local,
          name_ko: p.name_ko,
          lat: p.lat,
          lng: p.lng,
          c: p.c,
          price_eur: p.price_eur,
          address: p.address,
          rank: p.rank,
          summary: p.summary,
          editorial: p.editorial,
        });
      }
    }
  }
  console.log(`raw 항목 ${all.length}건(언어 ${byLang.size}개)`);

  const pg = await import("pg");
  const c = new (pg as any).default.Client({
    connectionString: process.env.SUPA_URL || process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await c.connect();

  const countQ = `SELECT count(*)::int AS n FROM place_seed_raw WHERE city_id = $1`;
  const countBefore: number = (await c.query(countQ, [cityId])).rows[0].n;
  const maxIdBefore: number = (
    await c.query(`SELECT max(id)::int AS m FROM place_seed_raw`)
  ).rows[0].m;

  const groups = new Map<string, Group>();
  const tempGroupOf = new Map<number, string>(); // 임시행 id → 그룹 key
  const errors: {
    lang: string;
    type: string;
    name_en?: string;
    error: string;
  }[] = [];
  const tierHistogram: Record<string, number> = {};
  const bump = (tier: string) =>
    (tierHistogram[tier] = (tierHistogram[tier] || 0) + 1);

  function newGroup(
    key: string,
    anchor: Group["anchor"],
    p: RawPlace,
    tier: string,
  ) {
    groups.set(key, {
      anchor,
      type: p.type,
      anchorCat: p.c || "",
      by: tier,
      langs: new Set(),
      names: new Set(),
      locals: new Set(),
      kos: new Set(),
      lats: [],
      lngs: [],
      cats: [],
      prices: [],
      addresses: new Set(),
      ranks: [],
      copies: [],
      members: [],
    });
    return groups.get(key)!;
  }
  function addMember(g: Group, p: RawPlace, tier: string) {
    g.members.push({
      lang: p.lang,
      type: p.type,
      name_en: p.name_en,
      name_local: p.name_local,
      name_ko: p.name_ko,
      lat: p.lat,
      lng: p.lng,
      address: p.address,
      tier,
    });
    g.langs.add(p.lang);
    g.names.add(p.name_en || "");
    if (p.name_local) g.locals.add(p.name_local);
    if (p.name_ko) g.kos.add(p.name_ko);
    if (typeof p.lat === "number" && typeof p.lng === "number") {
      g.lats.push(p.lat);
      g.lngs.push(p.lng);
    }
    if (p.c) g.cats.push(p.c);
    if (typeof p.price_eur === "number") g.prices.push(p.price_eur);
    if (p.address) g.addresses.add(p.address);
    if (typeof p.rank === "number") g.ranks.push(p.rank);
    if (p.summary || p.editorial)
      g.copies.push({
        lang: p.lang,
        summary: p.summary,
        editorial: p.editorial,
      });
    bump(tier);
  }
  function joinTarget(targetId: number, p: RawPlace, tier: string) {
    const tmpKey = tempGroupOf.get(targetId);
    const key = tmpKey ?? `psr:${targetId}`;
    const g =
      groups.get(key) ?? newGroup(key, { kind: "psr", id: targetId }, p, tier);
    addMember(g, p, tier);
  }

  const t0 = Date.now();
  const elapsedSec = () => (Date.now() - t0) / 1000;
  let abortedAt = -1;

  await c.query("BEGIN");
  await c.query(`SET LOCAL statement_timeout = '60s'`);
  try {
    for (let i = 0; i < all.length; i++) {
      const p = all[i];
      if (elapsedSec() > MAX_TX_SECONDS) {
        abortedAt = i;
        break;
      }
      if (!p.name_en || !p.c) {
        errors.push({
          lang: p.lang,
          type: p.type,
          name_en: p.name_en,
          error: "name_en/c 없음",
        });
        continue;
      }
      await c.query("SAVEPOINT s");
      try {
        const r = await c.query(
          `INSERT INTO place_seed_raw (city_id, seed_category, name_en, name_local, name_ko, address, status)
           VALUES ($1, $2, $3, $4, $5, $6, 'active') RETURNING id, phase_tags`,
          [
            cityId,
            p.c,
            p.name_en,
            p.name_local || null,
            p.name_ko || null,
            p.address || null,
          ],
        );
        const id: number = r.rows[0].id;
        const tags: string[] = r.rows[0].phase_tags || [];
        const suspect = tags.find((t) => t.startsWith("의심대상-"));
        if (!suspect) {
          await c.query("RELEASE SAVEPOINT s");
          const key = `tmp:${id}`;
          tempGroupOf.set(id, key);
          addMember(newGroup(key, { kind: "tmp", id }, p, "new"), p, "new");
          continue;
        }
        const n = Number(suspect.slice("의심대상-".length));
        const tmpKey = tempGroupOf.get(n);
        const joinable = !tmpKey || groups.get(tmpKey)!.anchorCat === p.c;
        if (joinable) {
          await c.query("ROLLBACK TO SAVEPOINT s");
          joinTarget(n, p, "의심(영어명/한국어명)");
        } else {
          await c.query("RELEASE SAVEPOINT s");
          const key = `tmp:${id}`;
          tempGroupOf.set(id, key);
          addMember(newGroup(key, { kind: "tmp", id }, p, "new"), p, "new");
        }
      } catch (e: any) {
        await c.query("ROLLBACK TO SAVEPOINT s");
        const m = String(e.message).match(/\[중복차단\] (불변\d)[^]*?id=(\d+)/);
        if (m) {
          joinTarget(Number(m[2]), p, m[1]);
        } else if (
          e.code === "23505" &&
          e.constraint === "uniq_psr_global_city_name"
        ) {
          const hit = (
            await c.query(
              `SELECT id FROM place_seed_raw WHERE city_id = $1 AND lower(trim(name_en)) = lower(trim($2)) LIMIT 1`,
              [cityId, p.name_en],
            )
          ).rows[0];
          if (hit) joinTarget(hit.id, p, "의심(영어명·유니크색인)");
          else
            errors.push({
              lang: p.lang,
              type: p.type,
              name_en: p.name_en,
              error: e.message,
            });
        } else {
          errors.push({
            lang: p.lang,
            type: p.type,
            name_en: p.name_en,
            error: `${e.code || ""} ${e.message}`.trim(),
          });
        }
      }
    }
  } finally {
    await c.query("ROLLBACK");
  }
  const elapsed = elapsedSec();
  const countAfter: number = (await c.query(countQ, [cityId])).rows[0].n;
  console.log(
    `\n트랜잭션 ROLLBACK 완료 = ${elapsed.toFixed(1)}s · city ${cityId} 행수 시작 ${countBefore} / 종료 ${countAfter}`,
  );
  if (countBefore !== countAfter) {
    await c.end();
    throw new Error(
      `❌ PSR 행수 불일치(${countBefore}→${countAfter}) = DB 쓰기 0 보장 위반`,
    );
  }
  if (abortedAt >= 0) {
    await c.end();
    console.error(
      `❌ ${MAX_TX_SECONDS}s 초과 = ${abortedAt}/${all.length} 항목에서 중단(재시도 없음). 산출표 미저장.`,
    );
    process.exit(2);
  }

  const psrIds = [...groups.values()]
    .filter((g) => g.anchor.kind === "psr")
    .map((g) => g.anchor.id);
  const psrInfo = new Map<number, PsrRow>();
  if (psrIds.length) {
    const rows: PsrRow[] = (
      await c.query(
        `SELECT ${PSR_COLS} FROM place_seed_raw WHERE id = ANY($1::int[])`,
        [psrIds],
      )
    ).rows;
    for (const r of rows) psrInfo.set(r.id, r);
  }
  const cityRows: PsrRow[] = (
    await c.query(
      `SELECT ${PSR_COLS} FROM place_seed_raw WHERE city_id = $1 AND latitude IS NOT NULL AND longitude IS NOT NULL`,
      [cityId],
    )
  ).rows;

  // ⚠️ 수정금지(승인필요) 2026-08-29 사장님 확정 = A등급 tier = 불변5·6, 그 외는 B등급
  const GRADE_A_TIERS = new Set(["불변5", "불변6"]);
  const staged: Staged[] = [];
  for (const g of groups.values()) {
    if (g.type === "restaurants" && g.langs.size < RESTAURANT_MIN_LANGS)
      continue;
    const side = {
      g,
      name: [...g.names][0],
      nameLocal: [...g.locals][0] || null,
      nameKo: [...g.kos][0] || null,
      lat: avg(g.lats),
      lng: avg(g.lngs),
      regrade: null,
      absorbed: false,
    };
    if (g.anchor.kind === "psr") {
      const r = psrInfo.get(g.anchor.id);
      if (!r) {
        errors.push({
          lang: "-",
          type: g.type,
          name_en: side.name,
          error: `대상 PSR id=${g.anchor.id} 조회 실패(시작 전 max(id)=${maxIdBefore})`,
        });
        continue;
      }
      const tiers = [...new Set(g.members.map((m) => m.tier))];
      const bucket: Bucket = tiers.some((t) => GRADE_A_TIERS.has(t))
        ? "merge"
        : "confirm";
      staged.push({
        ...side,
        orig: bucket,
        bucket,
        psr: r,
        by: tiers.join("+"),
      });
    } else {
      staged.push({ ...side, orig: "new", bucket: "new", psr: null, by: g.by });
    }
  }

  const regradeCounts = await regradeStaged(c, staged, cityRows);

  const emptySection = () => ({
    merge: [] as any[],
    confirm: [] as any[],
    new: [] as any[],
  });
  const report = { landmarks: emptySection(), restaurants: emptySection() };
  for (const s of staged) {
    if (s.absorbed) continue;
    const g = s.g;
    const base = {
      name: [...g.names][0],
      langs: g.langs.size,
      cat: majorityCat(g.cats),
      avgPrice: g.prices.length ? Math.round(avg(g.prices)!) : null,
      // 언어별 원 순위 평균 = 리포트 참고값(best_rank 원천 아님 — 2026-08-27 사장님 확정 = best_rank 는 언어코드)
      avgRank: g.ranks.length ? Math.round(avg(g.ranks)!) : null,
      copies: g.copies, // 원어 카피(B2 = place_translations 선충전 원천, 외부호출 0)
      mixed: isMixedGroup(g.members),
      members: g.members,
      regrade: s.regrade,
    };
    const newShape = {
      ...base,
      nameLocal: [...g.locals][0] || null,
      nameKo: [...g.kos][0] || null,
      lat: avg(g.lats),
      lng: avg(g.lngs),
      address: [...g.addresses][0] || null,
      by: s.by,
    };
    if (s.bucket === "merge") {
      const r = s.psr!;
      report[g.type].merge.push({
        ...base,
        psrId: r.id,
        psrName: r.name_en,
        psrCat: r.seed_category,
        psrStatus: r.status,
        psrHasPid: r.pid,
        psrCityId: r.city_id,
        by: s.by,
      });
    } else if (s.bucket === "confirm") {
      const r = s.psr!;
      report[g.type].confirm.push({
        ...newShape,
        psrHint: {
          psrId: r.id,
          psrName: r.name_en,
          psrCat: r.seed_category,
          by: s.by,
        },
      });
    } else {
      report[g.type].new.push(newShape);
    }
  }
  await c.end();

  const restaurantGroups = [...groups.values()].filter(
    (g) => g.type === "restaurants",
  ).length;
  const sizeOf = (o: ReturnType<typeof emptySection>) =>
    o.merge.length + o.confirm.length + o.new.length;
  console.log(
    `\n① 선병합: 그룹 ${groups.size} = 랜드마크 ${[...groups.values()].filter((g) => g.type === "landmarks").length}(합집합 채택) / 식당 ${restaurantGroups} 중 ${RESTAURANT_MIN_LANGS}개국어+ = ${sizeOf(report.restaurants)} 채택 · 오류 ${errors.length}`,
  );
  console.log(`tier 히스토그램(항목 단위): ${JSON.stringify(tierHistogram)}`);

  console.log(
    `\n② 기존 PSR 대조 결과(문지기 판정 그대로 → A등급=merge / B등급=confirm):`,
  );
  for (const label of ["landmarks", "restaurants"] as const) {
    const o = report[label];
    console.log(
      `\n[${label}] 총 ${sizeOf(o)}곳 = merge ${o.merge.length} / confirm ${o.confirm.length} / new ${o.new.length}`,
    );
    console.log(
      `  --- merge(A등급 = 불변5·6, 기존 행 직행 UPDATE, B2 외부호출 0) ---`,
    );
    for (const m of o.merge)
      console.log(
        `  [${m.langs}] ${m.name} → PSR#${m.psrId} ${m.psrName}(${m.psrCat},${m.psrStatus},PID${m.psrHasPid ? "有" : "無"}${m.psrCityId !== cityId ? `,city${m.psrCityId}` : ""}) [${m.by}]${m.mixed ? " ⚠mixed" : ""}`,
      );
    console.log(
      `  --- confirm(B등급 = 불변3·의심 = 후보일 뿐, B2 --confirm = TS 1콜 → PID 로 진짜 행 판정) ---`,
    );
    for (const x of o.confirm)
      console.log(
        `  [${x.langs}] ${x.name} (${x.cat}) → 후보 PSR#${x.psrHint.psrId} ${x.psrHint.psrName}(${x.psrHint.psrCat}) [${x.psrHint.by}]${x.mixed ? " ⚠mixed" : ""}`,
      );
    console.log(
      `  --- ③ new(정말 신규, TS 검증 후 입력 대상, B2 = 별도 🔴 승인) ---`,
    );
    for (const n of o.new)
      console.log(
        `  [${n.langs}] ${n.name} (${n.cat}, avg€${n.avgPrice ?? "-"})${n.mixed ? " ⚠mixed" : ""}`,
      );
  }
  if (errors.length) {
    console.log(`\n오류 ${errors.length}건:`);
    for (const e of errors)
      console.log(`  [${e.lang}/${e.type}] ${e.name_en} = ${e.error}`);
  }

  const totalNew = report.landmarks.new.length + report.restaurants.new.length;
  const totalConfirm =
    report.landmarks.confirm.length + report.restaurants.confirm.length;
  const totalMerge =
    report.landmarks.merge.length + report.restaurants.merge.length;
  const allItems = (["landmarks", "restaurants"] as const).flatMap((k) => [
    ...report[k].merge,
    ...report[k].confirm,
    ...report[k].new,
  ]);
  const mixedCount = allItems.filter((x) => x.mixed).length;
  console.log(
    `\n═══ 요약: ${elapsed.toFixed(1)}s · 총 ${totalMerge + totalConfirm + totalNew}곳 = merge ${totalMerge}(외부호출 0) / confirm ${totalConfirm}(🔴 TS ${totalConfirm}콜) / new ${totalNew}(🔴 TS ${totalNew}콜) · mixed ${mixedCount} · 오류 ${errors.length} · 등급조정 R1 ${regradeCounts.R1} / R2 ${regradeCounts.R2} / R3 ${regradeCounts.R3}(PID無 hint ${regradeCounts.hintOnly}) / R4 ${regradeCounts.R4} / R5 ${regradeCounts.R5} / R6 ${regradeCounts.R6} ═══`,
  );

  const today = rawDate();
  const payload = {
    cityId,
    generatedAt: today,
    dupFilter:
      "place_seed_raw_prevent_dup (transaction ROLLBACK, coords/PID/URI NULL)",
    restaurantMinLangs: RESTAURANT_MIN_LANGS,
    psrCountBefore: countBefore,
    psrCountAfter: countAfter,
    tierHistogram,
    regradeCounts,
    errors,
    report,
  };
  const outDir = path.join(ROOT, "docs", "b1-reports", String(cityId));
  const stemFile = `${today}_b1-discovery-diff.json`;
  const outPath = saveVersionedReport(outDir, stemFile, payload);
  console.log(`\n✓ 산출표 저장 = ${outPath} (DB 쓰기 0)`);
})();
