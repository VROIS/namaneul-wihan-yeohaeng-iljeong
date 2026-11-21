// 필시티 v4 = 모험 채우기 = 비아토르 모험 상품(제휴 API · 무료) 리뷰 탑 20(업체가 겹치지 않게) → 상품마다 "활동 장소"의 구글 번호를 먼저 열어 보고(구글 분류가 있고 후기가 있으면 채택) → 아니면 "출발 장소"를 열어 보고(구글 분류·후기가 있고 페이지 이름이 그 업체 이름과 맞을 때만 채택) → 둘 다 아니면 버린다(길 주소·역·마을·남의 가게 = 껍데기 행을 만들지 않는다) → 채택한 곳만 번호 행으로 넣고 후처리가 요소를 확정한다 · 이름 검색 0 · 창고에 이미 있는 번호는 열지 않는다 (정본 2026-11-14 · 베른 탑 20 실측 = 맞는 장소 12 · 틀린 장소 0 · 버림 8)
import fs from "fs";
import path from "path";
import {
  EXIT_LIMITED,
  connectDb,
  latestReport,
  loadEnv,
  parseArgs,
  reportDir,
  stamp,
  stampOf,
} from "./common";
import {
  nearestHub,
  readBallot,
  viatorCountryOf,
  type BallotFile,
} from "./ballot-common";
import { readDeleted } from "./trash-apply";
import {
  VIATOR,
  viatorHeaders,
} from "../../worker/lib/services/fill/affiliate-links";
import { distanceKmFromCoords as km } from "../../worker/lib/services/shared/geo-distance";
import { namesAgree } from "../../worker/lib/services/shared/recognize-place";
import {
  BROWSER_UA,
  GMAPS_WINDOWS,
  LIMITED_VIEW_RE,
  launchBrowser,
  openWindow,
  readPlacePage,
} from "../../worker/lib/services/fill/gmaps-pid-identity/page-reader";

loadEnv();
const argv = parseArgs();
const cityId = Number(argv["city-id"] || 0);
const apply = argv["apply"] === "true";
const TOP = Number(argv["top"] || 20);
const ADV =
  /^(extreme sports|paragliding|skydiving|bungee|canyoning|rafting|white water rafting|climbing|kayaking|ziplin|via ferrata|skiing|snowboard|sledding|surfing|scuba|snorkel|atv|quad|horseback|hot air balloon|helicopter tours?|jet ?ski|mountain bike|4wd)/i;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

type Pick = {
  no: number;
  title: string;
  productCode: string;
  reviews: number;
  tag: string;
  supplier: string;
  startPid: string | null;
  activityPid: string | null;
  cc?: string | null;
};

