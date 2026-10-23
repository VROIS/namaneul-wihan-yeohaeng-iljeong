// ⚠️ 수정금지(승인필요) 2026-09-30 사장님 결정 = 구글맵 가격 글자("₩30,000–40,000" · "KES 5,000+") → 유로 1벌 = 범위는 높은 값(상한), "X 이상"은 X · 환율 = 창고 환율표(fill/exchange-rates 가 채움) · 페이지 읽기·제미니 몰아 묻기·어사이드 답 넣기가 같이 쓴다 (정본 §)
import type { CardPrice } from "../fill/gmaps-pid-identity/page-reader";

const SYMBOL: Record<string, string> = {
  "€": "EUR",
  "£": "GBP",
  "₩": "KRW",
  "₹": "INR",
  R$: "BRL",
};
// ⚠️ 수정금지(승인필요) 2026-10-23 사장님 결정 = 나라 → 화폐(ISO 3166 → ISO 4217) 1벌 = $·¥ 처럼 여러 나라가 쓰는 기호와 현지 기호(RM · ฿ · Rp 등)는 도시 나라의 화폐로 본다 (정본 §2026-10-23)
const COUNTRY_CUR: Record<string, string> = Object.fromEntries(
  "AD:EUR AE:AED AF:AFN AG:XCD AL:ALL AM:AMD AO:AOA AR:ARS AT:EUR AU:AUD AW:AWG AZ:AZN BA:BAM BB:BBD BD:BDT BE:EUR BF:XOF BG:BGN BH:BHD BI:BIF BJ:XOF BN:BND BO:BOB BR:BRL BS:BSD BT:BTN BW:BWP BY:BYN BZ:BZD CA:CAD CD:CDF CF:XAF CG:XAF CH:CHF CI:XOF CL:CLP CM:XAF CN:CNY CO:COP CR:CRC CU:CUP CV:CVE CY:EUR CZ:CZK DE:EUR DJ:DJF DK:DKK DM:XCD DO:DOP DZ:DZD EC:USD EE:EUR EG:EGP ER:ERN ES:EUR ET:ETB FI:EUR FJ:FJD FR:EUR GA:XAF GB:GBP GD:XCD GE:GEL GH:GHS GM:GMD GN:GNF GQ:XAF GR:EUR GT:GTQ GW:XOF GY:GYD HK:HKD HN:HNL HR:EUR HT:HTG HU:HUF ID:IDR IE:EUR IL:ILS IN:INR IQ:IQD IR:IRR IS:ISK IT:EUR JM:JMD JO:JOD JP:JPY KE:KES KG:KGS KH:KHR KM:KMF KN:XCD KR:KRW KW:KWD KZ:KZT LA:LAK LB:LBP LC:XCD LI:CHF LK:LKR LR:LRD LS:LSL LT:EUR LU:EUR LV:EUR LY:LYD MA:MAD MC:EUR MD:MDL ME:EUR MG:MGA MK:MKD ML:XOF MM:MMK MN:MNT MO:MOP MR:MRU MT:EUR MU:MUR MV:MVR MW:MWK MX:MXN MY:MYR MZ:MZN NA:NAD NE:XOF NG:NGN NI:NIO NL:EUR NO:NOK NP:NPR NZ:NZD OM:OMR PA:PAB PE:PEN PG:PGK PH:PHP PK:PKR PL:PLN PR:USD PT:EUR PY:PYG QA:QAR RO:RON RS:RSD RU:RUB RW:RWF SA:SAR SB:SBD SC:SCR SD:SDG SE:SEK SG:SGD SI:EUR SK:EUR SL:SLE SM:EUR SN:XOF SO:SOS SR:SRD SS:SSP SV:USD SY:SYP SZ:SZL TD:XAF TG:XOF TH:THB TJ:TJS TL:USD TM:TMT TN:TND TO:TOP TR:TRY TT:TTD TW:TWD TZ:TZS UA:UAH UG:UGX US:USD UY:UYU UZ:UZS VA:EUR VE:VES VN:VND VU:VUV WS:WST YE:YER ZA:ZAR ZM:ZMW ZW:ZWL"
    .split(" ")
    .map((kv) => kv.split(":")),
);

export type EurPer = Record<string, number>;
type EurResult = { eur?: number; open?: boolean; why?: string };

export async function loadEurPer(
  c: { query: (q: string, v?: unknown[]) => Promise<any> },
  fx?: string,
): Promise<EurPer> {
  const krw: Record<string, number> = Object.fromEntries(
    (
      await c.query(
        "SELECT target_currency, rate::float AS rate FROM exchange_rates WHERE base_currency='KRW'",
      )
    ).rows.map((r: any) => [r.target_currency, r.rate]),
  );
  const eurPer: EurPer = { EUR: 1 };
  for (const [cur, r] of Object.entries(krw))
    if (krw.EUR && r > 0) eurPer[cur] = krw.EUR / r;
  for (const kv of String(fx || "")
    .split(",")
    .filter(Boolean)) {
    const [cur, v] = kv.split(":");
    if (cur && Number(v) > 0) eurPer[cur.toUpperCase()] = Number(v);
  }
  return eurPer;
}

function currencyOf(
  cp: CardPrice,
  countryCode: string | null | undefined,
): string | undefined {
  return /^[A-Z]{3}$/.test(cp.cur)
    ? cp.cur
    : (SYMBOL[cp.cur] ?? COUNTRY_CUR[countryCode ?? ""]);
}

// ⚠️ 수정금지(승인필요) 2026-10-16 사장님 결정 = 페이지 가격 읽기 1벌 = 식당은 머리줄 → 본문 1인당, 그 밖은 입장권 (정본 §)
const pageCardPriceOf = (
  cat: string | null | undefined,
  r: {
    price?: CardPrice | null;
    perPerson?: CardPrice | null;
    admission?: CardPrice | null;
  },
): CardPrice | null =>
  (cat === "restaurant" ? (r.price ?? r.perPerson) : r.admission) ?? null;

