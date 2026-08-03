// ═══════════════════════════════════════════════════════════════════════════════
// ⚠️ 수정금지(승인필요) 2026-08-02 사장님 SSOT = **장소 힌트 헤더 단일 관문**(§16 재발명 금지).
// = 해설 호출(Gemini vision)에 "이 사진이 어디의 무엇인가"를 확정 사실로 알려주는 머리글 1벌.
//   왜: 사장님 실증 = 간판·구글맵 화면을 같이 주면 할루시네이션 없이 정확해진다.
//   우리 DB(place_seed_raw)에는 그 힌트가 이미 다 있으므로 **추측 없이 확정값**을 넣는다.
// = 톤앤매너 프롬프트(DB prompts, 언어별 페르소나)는 **건드리지 않는다**. 이 머리글만 그 앞에 붙는다.
//   (메인앱 MIX 여정 호출도 같은 방식 = 고정 프롬프트 + 동적 헤더.)
// = 값이 없는 칸은 **넣지 않는다**(빈칸을 주면 모델이 오히려 헷갈린다 = 사진 있는 장소의 힌트 보유율이
//   고르지 않다는 실측 반영: 장소명 100% / 리뷰수 3,845 / 주소 2,949 / 현지어명 2,258).
// ═══════════════════════════════════════════════════════════════════════════════

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

// 분류 코드 → 사람 말(§ 사전에 없는 외래 전문용어 금지 = 쉬운 한국어).
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

/**
 * 언어별 머리글 1벌. 해설 본문 언어와 같은 말로 써야 톤이 안 깨진다.
 * 반환값이 빈 문자열이면(= 장소명조차 없으면) 호출부는 머리글 없이 기존 그대로 보낸다.
 */
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

  // 그 밖의 언어 = 영어 머리글(모델이 사실 인식에 쓰는 부분이라 본문 언어와 달라도 안전하다).
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