async function viatorTop(
  self: { lat: number; lng: number },
  hubs: BallotFile["hubs"],
  radiusKm: number,
): Promise<Pick[]> {
  const H = viatorHeaders();
  const call = async (p: string, body?: any) => {
    for (let i = 0; i < 4; i++) {
      const r = await fetch(
        VIATOR + p,
        body
          ? { method: "POST", headers: H, body: JSON.stringify(body) }
          : { headers: H },
      );
      if (r.status === 429) {
        await sleep(10_000);
        continue;
      }
      if (!r.ok) throw new Error(`비아토르 ${p} 응답 ${r.status}`);
      return (await r.json()) as any;
    }
    throw new Error(`비아토르 ${p} 호출 한도(429) 4회`);
  };
  const tagName = new Map<number, string>();
  for (const t of (await call("/products/tags")).tags ?? []) {
    const n = String(t.allNamesByLocale?.en || "").trim();
    if (ADV.test(n)) tagName.set(t.tagId, n);
  }
  const allDests: any[] = (await call("/destinations")).destinations ?? [];
  const countryOf = viatorCountryOf(allDests);
  const dests = allDests.filter(
    (d: any) =>
      d.center &&
      !["COUNTRY", "REGION", "STATE", "PROVINCE"].includes(
        String(d.type || "").toUpperCase(),
      ) &&
      km(self.lat, self.lng, d.center.latitude, d.center.longitude) <=
        radiusKm &&
      nearestHub(
        hubs,
        d.center.latitude,
        d.center.longitude,
        countryOf(d.destinationId),
      ) === cityId,
  );
  // 상품의 대표 목적지가 이 거점 몫일 때만(권역 목적지에 딸려 온 다른 거점 도시의 상품을 뺀다)
  const mineDest = new Set<string>(
    dests.map((d: any) => String(d.destinationId)),
  );
  const primaryOf = (pr: any) =>
    (pr.destinations ?? []).find((x: any) => x.primary) ?? pr.destinations?.[0];
  const primaryMine = (pr: any) => {
    const d = primaryOf(pr);
    return !!d && mineDest.has(String(d.ref));
  };
  const prods = new Map<string, any>();
  for (const d of dests)
    for (let start = 1; start <= 951; start += 50) {
      const j = await call("/products/search", {
        filtering: { destination: String(d.destinationId) },
        sorting: { sort: "DEFAULT" },
        pagination: { start, count: 50 },
        currency: "EUR",
      });
      for (const pr of j.products ?? [])
        if (
          !prods.has(pr.productCode) &&
          primaryMine(pr) &&
          (pr.tags ?? []).some((t: number) => tagName.has(t))
        )
          prods.set(pr.productCode, pr);
      await sleep(350);
      if (start + 50 > (j.totalCount ?? 0)) break;
    }
  const all = [...prods.values()].sort(
    (a, b) => (b.reviews?.totalReviews ?? 0) - (a.reviews?.totalReviews ?? 0),
  );
  const raw: any[] = [];
  const seenSup = new Set<string>();
  for (const pr of all) {
    if (raw.length >= TOP) break;
    const det = await call("/products/" + pr.productCode);
    await sleep(300);
    const sup = String(det.supplier?.name || "").trim();
    if (!sup || seenSup.has(sup)) continue;
    seenSup.add(sup);
    raw.push({
      pr,
      sup,
      startRef: det.logistics?.start?.[0]?.location?.ref ?? null,
      actRef: det.itinerary?.activityInfo?.location?.ref ?? null,
      tag:
        (pr.tags ?? []).map((t: number) => tagName.get(t)).find(Boolean) ?? "",
    });
  }
  const refs = [
    ...new Set(raw.flatMap((p) => [p.startRef, p.actRef]).filter(Boolean)),
  ];
  const loc = new Map<string, any>();
  for (let i = 0; i < refs.length; i += 100)
    for (const l of (
      await call("/locations/bulk", { locations: refs.slice(i, i + 100) })
    ).locations ?? [])
      loc.set(l.reference, l);
  const pidOf = (r: string | null) =>
    r && loc.get(r)?.provider === "GOOGLE"
      ? String(loc.get(r).providerReference || "") || null
      : null;
  console.log(
    `비아토르 = 목적지 ${dests.length}곳 · 모험 상품 ${all.length}개 → 업체가 겹치지 않게 리뷰 많은 순 ${raw.length}개`,
  );
  return raw.map((p, i) => ({
    no: i + 1,
    title: String(p.pr.title),
    productCode: String(p.pr.productCode),
    reviews: p.pr.reviews?.totalReviews ?? 0,
    tag: p.tag,
    supplier: p.sup,
    startPid: pidOf(p.startRef),
    activityPid: p.actRef && p.actRef !== p.startRef ? pidOf(p.actRef) : null,
    cc: countryOf(Number(primaryOf(p.pr)?.ref)),
  }));
}

