// ⚠️ 수정금지(승인필요) 2026-08-28 사장님 승인 = §0 700줄 가드 = 폴더 분리(로직 무변경)
import type { Page } from "playwright";

// ⚠️ 수정금지(승인필요) 2026-08-28 사장님 지시 = 리뷰수 언어별 패턴. 실측 서울 hl=ko = 라벨이 "리뷰 46,716개"(숫자 뒤 단어 없음) 라 단어 없는 숫자 대체 로직이 별점 4.6 → 46 으로 오독(169행) = 그 대체 로직 폐기 = 2026-08-28. 숫자 = 정수(천 단위 구분 허용)만 = "4.6" 은 리뷰수 후보에서 제외.
const RC_NUM = "(\\d{1,3}(?:[.,\\s\\u00a0]\\d{3})+|\\d+)";
const RC_AFTER_NUM_RE = new RegExp(
  `${RC_NUM}\\s*(?:reviews?|reseñas?|Rezensionen|avis|recensioni|avaliações|beoordelingen|ressenyes|리뷰|件のクチコミ|クチコミ|条评价|则评价|評論|ulasan|รีวิว|đánh giá|maoni)`,
  "iu",
);
const RC_BEFORE_NUM_RE = new RegExp(`리뷰\\s*${RC_NUM}\\s*개`, "u");
const RATING_LEAD_RE = /^\s*(\d+[.,]\d)(?:\s|$)/;
const RATING_WORD_RE =
  /(?:별점|평점|星|评分|評分|Bewertung|Note|Valoración|Calificación|Nota|Rating)\s*:?\s*(\d+[.,]\d)|(\d+[.,]\d)\s*점/i;
const RATING_ANY_RE = /(?<![\d.,])([1-5][.,]\d)(?![\d.,])/;
function parseRcNum(s: string): number | null {
  const n = Number(s.replace(/[^\d]/g, ""));
  return Number.isFinite(n) ? n : null;
}
const CONSENT_TITLE_RE =
  /Antes de ir|계속 이용하기 전에|Before you continue|Avant d'accéder|Bevor Sie|Prima di continuare|続行するには|继续|Sebelum/i;
const CONSENT_ACCEPT_SEL = [
  'button:has-text("Aceptar todo")',
  'button:has-text("Accepta-ho tot")',
  'button:has-text("모두 수락")',
  'button:has-text("Accept all")',
  'button:has-text("Tout accepter")',
  'button:has-text("Alle akzeptieren")',
  'button:has-text("Accetta tutto")',
  'button:has-text("すべて同意")',
  'button:has-text("全部接受")',
  'button:has-text("Chấp nhận tất cả")',
  'button:has-text("Terima semua")',
  'button:has-text("ยอมรับทั้งหมด")',
  'button:has-text("Kubali zote")',
  'form[action*="consent"] button',
].join(", ");
// ⚠️ 수정금지(승인필요) 2026-08-28 사장님 확정 = 브라우저 UA = 일반 크롬. 실측(보고타 3 PID): Playwright 기본 headless UA 면 구글맵이 별점만 있는 축약 헤더를 내려 리뷰수 span 이 영영 안 뜸 / 일반 UA 면 리뷰수("50,729 reviews") 가 뜸. 동의 직후 첫 페이지만 축약 렌더 = readPlacePage 가 1회 reload 로 복구.
export const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";
// ⚠️ 수정금지(승인필요) 2026-08-28 사장님 확정 = 영업상태 = 페이지 본문(현지어) 문구로 판정. 영어 + 주요 현지어 동의어. 둘 다 없으면 OPERATIONAL.
export type BusinessStatus =
  | "OPERATIONAL"
  | "CLOSED_PERMANENTLY"
  | "CLOSED_TEMPORARILY";
const CLOSED_PERM_RE =
  /Permanently closed|Cerrado permanentemente|Cerrado definitivamente|Définitivement fermé|Fermé définitivement|Dauerhaft geschlossen|Chiuso definitivamente|Fechado permanentemente|Fechado definitivamente|Permanent gesloten|Tancat permanentment|폐업|閉業|永久停业|永久停業|Đã đóng cửa vĩnh viễn|Tutup permanen|ปิดถาวร|Imefungwa kabisa/i;
const CLOSED_TEMP_RE =
  /Temporarily closed|Cerrado temporalmente|Temporairement fermé|Fermé temporairement|Vorübergehend geschlossen|Chiuso temporaneamente|Fechado temporariamente|Tijdelijk gesloten|Tancat temporalment|임시 휴업|臨時休業|暂时关闭|暫時關閉|Tạm thời đóng cửa|Tutup sementara|ปิดชั่วคราว|Imefungwa kwa muda/i;

export type PageData = {
  h1: string | null;
  address: string | null;
  category: string | null;
  urlLat: number | null;
  urlLng: number | null;
  reviewCount: number | null;
  rcSource: "aria" | "text" | null; // 리뷰수 출처(aria 단어 패턴 / 본문 "(N)" 대체 = 100 미만이면 거부)
  rating: string | null;
  ratingNum: number | null; // 별점 숫자(리뷰수 오독 = round(별점×10/×100) 거부용)
  status: BusinessStatus;
  consentBlocked: boolean;
};

