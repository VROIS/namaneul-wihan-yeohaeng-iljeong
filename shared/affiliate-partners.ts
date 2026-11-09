// ⚠️ 수정금지(승인필요) 2026-11-09 사장님 결정 = 제휴처 1벌 = 수수료 높은 순서(같으면 쿠키 긴 순) · 예약은 한 곳만 = 그 장소가 매칭된 첫 제휴처 · 공개 ID 만(비밀 아님) (정본 2026-11-09)
export type AffiliatePartner = "gyg" | "viator" | "klook";

export type AppLang = "ko" | "en" | "ja" | "zh" | "fr" | "es" | "de";
export const APP_LANGS: readonly AppLang[] = [
  "ko",
  "en",
  "ja",
  "zh",
  "fr",
  "es",
  "de",
];
// 구글맵 주소 뒤에 붙이는 언어 값(hl)
export const MAPS_HL: Record<AppLang, string> = {
  ko: "ko",
  en: "en",
  ja: "ja",
  zh: "zh-CN",
  fr: "fr",
  es: "es",
  de: "de",
};

type PartnerSpec = {
  key: AffiliatePartner;
  ratePct: number;
  cookieDays: number;
  params: (subId: string) => Record<string, string>;
  // 앱 언어 → 제휴사 주소 맨 앞 언어 경로(없으면 접두사 없이 = 영어)
  locales: Partial<Record<AppLang, string>>;
};

export const AFFILIATE_PARTNERS: PartnerSpec[] = [
  {
    key: "gyg",
    ratePct: 8,
    cookieDays: 31,
    params: (sub) => ({ partner_id: "PITH2ZG", cmp: sub }),
    locales: {
      ko: "ko-kr",
      en: "en-us",
      ja: "ja-jp",
      zh: "zh-cn",
      fr: "fr-fr",
      es: "es-es",
      de: "de-de",
    },
  },
  {
    key: "viator",
    ratePct: 8,
    cookieDays: 30,
    params: (sub) => ({
      pid: "P00330607",
      mcid: "42383",
      campaign: sub,
    }),
    locales: { ja: "ja-JP", fr: "fr-FR", es: "es-ES", de: "de-DE" },
  },
  {
    key: "klook",
    ratePct: 5,
    cookieDays: 30,
    params: () => ({ aid: "142563" }),
    locales: {
      ko: "ko",
      ja: "ja",
      zh: "zh-CN",
      fr: "fr",
      es: "es",
      de: "de",
    },
  },
];

export type AffiliateLink = {
  partner: AffiliatePartner;
  partnerPlaceId: string;
  url: string;
  matchedBy: string;
  meters: number | null;
};

export type AffiliateLinksFile = {
  builtAt: string;
  places: Record<string, { cityId: number; links: AffiliateLink[] }>;
  rejected: string[];
};

export function pickAffiliate(links: AffiliateLink[]): AffiliateLink | null {
  for (const p of AFFILIATE_PARTNERS) {
    const hit = links.find((l) => l.partner === p.key);
    if (hit) return hit;
  }
  return null;
}

export function affiliateUrl(
  link: AffiliateLink,
  subId: string,
  lang?: AppLang,
): string {
  const spec = AFFILIATE_PARTNERS.find((p) => p.key === link.partner)!;
  const u = new URL(link.url);
  const prefix = lang ? spec.locales[lang] : undefined;
  if (prefix) u.pathname = `/${prefix}${u.pathname}`;
  for (const [k, v] of Object.entries(spec.params(subId)))
    u.searchParams.set(k, v);
  return u.toString();
}
