// ⚠️ 수정금지(승인필요) 2026-08-02 사장님 SSOT = **장소 힌트 헤더 단일 관문**(§16 재발명 금지).

export interface PlaceHint {
  placeName: string; // 유일한 필수값(장소명은 100% 있음)
  nameLocal?: string | null; // 현지어 이름 = 간판에 적힌 그 글자 = 힌트로 가장 강력
  cityName?: string | null;
  country?: string | null;
  address?: string | null;
  category?: string | null; // seed_category (heritage·healing·bts_venue …)
  reviewCount?: number | null;
  priceEur?: number | null;
  summaryKo?: string | null;
  editorialSummary?: string | null;
}

const CATEGORY_KO: Record<string, string> = {
  heritage: "유적·문화재",
  attraction: "즐길거리",
  healing: "휴식·자연",
  adventure: "체험·모험",
  hotspot: "인기 명소",
  shopping: "쇼핑",
  restaurant: "식당",
  bts_venue: "공연장",
  bts_army_zone: "팬 모임 장소",
  bts_merch_store: "굿즈 매장",
};

export function buildPlaceHintHeader(
  hint: PlaceHint | null | undefined,
  lang: string = "ko",
): string {
  if (!hint?.placeName) return "";

  const where = [hint.cityName, hint.country].filter(Boolean).join(", ");
  const cat = hint.category ? CATEGORY_KO[hint.category] || hint.category : "";

  if (lang === "ko") {
    const lines: string[] = [];
    lines.push(
      `[확정 정보] 이 사진은 ${where ? `${where}의 ` : ""}「${hint.placeName}」${cat ? ` (${cat})` : ""} 입니다.`,
    );
    if (hint.nameLocal) lines.push(`현지 표기: ${hint.nameLocal}`);
    if (hint.address) lines.push(`주소: ${hint.address}`);
    if (hint.reviewCount)
      lines.push(`구글 리뷰 수: ${hint.reviewCount.toLocaleString("ko-KR")}`);
    if (hint.priceEur != null)
      lines.push(
        hint.priceEur === 0 ? `입장료: 무료` : `요금: 약 €${hint.priceEur}`,
      );
    if (hint.summaryKo) lines.push(`참고 소개: ${hint.summaryKo}`);
    if (hint.editorialSummary && hint.editorialSummary !== hint.summaryKo)
      lines.push(`참고 소개2: ${hint.editorialSummary}`);
    lines.push(
      `위 정보는 확인된 사실입니다. 다른 장소로 추측하지 말고 이 장소를 해설하십시오. 위 정보를 그대로 나열하지 말고 해설 속에 자연스럽게 녹이십시오.`,
    );
    return lines.join("\n") + "\n\n";
  }

  const lines: string[] = [];
  lines.push(
    `[CONFIRMED FACTS] This photo shows "${hint.placeName}"${where ? ` in ${where}` : ""}${cat ? ` (${cat})` : ""}.`,
  );
  if (hint.nameLocal) lines.push(`Local name: ${hint.nameLocal}`);
  if (hint.address) lines.push(`Address: ${hint.address}`);
  if (hint.reviewCount)
    lines.push(`Google reviews: ${hint.reviewCount.toLocaleString("en-US")}`);
  if (hint.priceEur != null)
    lines.push(
      hint.priceEur === 0 ? `Entry: free` : `Fee: about €${hint.priceEur}`,
    );
  if (hint.summaryKo) lines.push(`Note: ${hint.summaryKo}`);
  lines.push(
    `These facts are verified. Do not guess a different place. Write about THIS place, weaving the facts naturally into the narration instead of listing them.`,
  );
  return lines.join("\n") + "\n\n";
}
