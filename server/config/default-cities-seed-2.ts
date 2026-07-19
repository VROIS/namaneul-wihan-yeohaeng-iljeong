// 기본 도시 시드 데이터(도시 테이블 비었을 때 1회 입력용) = routes.ts 분리(2026-07-15 §0 슬림화, 순수 이동)
// 유럽 나머지(스페인~폴란드, part 2/2). part 1 = default-cities-seed-1.ts

import type { DefaultCitySeed } from "./default-cities-seed-1";

export const DEFAULT_CITIES_PART2: DefaultCitySeed[] = [
  // 스페인
  {
    name: "마드리드",
    country: "스페인",
    countryCode: "ES",
    latitude: 40.4168,
    longitude: -3.7038,
    timezone: "Europe/Madrid",
    primaryLanguage: "es",
  },
  {
    name: "세비야",
    country: "스페인",
    countryCode: "ES",
    latitude: 37.3891,
    longitude: -5.9845,
    timezone: "Europe/Madrid",
    primaryLanguage: "es",
  },
  // 독일
  {
    name: "베를린",
    country: "독일",
    countryCode: "DE",
    latitude: 52.52,
    longitude: 13.405,
    timezone: "Europe/Berlin",
    primaryLanguage: "de",
  },
  {
    name: "뮌헨",
    country: "독일",
    countryCode: "DE",
    latitude: 48.1351,
    longitude: 11.582,
    timezone: "Europe/Berlin",
    primaryLanguage: "de",
  },
  // 오스트리아
  {
    name: "빈",
    country: "오스트리아",
    countryCode: "AT",
    latitude: 48.2082,
    longitude: 16.3738,
    timezone: "Europe/Vienna",
    primaryLanguage: "de",
  },
  {
    name: "잘츠부르크",
    country: "오스트리아",
    countryCode: "AT",
    latitude: 47.8095,
    longitude: 13.055,
    timezone: "Europe/Vienna",
    primaryLanguage: "de",
  },
  // 스위스
  {
    name: "취리히",
    country: "스위스",
    countryCode: "CH",
    latitude: 47.3769,
    longitude: 8.5417,
    timezone: "Europe/Zurich",
    primaryLanguage: "de",
  },
  {
    name: "인터라켄",
    country: "스위스",
    countryCode: "CH",
    latitude: 46.6863,
    longitude: 7.8632,
    timezone: "Europe/Zurich",
    primaryLanguage: "de",
  },
  {
    name: "루체른",
    country: "스위스",
    countryCode: "CH",
    latitude: 47.0502,
    longitude: 8.3093,
    timezone: "Europe/Zurich",
    primaryLanguage: "de",
  },
  // 네덜란드
  {
    name: "암스테르담",
    country: "네덜란드",
    countryCode: "NL",
    latitude: 52.3676,
    longitude: 4.9041,
    timezone: "Europe/Amsterdam",
    primaryLanguage: "nl",
  },
  // 체코
  {
    name: "프라하",
    country: "체코",
    countryCode: "CZ",
    latitude: 50.0755,
    longitude: 14.4378,
    timezone: "Europe/Prague",
    primaryLanguage: "cs",
  },
  // 포르투갈
  {
    name: "리스본",
    country: "포르투갈",
    countryCode: "PT",
    latitude: 38.7223,
    longitude: -9.1393,
    timezone: "Europe/Lisbon",
    primaryLanguage: "pt",
  },
  {
    name: "포르투",
    country: "포르투갈",
    countryCode: "PT",
    latitude: 41.1579,
    longitude: -8.6291,
    timezone: "Europe/Lisbon",
    primaryLanguage: "pt",
  },
  // 그리스
  {
    name: "아테네",
    country: "그리스",
    countryCode: "GR",
    latitude: 37.9838,
    longitude: 23.7275,
    timezone: "Europe/Athens",
    primaryLanguage: "el",
  },
  {
    name: "산토리니",
    country: "그리스",
    countryCode: "GR",
    latitude: 36.3932,
    longitude: 25.4615,
    timezone: "Europe/Athens",
    primaryLanguage: "el",
  },
  // 터키
  {
    name: "이스탄불",
    country: "터키",
    countryCode: "TR",
    latitude: 41.0082,
    longitude: 28.9784,
    timezone: "Europe/Istanbul",
    primaryLanguage: "tr",
  },
  // 크로아티아
  {
    name: "두브로브니크",
    country: "크로아티아",
    countryCode: "HR",
    latitude: 42.6507,
    longitude: 18.0944,
    timezone: "Europe/Zagreb",
    primaryLanguage: "hr",
  },
  // 헝가리
  {
    name: "부다페스트",
    country: "헝가리",
    countryCode: "HU",
    latitude: 47.4979,
    longitude: 19.0402,
    timezone: "Europe/Budapest",
    primaryLanguage: "hu",
  },
  // 영국
  {
    name: "에든버러",
    country: "영국",
    countryCode: "GB",
    latitude: 55.9533,
    longitude: -3.1883,
    timezone: "Europe/London",
    primaryLanguage: "en",
  },
  // 벨기에
  {
    name: "브뤼셀",
    country: "벨기에",
    countryCode: "BE",
    latitude: 50.8503,
    longitude: 4.3517,
    timezone: "Europe/Brussels",
    primaryLanguage: "fr",
  },
  // 덴마크
  {
    name: "코펜하겐",
    country: "덴마크",
    countryCode: "DK",
    latitude: 55.6761,
    longitude: 12.5683,
    timezone: "Europe/Copenhagen",
    primaryLanguage: "da",
  },
  // 스웨덴
  {
    name: "스톡홀름",
    country: "스웨덴",
    countryCode: "SE",
    latitude: 59.3293,
    longitude: 18.0686,
    timezone: "Europe/Stockholm",
    primaryLanguage: "sv",
  },
  // 핀란드
  {
    name: "헬싱키",
    country: "핀란드",
    countryCode: "FI",
    latitude: 60.1699,
    longitude: 24.9384,
    timezone: "Europe/Helsinki",
    primaryLanguage: "fi",
  },
  // 모나코
  {
    name: "모나코",
    country: "모나코",
    countryCode: "MC",
    latitude: 43.7384,
    longitude: 7.4246,
    timezone: "Europe/Monaco",
    primaryLanguage: "fr",
  },
  // 폴란드
  {
    name: "바르샤바",
    country: "폴란드",
    countryCode: "PL",
    latitude: 52.2297,
    longitude: 21.0122,
    timezone: "Europe/Warsaw",
    primaryLanguage: "pl",
  },
];
