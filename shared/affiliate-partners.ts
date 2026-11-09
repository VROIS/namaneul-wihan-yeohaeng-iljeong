// ⚠️ 수정금지(승인필요) 2026-11-09 사장님 결정 = 제휴처 1벌 = 수수료 높은 순서(같으면 쿠키 긴 순) · 예약은 한 곳만 = 그 장소가 매칭된 첫 제휴처 · 공개 ID 만(비밀 아님) (정본 2026-11-09)
export type AffiliatePartner = "gyg" | "viator" | "klook";

type PartnerSpec = {
  key: AffiliatePartner;
  ratePct: number;
  cookieDays: number;
  params: (subId: string) => Record<string, string>;
};

export const AFFILIATE_PARTNERS: PartnerSpec[] = [
  {
    key: "gyg",
    ratePct: 8,
    cookieDays: 31,
    params: (sub) => ({ partner_id: "PITH2ZG", cmp: sub }),
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
  },
  {
    key: "klook",
    ratePct: 5,
    cookieDays: 30,
    params: () => ({ aid: "142563" }),
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

export function affiliateUrl(link: AffiliateLink, subId: string): string {
  const spec = AFFILIATE_PARTNERS.find((p) => p.key === link.partner)!;
  const u = new URL(link.url);
  for (const [k, v] of Object.entries(spec.params(subId)))
    u.searchParams.set(k, v);
  return u.toString();
}
