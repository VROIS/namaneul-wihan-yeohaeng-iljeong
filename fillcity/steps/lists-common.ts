// ⚠️ 수정금지(승인필요) 2026-10-07 사장님 결정 = 핫스팟 문장 1개를 "photo spots in {도시}"(도심 확대, 사진관·포토부스 쓰레기)에서 100km 전망·사진 포인트(구글 카메라 마커 = Observation deck·Scenic spot·Viewpoint) 문장으로 교체 = 니스 50·까오슝 52 실측, 프랑스어 point de vue 는 까오슝에서 12개라 영어 문장으로 (정본 §)

import fs from "fs";
import path from "path";
import { ROOT } from "./common";

// 문장 = 도시 이름(영어)만 바꿔 끼운다. view = 도시 중심 확대 9단계로 열기(100km 안팎이 보이는 크기), intended = 문장이 묻는 분류(선별 단계가 라벨로 다시 판정).
export const LIST_QUERIES: {
  key: string;
  q: (n: string) => string;
  view: boolean;
  intended: string;
}[] = [
  {
    key: "city-attractions",
    q: (n) => `tourist attractions ${n}`,
    view: true,
    intended: "attraction",
  },
  {
    key: "near100-attractions",
    q: (n) => `tourist attractions within 100 km of ${n}`,
    view: true,
    intended: "attraction",
  },
  {
    key: "adventure",
    q: (n) => `adventure places within 100 km of ${n}`,
    view: true,
    intended: "adventure",
  },
  {
    key: "healing",
    q: (n) => `parks and gardens within 100 km of ${n}`,
    view: true,
    intended: "healing",
  },
  {
    key: "shopping",
    q: (n) => `shopping places within 100 km of ${n}`,
    view: true,
    intended: "shopping",
  },
  {
    key: "theme",
    q: (n) => `theme parks and amusement attractions within 100 km of ${n}`,
    view: true,
    intended: "attraction",
  },
  {
    key: "photospots",
    q: (n) => `viewpoints and observation decks within 100 km of ${n}`,
    view: true,
    intended: "hotspot",
  },
  {
    key: "instagram",
    q: (n) => `instagrammable places in ${n}`,
    view: false,
    intended: "hotspot",
  },
  {
    key: "historic",
    q: (n) => `historic landmarks in ${n}`,
    view: false,
    intended: "heritage",
  },
  {
    key: "restaurants",
    q: (n) => `best restaurants ${n}`,
    view: false,
    intended: "restaurant",
  },
];

// ⚠️ 수정금지(승인필요) 2026-10-07 사장님 결정 = 목록 정제의 분류칩 표(숙박 = 입력에서 뺌 · 장소 = 바로 통과)는 코드 상수 1벌 = 저장소에 따라다닌다(json 파일은 .gitignore 에 걸려 커밋되지 않았다) (정본 §)
export const LABEL_STATES: { lodging: string[]; place: string[] } = {
  lodging: [
    "\\d-star hotel",
    "^hotel$",
    "resort",
    "hostel",
    "\\blodge\\b",
    "guest ?house",
    "\\briad\\b",
    "bed (and|&) breakfast",
    "camping",
  ],
  place: [
    "Historical landmark",
    "Historical place",
    "Art museum",
    "History museum",
    "Museum",
    "Mosque",
    "Synagogue",
    "Cemetery",
    "Garden",
    "Botanical garden",
    "Community garden",
    "Park",
    "State park",
    "Memorial park",
    "Farm",
    "Children's farm",
    "Shopping mall",
    "Market",
    "Flea market",
    "Traditional market",
    "Water park",
    "Amusement park",
    "Amusement park ride",
    "Amusement center",
    "Theme park",
    "Cafe",
    "Coffee shop",
    "Bakery",
    "Dance restaurant",
    "Restaurant",
  ],
};

// ⚠️ 수정금지(승인필요) 2026-10-07 사장님 결정 = 도시 폴더의 목록 원본 읽기 1벌(선별·정제가 같이 쓴다) = 이름순 = 같은 문장은 나중 것이 이긴다 (정본 §)
export function readListRaws(cityId: number): { file: string; json: any }[] {
  const dir = path.join(ROOT, "docs", "raw", String(cityId));
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => /_gmaps-list-[a-z0-9-]+(_\d+)?\.json$/.test(f))
    .sort()
    .map((f) => ({
      file: f,
      json: JSON.parse(fs.readFileSync(path.join(dir, f), "utf-8")),
    }));
}

/** 목록 한 줄 글에서 분류 글자(별점 괄호 뒤 첫 칸). 구글이 끼우는 사설 문자는 영문자 묶음이 끊긴다. */
export function labelOfLine(line: string): string | null {
  const m = String(line || "").match(
    /(?:\)|No reviews)[^|]*\|\s*([A-Za-z0-9][A-Za-z0-9 ,'&\-/]*[A-Za-z])/,
  );
  return m ? m[1].trim() : null;
}