(async () => {
  if (!cityId) {
    console.error(
      "Usage: --city-id=<N> [--apply] [--top=20] [--since=<판 시작 시각>]",
    );
    process.exit(1);
  }
  const since = argv["since"] ? stampOf(String(argv["since"])) : undefined;
  const ballot = readBallot(cityId, since);
  if (!ballot) {
    console.error(
      "✗ 이 판의 투표 용지가 없다(가까운 거점 판정에 쓴다) = 모험을 채우지 않는다",
    );
    process.exit(1);
  }
  const c = await connectDb();
  const self = (
    await c.query(
      "SELECT name, latitude::float8 lat, longitude::float8 lng FROM cities WHERE id=$1",
      [cityId],
    )
  ).rows[0];
  const topFile = latestReport(
    cityId,
    "adventure-top",
    (f) => !since || f.slice(0, 17) >= since,
  );
  let picks: Pick[];
  if (topFile) {
    picks = JSON.parse(fs.readFileSync(topFile, "utf-8")).picks;
    console.log(
      `↪ 이어 돌기 = 이 판에서 이미 받은 모험 탑 ${picks.length}개를 그대로 쓴다`,
    );
  } else {
    picks = await viatorTop(self, ballot.hubs, ballot.radiusKm);
    fs.writeFileSync(
      path.join(reportDir(cityId), `${stamp()}_adventure-top.json`),
      JSON.stringify(
        { cityId, generatedAt: new Date().toISOString(), picks },
        null,
        2,
      ),
    );
  }
  console.log(
    `═══ 모험 탑 ${picks.length} city ${cityId} ${self.name} · ${apply ? "APPLY" : "DRY(페이지 안 엶)"} ═══`,
  );
  for (const p of picks)
    console.log(
      `  ${String(p.no).padStart(2)}. ${p.title.slice(0, 60)} | 리뷰 ${p.reviews} | ${p.supplier} | 활동 번호 ${p.activityPid ? "있음" : "없음"} · 출발 번호 ${p.startPid ? "있음" : "없음"}`,
    );
  if (!apply) {
    await c.end();
    process.exit(0);
  }

  // 창고에 이미 있는 번호·CID = 열지 않는다(한 번 연 곳은 다시 열지 않는다)
  const have = (
    await c.query(
      "SELECT google_place_id pid, substring(google_maps_uri from 'cid=([0-9]+)') cid FROM place_seed_raw WHERE status <> 'merged' AND (google_place_id = ANY($1::text[]) OR google_maps_uri IS NOT NULL AND city_id = $2)",
      [
        picks.flatMap((p) => [p.startPid, p.activityPid]).filter(Boolean),
        cityId,
      ],
    )
  ).rows;
  // 사장님이 지운 장소(지운 장소 장부)도 "이미 있음"처럼 열지도 넣지도 않는다
  const gone = readDeleted(cityId);
  const havePid = new Set(
    [...have.map((r: any) => r.pid), ...gone.map((d) => d.pid)].filter(Boolean),
  );
  const haveCid = new Set(
    [...have.map((r: any) => r.cid), ...gone.map((d) => d.cid)].filter(Boolean),
  );
  const peekFile = latestReport(
    cityId,
    "adventure-peek",
    (f) => !since || f.slice(0, 17) >= since,
  );
  const peeked: Record<string, any> = peekFile
    ? JSON.parse(fs.readFileSync(peekFile, "utf-8")).pages
    : {};
  const peekOut =
    peekFile ?? path.join(reportDir(cityId), `${stamp()}_adventure-peek.json`);
  const { chromium } = await import("playwright");
  const browser = await launchBrowser(chromium);
  const win = await openWindow(browser, BROWSER_UA, "en-US");
  let opens = 0;
  let limited = false;
  const peek = async (pid: string) => {
    if (peeked[pid]) return peeked[pid];
    await win.page.waitForTimeout(1700);
    opens++;
    const d: any = await readPlacePage(win.page, pid, "en", true).catch(
      (e: any) => ({ error: String(e?.message || e).slice(0, 120) }),
    );
    const body = await win.page
      .locator("body")
      .innerText({ timeout: 3000 })
      .catch(() => "");
    if (
      d?.limited ||
      LIMITED_VIEW_RE.test(body) ||
      /google\.[a-z.]+\/sorry\//.test(win.page.url())
    ) {
      limited = true;
      return null;
    }
    const rec = {
      name: d?.h1 ?? null,
      category: d?.category ?? null,
      reviews: d?.reviewCount ?? 0,
      cid: String(d?.mapsUri || "").match(/cid=(\d+)/)?.[1] ?? null,
      lat: d?.urlLat ?? null,
      lng: d?.urlLng ?? null,
      error: d?.error ?? null,
    };
    peeked[pid] = rec;
    fs.writeFileSync(
      peekOut,
      JSON.stringify({ cityId, pages: peeked }, null, 2),
    );
    return rec;
  };
  // ⚠️ 수정금지(승인필요) 2026-11-21 사장님 결정 = 등록된 곳 = 이름·구글 분류·후기가 있고, 붙을 거점(상품 주 목적지의 나라로 nearestHub 1벌)이 이 도시 (정본 2026-11-21)
  const registered = (r: any, cc?: string | null) =>
    !!r?.name &&
    !!r.category &&
    r.reviews > 0 &&
    r.lat != null &&
    r.lng != null &&
    nearestHub(ballot.hubs, Number(r.lat), Number(r.lng), cc) === cityId;
  const chosen: { p: Pick; pid: string; page: any; by: string }[] = [];
  const tally: Record<string, number> = {};
  const bump = (k: string) => (tally[k] = (tally[k] || 0) + 1);
  try {
    for (const p of picks) {
      let pickPid: string | null = null;
      let page: any = null;
      let by = "";
      for (const [pid, kind] of [
        [p.activityPid, "활동 장소"],
        [p.startPid, "출발 장소(업체)"],
      ] as const) {
        if (!pid || limited) continue;
        if (havePid.has(pid)) {
          by = "창고에 이미 있음";
          break;
        }
        const r = await peek(pid);
        if (limited) break;
        if (
          registered(r, p.cc) &&
          (kind === "활동 장소" || namesAgree(r.name, [p.supplier]))
        ) {
          if (r.cid && haveCid.has(r.cid)) by = "창고에 이미 있음";
          else {
            pickPid = pid;
            page = r;
            by = kind;
          }
          break;
        }
      }
      if (limited) break;
      if (pickPid && !chosen.some((x) => x.page.cid && x.page.cid === page.cid))
        chosen.push({ p, pid: pickPid, page, by });
      bump(pickPid ? by : by || "버림(등록된 업체·활동 장소 아님)");
      console.log(
        `  ${String(p.no).padStart(2)}. ${p.supplier} → ${pickPid ? `✅ ${by} = "${page.name}" (${page.category} · 후기 ${page.reviews})` : `⏭ ${by || "버림"}`}`,
      );
    }
  } finally {
    if (!limited) await win.close().catch(() => {});
    await browser.close().catch(() => {});
  }
  console.log(
    `살펴보기 = 페이지 ${opens}장 · ${Object.entries(tally)
      .map(([k, v]) => `${k} ${v}`)
      .join(" · ")}`,
  );
  if (limited) {
    console.error("⛔ 제한보기(사람 인증) = 읽은 곳까지 저장하고 멈춤");
    await c.end();
    process.exit(EXIT_LIMITED);
  }

  const { upsertPlace, purgeMergedRows } = await import(
    "../../worker/lib/services/place-upsert"
  );
  const today = new Date().toISOString().slice(0, 10);
  for (const x of chosen) {
    try {
      const r = await upsertPlace({
        cityId,
        seedCategory: "adventure",
        nameEn: x.page.name,
        googlePlaceId: x.pid,
        categoryTags: ["adventure"],
        phaseTags: [`viator-adventure-${today}`],
      } as any);
      console.log(
        `  ↳ ${x.page.name} = ${r.action}${r.matchedBy && r.matchedBy !== "none" ? `(${r.matchedBy})` : ""}`,
      );
    } catch (e: any) {
      console.log(
        `  ✘ ${x.page.name} = ${String(e?.message || e).slice(0, 120)}`,
      );
    }
  }
  let limitedStop = false;
  try {
    if (chosen.length) {
      const { runGmapsPost, r2PrefixOf } = await import(
        "../../worker/lib/services/fill/gmaps-post"
      );
      const b2 = await launchBrowser(chromium);
      try {
        await runGmapsPost({
          client: c,
          browser: b2,
          cityId,
          r2Prefix: r2PrefixOf(process.env.R2_PUBLIC_URL),
          upsertPlace,
          parallel: GMAPS_WINDOWS,
          fill: true,
        });
      } catch (e: any) {
        console.error(`⛔ 후처리 중단 = ${e?.message || e}`);
        limitedStop = /제한보기/.test(String(e?.message));
        if (!limitedStop) throw e;
      } finally {
        await b2.close().catch(() => {});
      }
      const purged = await purgeMergedRows(cityId);
      console.log(`병합 행 정리 ${purged.purged}`);
    }
  } finally {
    await c.end();
    const { pool } = await import("../../worker/lib/db");
    await pool!.end();
  }
  console.log(
    `═══ 모험 끝 = 넣은 곳 ${chosen.length} / 상품 ${picks.length} ═══`,
  );
  process.exit(limitedStop ? EXIT_LIMITED : 0);
})().catch((e) => {
  console.error("✗ 모험 채우기 실패:", e?.message || e);
  process.exit(1);
});
