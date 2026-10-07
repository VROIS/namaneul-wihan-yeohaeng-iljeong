// ⚠️ 수정금지(승인필요) 2026-10-03 사장님 결정 = 필시티 v3.2 목록 읽기 = 검색 문장을 구글 맵에서 읽고 로그를 전부 남긴다, 플레이라이트는 최대한 덜 쓴다 (정본 §)
import { connectDb, loadEnv, parseArgs, stamp } from "./common";
import { isR2Configured } from "../../worker/lib/services/shared/r2-client";
import { LIST_QUERIES, labelOfLine } from "./lists-common";

loadEnv();
const argv = parseArgs();
const cityId = Number(argv["city-id"] || 0);
const only = argv["only"]
  ? String(argv["only"])
      .split(",")
      .map((s) => s.trim())
  : null;
const PAUSE_SEC = Math.max(0, Number(argv["pause"] || 7));
const EXIT_LIMITED = 3;

(async () => {
  if (!cityId) {
    console.error(
      "Usage: --city-id=<N> [--only=city-attractions,instagram,...] [--pause=7]",
    );
    process.exit(1);
  }
  if (!isR2Configured()) {
    console.error(
      "✗ R2 설정 없음 = 원본 로그를 남길 수 없다(§18) = 읽지 않는다",
    );
    process.exit(1);
  }
  const c = await connectDb();
  const city = (
    await c.query(
      "SELECT name_en, latitude::float8 AS lat, longitude::float8 AS lng FROM cities WHERE id=$1",
      [cityId],
    )
  ).rows[0];
  await c.end();
  if (!city?.name_en || city.lat == null) {
    console.error(`✗ city ${cityId} 이름·중심 좌표 없음`);
    process.exit(1);
  }
  const { chromium } = await import("playwright");
  const {
    launchBrowser,
    openWindow,
    BROWSER_UA,
    GMAPS_WINDOWS,
    LIMITED_VIEW_RE,
    humanPause,
    dismissConsent,
    showWindow,
  } = await import(
    "../../worker/lib/services/fill/gmaps-pid-identity/page-reader"
  );
  const { saveRaw } = await import("../../worker/lib/services/shared/save-raw");
  const targets = LIST_QUERIES.filter((x) => !only || only.includes(x.key));
  console.log(
    `═══ 필시티 v3.2 ② 목록 읽기 — city ${cityId} ${city.name_en} (${city.lat}, ${city.lng}) · 문장 ${targets.length}개 ═══`,
  );
  const browser = await launchBrowser(chromium);
  let limited = false;
  const queue = [...targets];
  // ⚠️ 수정금지(승인필요) 2026-10-06 사장님 결정 = 목록 10문장도 창 GMAPS_WINDOWS 개가 나눠 동시에 읽는다(니스 실측 1창 5분 20초) · 제한 보기가 뜨면 전부 멈춤 (정본 §)
  const readList = async (
    page: any,
    t: (typeof targets)[number],
  ): Promise<"ok" | "consent" | "limited"> => {
    const query = t.q(city.name_en);
    const at = t.view ? `/@${city.lat},${city.lng},9z` : "";
    const url = `https://www.google.com/maps/search/${encodeURIComponent(query).replace(/%20/g, "+")}${at}?hl=en`;
    await humanPause(page);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    if (!(await dismissConsent(page))) {
      console.error(`  ✗ ${t.key} = 동의창을 못 넘음`);
      return "consent";
    }
    await page
      .waitForSelector('div[role="feed"]', { timeout: 15000 })
      .catch(() => {});
    await page.waitForTimeout(2500);
    const body = await page
      .locator("body")
      .innerText({ timeout: 3000 })
      .catch(() => "");
    if (LIMITED_VIEW_RE.test(body)) {
      console.error(
        `⛔ ${t.key} = 구글맵 제한 보기·사람 인증 = 멈춤(이 문장부터 다음 판에)`,
      );
      return "limited";
    }
    const raw = await page.evaluate(async () => {
      const feed: any = document.querySelector('div[role="feed"]');
      if (!feed) return { feed: false, ended: false, entries: [] as any[] };
      let last = -1;
      let ended = false;
      for (let i = 0; i < 40; i++) {
        feed.scrollTop = feed.scrollHeight;
        await new Promise((r) => setTimeout(r, 1500));
        const n = feed.querySelectorAll('a[href*="/maps/place/"]').length;
        ended = /reached the end of the list/i.test(feed.innerText || "");
        if ((n === last && i > 3) || ended) break;
        last = n;
      }
      const entries = Array.from(
        feed.querySelectorAll('a[href*="/maps/place/"]'),
      )
        .filter((a: any) => !a.href.includes("aclk"))
        .map((a: any) => {
          const card = a.closest("div[jsaction]")?.parentElement;
          const text: string = card?.innerText || "";
          const xy = a.href.match(/!3d(-?[\d.]+)!4d(-?[\d.]+)/);
          const h = a.href.match(/!1s0x[0-9a-f]+:0x([0-9a-f]+)/);
          const rc = text.match(/\(([\d,]+)\)/);
          return {
            name: a.getAttribute("aria-label") || "",
            cid: h ? BigInt("0x" + h[1]).toString() : null,
            lat: xy ? Number(xy[1]) : null,
            lng: xy ? Number(xy[2]) : null,
            rv: rc ? Number(rc[1].replace(/,/g, "")) : 0,
            sponsored: /Sponsored|스폰서/.test(text),
            line: text.replace(/\n+/g, " | ").slice(0, 240),
          };
        });
      return { feed: true, ended, entries };
    });
    const entries = raw.entries.map((e: any) => ({
      ...e,
      label: labelOfLine(e.line),
    }));
    await saveRaw({
      source: "gmaps",
      contextId: cityId,
      tag: `list-${t.key}`,
      request: {
        cityId,
        key: t.key,
        query,
        url,
        intended: t.intended,
        center: { lat: city.lat, lng: city.lng },
        hl: "en",
      },
      raw: {
        readAt: new Date().toISOString(),
        feed: raw.feed,
        endReached: raw.ended,
        total: entries.length,
        sponsored: entries.filter((e: any) => e.sponsored).length,
        entries,
      },
    } as any);
    console.log(
      `  ✔ ${t.key.padEnd(20)} ${String(entries.length).padStart(3)}곳 · 스폰서 ${entries.filter((e: any) => e.sponsored).length} · ${raw.ended ? "끝까지" : "끝 표시 못 봄"} · "${query}"`,
    );
    return "ok";
  };
  // ⚠️ 수정금지(승인필요) 2026-10-07 사장님 결정 = 사람 인증이 뜬 창은 닫지 않고 화면 안으로(showWindow) 끌어와 사장님이 바로 푼다 = PID 루프·검색과 같은 모양 (정본 §)
  try {
    await Promise.all(
      Array.from(
        { length: Math.min(GMAPS_WINDOWS, queue.length) },
        async () => {
          const { page, close } = await openWindow(
            browser,
            BROWSER_UA,
            "en-US",
          );
          let keepOpen = false;
          try {
            for (;;) {
              const t = queue.shift();
              if (!t || limited) break;
              const r = await readList(page, t);
              if (r === "limited") {
                limited = true;
                queue.splice(0);
                keepOpen = true;
                await showWindow(page);
                break;
              }
              if (PAUSE_SEC && queue.length)
                await page.waitForTimeout(PAUSE_SEC * 1000);
            }
          } finally {
            if (!keepOpen) await close();
          }
        },
      ),
    );
  } finally {
    await browser.close().catch(() => {});
  }
  console.log(
    `═══ 목록 읽기 끝 = 원본 로그 ${stamp().slice(0, 10)} 로컬 docs/raw/${cityId}/ + R2 ${cityId}/raw/ ═══`,
  );
  process.exit(limited ? EXIT_LIMITED : 0);
})().catch((e) => {
  console.error("ERR", e?.message || e);
  process.exit(1);
});