async function dismissConsent(page: Page): Promise<boolean> {
  const title = await page.title().catch(() => "");
  if (!/consent\.google/.test(page.url()) && !CONSENT_TITLE_RE.test(title))
    return true;
  const btn = page.locator(CONSENT_ACCEPT_SEL).first();
  if ((await btn.count()) === 0) return false;
  await btn.click({ timeout: 5000 }).catch(() => {});
  await page.waitForLoadState("domcontentloaded").catch(() => {});
  return !/consent\.google/.test(page.url());
}

// ⚠️ 수정금지(승인필요) 2026-08-28 사장님 지시 = 리뷰수는 단어 패턴(RC_AFTER_NUM_RE/RC_BEFORE_NUM_RE) 이 맞은 라벨에서만 = 별점 라벨은 리뷰수 후보에서 제외(서울 169행 4.6→46 오독 수리).
async function readRatingBlock(page: Page): Promise<{
  hasBox: boolean;
  rating: string | null;
  ratingNum: number | null;
  reviewCount: number | null;
  rcSource: "aria" | "text" | null;
}> {
  const raw = await page
    .evaluate(() => {
      const box = document.querySelector("div.F7nice");
      if (!box) return null;
      return {
        labels: Array.from(box.querySelectorAll("[aria-label]")).map(
          (e) => e.getAttribute("aria-label") || "",
        ),
        text: (box as HTMLElement).innerText || "",
      };
    })
    .catch(() => null);
  if (!raw)
    return {
      hasBox: false,
      rating: null,
      ratingNum: null,
      reviewCount: null,
      rcSource: null,
    };
  let rating: string | null = null;
  let ratingNum: number | null = null;
  let reviewCount: number | null = null;
  let rcSource: "aria" | "text" | null = null;
  for (const l of raw.labels) {
    const rc = l.match(RC_AFTER_NUM_RE) || l.match(RC_BEFORE_NUM_RE);
    if (rc && reviewCount == null) {
      const n = parseRcNum(rc[1]);
      if (n != null) {
        reviewCount = n;
        rcSource = "aria";
        continue;
      }
    }
    const rt =
      l.match(RATING_LEAD_RE) ||
      l.match(RATING_WORD_RE) ||
      l.match(RATING_ANY_RE);
    if (rt && rating == null) {
      rating = l.trim();
      ratingNum = Number((rt[1] || rt[2]).replace(",", "."));
      if (!Number.isFinite(ratingNum)) ratingNum = null;
    }
  }
  if (reviewCount == null) {
    const m = raw.text.match(/\((\d{1,3}(?:[.,\s\u00a0]\d{3})+|\d+)\)/u);
    if (m) {
      const n = parseRcNum(m[1]);
      if (n != null) {
        reviewCount = n;
        rcSource = "text";
      }
    }
  }
  return { hasBox: true, rating, ratingNum, reviewCount, rcSource };
}

export async function readPlacePage(
  page: Page,
  pid: string,
  hl: string,
  wantCoords: boolean,
): Promise<PageData> {
  const out: PageData = {
    h1: null,
    address: null,
    category: null,
    urlLat: null,
    urlLng: null,
    reviewCount: null,
    rcSource: null,
    rating: null,
    ratingNum: null,
    status: "OPERATIONAL",
    consentBlocked: false,
  };
  await page.goto(
    `https://www.google.com/maps/place/?q=place_id:${encodeURIComponent(pid)}&hl=${hl}`,
    { waitUntil: "domcontentloaded", timeout: 30000 },
  );
  if (!(await dismissConsent(page))) {
    out.consentBlocked = true;
    return out;
  }
  await page.waitForSelector("h1", { timeout: 15000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const h1 = (
    await page
      .locator("h1")
      .first()
      .innerText()
      .catch(() => "")
  )
    .replace(/\s+/g, " ")
    .trim();
  out.h1 = h1 && !CONSENT_TITLE_RE.test(h1) ? h1 : null;
  const aria = await page
    .locator('button[data-item-id="address"]')
    .first()
    .getAttribute("aria-label", { timeout: 3000 })
    .catch(() => null);
  if (aria) {
    const a = aria
      .replace(/^[^:]{1,24}:\s*/, "")
      .replace(/\s+/g, " ")
      .trim();
    out.address = a || null;
  }
  out.category =
    (
      await page
        .locator('button[jsaction*="category"]')
        .first()
        .innerText({ timeout: 2000 })
        .catch(() => "")
    ).trim() || null;
  if (wantCoords) {
    await page
      .waitForURL(/@-?\d+\.\d+,-?\d+\.\d+/, { timeout: 8000 })
      .catch(() => {});
    const m = page.url().match(/@(-?\d+\.\d+),(-?\d+\.\d+)/);
    if (m) {
      out.urlLat = Number(m[1]);
      out.urlLng = Number(m[2]);
    }
  }
  let rb = await readRatingBlock(page);
  if (rb.hasBox && rb.reviewCount == null) {
    await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
    await page.waitForSelector("h1", { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(1500);
    rb = await readRatingBlock(page);
  }
  out.rating = rb.rating;
  out.ratingNum = rb.ratingNum;
  out.reviewCount = rb.reviewCount;
  out.rcSource = rb.rcSource;
  const mainText =
    (await page
      .locator('div[role="main"]')
      .first()
      .innerText({ timeout: 2000 })
      .catch(() => "")) ||
    (await page
      .locator("body")
      .innerText({ timeout: 2000 })
      .catch(() => ""));
  if (CLOSED_PERM_RE.test(mainText)) out.status = "CLOSED_PERMANENTLY";
  else if (CLOSED_TEMP_RE.test(mainText)) out.status = "CLOSED_TEMPORARILY";
  return out;
}
