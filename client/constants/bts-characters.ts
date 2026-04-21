/**
 * BTS 미니앱 7명 캐릭터 데이터
 * 저작권 회피용 아키타입 기반 여행 페르소나
 */

export type BTSCharacter = {
  id: string;
  name: string;           // 한국어 캐릭터명
  nameEn: string;         // 영어명
  archetype: string;      // 아키타입 설명 (한국어)
  archetypeEn: string;    // 아키타입 설명 (영어)
  tags: string[];         // 해시태그 (최대 3개)
  weights: Record<string, number>; // seed_category 가중치 (5.3.2)
  pace: "Ultra-Relaxed" | "Relaxed" | "Normal" | "Packed";
  emoji: string;          // 대표 이모지 (아바타 대신 임시)
  description: string;    // 캐릭터 소개 문구
};

export const BTS_CHARACTERS: BTSCharacter[] = [
  {
    id: "collector",
    name: "컬렉터",
    nameEn: "Collector",
    archetype: "문화 수집가",
    archetypeEn: "Culture Collector",
    tags: ["#Museums", "#Art", "#History"],
    weights: { attraction: 5, healing: 3, restaurant: 2 },
    pace: "Normal",
    emoji: "🎨",
    description: "미술관, 갤러리, 역사적 명소를 수집하듯 돌아다니는 문화 여행가",
  },
  {
    id: "romanticist",
    name: "로맨티스트",
    nameEn: "Romanticist",
    archetype: "낭만주의자",
    archetypeEn: "Romantic Wanderer",
    tags: ["#Romance", "#Sunset", "#Café"],
    weights: { attraction: 5, healing: 3, restaurant: 2 },
    pace: "Relaxed",
    emoji: "🌹",
    description: "석양이 아름다운 곳, 로맨틱한 카페를 찾아 떠나는 감성 여행가",
  },
  {
    id: "explorer",
    name: "익스플로러",
    nameEn: "Explorer",
    archetype: "미학적 탐험가",
    archetypeEn: "Aesthetic Explorer",
    tags: ["#Hotspot", "#Trendy", "#Insta"],
    weights: { hotspot: 5, adventure: 3, attraction: 2 },
    pace: "Packed",
    emoji: "📸",
    description: "SNS에서 화제인 핫플을 직접 찾아가 발견하는 트렌드세터",
  },
  {
    id: "challenger",
    name: "챌린저",
    nameEn: "Challenger",
    archetype: "아드레날린 미식가",
    archetypeEn: "Adrenaline Foodie",
    tags: ["#Adventure", "#Food", "#Extreme"],
    weights: { adventure: 5, restaurant: 3, hotspot: 2 },
    pace: "Packed",
    emoji: "🔥",
    description: "로컬 맛집과 스릴 넘치는 액티비티를 동시에 정복하는 모험가",
  },
  {
    id: "companion",
    name: "컴패니언",
    nameEn: "Companion",
    archetype: "배려형 동행자",
    archetypeEn: "Caring Companion",
    tags: ["#Together", "#Healing", "#Culture"],
    weights: { healing: 5, attraction: 3, restaurant: 2 },
    pace: "Normal",
    emoji: "💜",
    description: "함께하는 사람을 배려하며 편안한 동선을 짜는 따뜻한 동행자",
  },
  {
    id: "recharger",
    name: "리차저",
    nameEn: "Recharger",
    archetype: "럭셔리 휴식가",
    archetypeEn: "Luxury Recharger",
    tags: ["#Luxury", "#Spa", "#Gourmet"],
    weights: { healing: 5, restaurant: 3, attraction: 2 },
    pace: "Relaxed",
    emoji: "✨",
    description: "스파, 미쉐린 레스토랑, 고급 호텔에서 리차지하는 럭셔리 여행가",
  },
  {
    id: "chiller",
    name: "칠러",
    nameEn: "Chiller",
    archetype: "궁극의 힐러",
    archetypeEn: "Ultimate Healer",
    tags: ["#Chill", "#Nature", "#Minimal"],
    weights: { healing: 5, attraction: 3, restaurant: 2 },
    pace: "Ultra-Relaxed",
    emoji: "🧘",
    description: "자연 속에서 느긋하게 쉬며 영혼을 충전하는 미니멀 여행가",
  },
];

export function getCharacterById(id: string): BTSCharacter | undefined {
  return BTS_CHARACTERS.find((c) => c.id === id);
}

// ⚠️ 수정금지(승인필요) — 캐릭터 전신 이미지 URL 매핑 (Screen 3/4 공유 소스)
// iOS Expo Go의 require() 실패 회피용 GitHub raw URL. 이미지 변경 시 여기 한 곳만 수정
const GH_RAW = "https://raw.githubusercontent.com/VROIS/namaneul-wihan-yeohaeng-iljeong/main/assets/images/bts-characters";
export const BTS_CHARACTER_IMAGES: Record<string, { uri: string }> = {
  collector: { uri: `${GH_RAW}/bts_collector.png` },
  romanticist: { uri: `${GH_RAW}/bts_romanticist.png` },
  explorer: { uri: `${GH_RAW}/bts_explorer.png` },
  challenger: { uri: `${GH_RAW}/bts_challenger.png` },
  companion: { uri: `${GH_RAW}/bts_companion.png` },
  recharger: { uri: `${GH_RAW}/bts_recharger.png` },
  chiller: { uri: `${GH_RAW}/bts_chiller.png` },
};