// ⚠️ 수정금지(승인필요) 2026-10-07 사장님 결정 = 유로 환산값은 소수 첫째 자리 반올림 (정본 §)
export function toEur(
  cp: CardPrice,
  countryCode: string | null | undefined,
  eurPer: EurPer,
): EurResult {
  const cur = currencyOf(cp, countryCode);
  if (!cur || !eurPer[cur]) return { why: `환율 없음 ${cur || cp.cur}` };
  const local = cp.hi != null ? cp.hi : cp.lo;
  return {
    eur: Math.round(local * eurPer[cur] * 10) / 10,
    open: cp.hi == null,
  };
}

// ⚠️ 수정금지(승인필요) 2026-10-07 사장님 결정 = TS 가격대도 페이지 가격과 같은 변환(toEur) 1벌로 유로 = 범위는 상한(이 파일 안에서만 쓴다) · TS 응답으로 가격을 정하는 자리(MIX 저장·사진 보충)는 tsPriceDecision 1벌 = decidePrice(3개월 안 페이지 값 > TS > 제미니 > 옛 값) (정본 §)
const tsPriceEur = (
  pr: CardPrice | null | undefined,
  eurPer: EurPer,
): number | null => (pr ? (toEur(pr, null, eurPer).eur ?? null) : null);
export const tsPriceDecision = (
  pr: CardPrice | null | undefined,
  eurPer: EurPer,
  old?: { price: number | null; fresh: boolean } | null,
  geminiPrice?: number | null,
): number | null =>
  decidePrice({
    tsPrice: tsPriceEur(pr, eurPer),
    geminiPrice: geminiPrice ?? null,
    oldPrice: old?.price ?? null,
    oldFromPage: !!old?.fresh,
    pageOpened: false,
  }).price;

export const keepsExisting = (before: number | null, r: EurResult) =>
  !!r.open && before != null && r.eur != null && before >= r.eur;

// ⚠️ 수정금지(승인필요) 2026-10-07 사장님 결정 = 페이지 카드 가격 → 유로 1벌 = 식당은 머리줄 → 본문 1인당, 그 밖은 입장권 · 위가 열린 "X 이상" 증거가 기존 값과 어긋나지 않으면 기존 값 · PID 직행·검색·2차 제미니가 같이 쓴다 (정본 §)
export function pagePriceEur(
  cat: string | null | undefined,
  r: {
    price?: CardPrice | null;
    perPerson?: CardPrice | null;
    admission?: CardPrice | null;
  },
  countryCode: string | null | undefined,
  eurPer: EurPer | undefined,
  before: number | null,
): number | null {
  const cp = pageCardPriceOf(cat, r);
  if (!cp || !eurPer) return null;
  const e = toEur(cp, countryCode, eurPer);
  if (e.eur == null) return null;
  return keepsExisting(before, e) ? before : e.eur;
}

export const priceLabel = (cp: CardPrice) =>
  `${cp.cur}${cp.lo}${cp.hi != null ? `–${cp.hi}` : "+"}`;

// ⚠️ 수정금지(승인필요) 2026-10-06 사장님 결정 = 가격 결정 1벌 = 최신이 최고, 권위 = 구글 페이지 > TS 가격대 > 제미니(0 = 무료, 그대로 받는다) > 옛 값 · 페이지를 열었는데 가격이 없고 제미니도 없으면 옛 값은 버린다(NULL = 모름) · 종류를 보고 값을 바꾸는 판단은 없다 · 모든 길(PID 직행·검색·MIX·2차·LLM 검토)이 이 함수를 부른다 (정본 §)
export const PAGE_PRICE_FRESH_DAYS = 90;
export const FRESH_SQL = `(verify_source LIKE 'gmaps%' AND verified_at > now() - make_interval(days => ${PAGE_PRICE_FRESH_DAYS}))`;
export async function loadOldPrices(
  c: { query: (q: string, v?: unknown[]) => Promise<any> },
  ids: number[],
): Promise<Map<number, { price: number | null; fresh: boolean }>> {
  if (!ids.length) return new Map();
  const r = await c.query(
    `SELECT id, price_eur::float8 AS price, ${FRESH_SQL} AS fresh FROM place_seed_raw WHERE id = ANY($1::int[])`,
    [ids],
  );
  return new Map(
    r.rows.map((x: any) => [
      Number(x.id),
      { price: x.price ?? null, fresh: !!x.fresh },
    ]),
  );
}
type PriceDecision = {
  price: number | null;
  clear: boolean;
  source: "page" | "old-page" | "ts" | "gemini" | "old" | "none";
};
export function decidePrice(a: {
  pagePrice?: number | null;
  tsPrice?: number | null;
  geminiPrice?: number | null;
  oldPrice?: number | null;
  oldFromPage?: boolean;
  pageOpened: boolean;
}): PriceDecision {
  if (a.pagePrice != null)
    return { price: a.pagePrice, clear: false, source: "page" };
  if (!a.pageOpened && a.oldFromPage && a.oldPrice != null)
    return { price: a.oldPrice, clear: false, source: "old-page" };
  if (a.tsPrice != null)
    return { price: a.tsPrice, clear: false, source: "ts" };
  if (a.geminiPrice != null)
    return { price: a.geminiPrice, clear: false, source: "gemini" };
  if (!a.pageOpened && a.oldPrice != null)
    return { price: a.oldPrice, clear: false, source: "old" };
  return { price: null, clear: a.oldPrice != null, source: "none" };
}
