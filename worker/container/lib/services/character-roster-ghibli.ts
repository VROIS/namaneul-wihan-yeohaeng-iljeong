import { estimateFamilyAges } from "./protagonist-generator";

export interface GhibliCharacter {
  id: string;
  name: string;
  nameEn: string;
  ageGroup: string;
  gender: "male" | "female";
  role: "traveler" | "guide";
  assetPath: string; // 에셋 저장 경로
  ghibliStylePrompt: string;
  anchor: string;
}

export interface VehicleConfig {
  type: "sedan" | "van" | "sprinter_bus";
}

// ⚠️ 수정금지(승인필요) 2026-11-02 사장님 지시 "1번하고 2번만 하고 통과하고 나한테 얘기해" = 지금 코드: 캐릭터 = 로마자 이름 · 3D 그림 그대로의 겉모습(머리·옷·신발) · 18명 사이 겹치지 않는 옷 표시 (정본 2026-11-01)
export const GHIBLI_CHARACTER_ROSTER_18: Record<string, GhibliCharacter> = {
  m_20s: {
    id: "m_20s",
    name: "민준",
    nameEn: "Min-jun",
    ageGroup: "20s",
    gender: "male",
    role: "traveler",
    assetPath: "assets/characters/m_20s.jpg",
    ghibliStylePrompt:
      "wavy swept black hair, no glasses, navy pullover hoodie, brown backpack straps, black trousers, white-and-navy sneakers",
    anchor: "navy pullover hoodie, brown backpack",
  },
  f_20s: {
    id: "f_20s",
    name: "서연",
    nameEn: "Seo-yeon",
    ageGroup: "20s",
    gender: "female",
    role: "traveler",
    assetPath: "assets/characters/f_20s.jpg",
    ghibliStylePrompt:
      "long wavy dark hair, navy beret with a daisy pin, pink-and-cream striped cardigan over a white blouse, cream crossbody bag, blue jeans, brown boots",
    anchor: "navy beret",
  },

  m_30s: {
    id: "m_30s",
    name: "도현",
    nameEn: "Do-hyun",
    ageGroup: "30s",
    gender: "male",
    role: "traveler",
    assetPath: "assets/characters/m_30s.jpg",
    ghibliStylePrompt:
      "tousled black hair, light stubble, olive shirt-jacket over a navy striped tee, blank lanyard badge, grey trousers, dark hiking shoes",
    anchor: "olive shirt-jacket",
  },
  f_30s: {
    id: "f_30s",
    name: "지민",
    nameEn: "Ji-min",
    ageGroup: "30s",
    gender: "female",
    role: "traveler",
    assetPath: "assets/characters/f_30s.jpg",
    ghibliStylePrompt:
      "shoulder-length wavy dark-brown hair, long olive wool coat, cream knit scarf, rust sweater, camera on a neck strap, grey trousers, brown boots",
    anchor: "long olive coat",
  },

  m_40s: {
    id: "m_40s",
    name: "정우",
    nameEn: "Jung-woo",
    ageGroup: "40s",
    gender: "male",
    role: "traveler",
    assetPath: "assets/characters/m_40s.jpg",
    ghibliStylePrompt:
      "short dark hair greying at the temples, no glasses, navy polo shirt, khaki chinos, black sneakers",
    anchor: "navy polo",
  },
  f_40s: {
    id: "f_40s",
    name: "유진",
    nameEn: "Yu-jin",
    ageGroup: "40s",
    gender: "female",
    role: "traveler",
    assetPath: "assets/characters/f_40s.jpg",
    ghibliStylePrompt:
      "dark hair in a low bun, sage-green pullover sweater, tan floral neckerchief, charcoal trousers, brown flat shoes, small brown shoulder bag",
    anchor: "sage-green sweater",
  },

  m_50s: {
    id: "m_50s",
    name: "성호",
    nameEn: "Sung-ho",
    ageGroup: "50s",
    gender: "male",
    role: "traveler",
    assetPath: "assets/characters/m_50s.jpg",
    ghibliStylePrompt:
      "swept grey hair, round wire glasses, dark-green knit cardigan over a cream patterned fleece vest and an orange-blue plaid shirt, brown messenger bag, brown trousers, brown boots",
    anchor: "green cardigan, plaid shirt",
  },
  f_50s: {
    id: "f_50s",
    name: "혜경",
    nameEn: "Hye-kyung",
    ageGroup: "50s",
    gender: "female",
    role: "traveler",
    assetPath: "assets/characters/f_50s.jpg",
    ghibliStylePrompt:
      "short dark hair with grey, wide straw hat with a cream ribbon, pastel floral scarf, cream sweater, olive canvas bag, olive trousers, grey slip-on shoes",
    anchor: "straw hat",
  },

  m_60s: {
    id: "m_60s",
    name: "종인",
    nameEn: "Jong-in",
    ageGroup: "60s",
    gender: "male",
    role: "traveler",
    assetPath: "assets/characters/m_60s.jpg",
    ghibliStylePrompt:
      "silver-grey hair, round glasses, brown cable-knit vest over a cream cardigan, blue-white striped shirt, grey trousers, brown loafers",
    anchor: "brown knit vest",
  },
  f_60s: {
    id: "f_60s",
    name: "순자",
    nameEn: "Soon-ja",
    ageGroup: "60s",
    gender: "female",
    role: "traveler",
    assetPath: "assets/characters/f_60s.jpg",
    ghibliStylePrompt:
      "silver-grey updo with a wooden hair stick, brown scarf, patterned fringed knit shawl-cardigan, rust sweater, dark-brown trousers, brown loafers",
    anchor: "fringed knit shawl",
  },

  m_kids: {
    id: "m_kids",
    name: "하준",
    nameEn: "Ha-jun",
    ageGroup: "kids",
    gender: "male",
    role: "traveler",
    assetPath: "assets/characters/m_10s_kid.jpg",
    ghibliStylePrompt:
      "boy about 8, yellow cap with a green clover, light-grey button cardigan, blue-white striped tee, navy backpack with yellow straps, navy jeans, blue-yellow sneakers",
    anchor: "yellow cap",
  },
  f_kids: {
    id: "f_kids",
    name: "아린",
    nameEn: "A-rin",
    ageGroup: "kids",
    gender: "female",
    role: "traveler",
    assetPath: "assets/characters/f_10s_kid.jpg",
    ghibliStylePrompt:
      "girl about 7, dark wavy pigtails with pink bows, cream cable-knit cardigan, brown-white striped shirt, dark jeans, pink sneakers",
    anchor: "pink-bow pigtails",
  },

  m_teen: {
    id: "m_teen",
    name: "시우",
    nameEn: "Si-woo",
    ageGroup: "teen",
    gender: "male",
    role: "traveler",
    assetPath: "assets/characters/m_10s_teen.jpg",
    ghibliStylePrompt:
      "boy about 15, messy black hair, open navy zip hoodie over a white tee, headphones around the neck, black backpack, black jeans",
    anchor: "open zip hoodie, headphones",
  },
  f_teen: {
    id: "f_teen",
    name: "수아",
    nameEn: "Su-a",
    ageGroup: "teen",
    gender: "female",
    role: "traveler",
    assetPath: "assets/characters/f_10s_teen.jpg",
    ghibliStylePrompt:
      "girl about 15, short wavy dark-brown hair with a star clip, white collar under a pastel pink-blue-cream striped sweater, wide blue jeans, navy backpack",
    anchor: "striped sweater, star clip",
  },

  m_20s_sub: {
    id: "m_20s_sub",
    name: "태양",
    nameEn: "Tae-yang",
    ageGroup: "20s",
    gender: "male",
    role: "traveler",
    assetPath: "assets/characters/m_couple_20s.jpg",
    ghibliStylePrompt:
      "wavy dark-brown hair, white button shirt with rolled sleeves, brown belt, olive crossbody bag, dark-grey chinos, white sneakers",
    anchor: "white rolled-sleeve shirt",
  },
  f_20s_sub: {
    id: "f_20s_sub",
    name: "채원",
    nameEn: "Chae-won",
    ageGroup: "20s",
    gender: "female",
    role: "traveler",
    assetPath: "assets/characters/f_couple_20s.jpg",
    ghibliStylePrompt:
      "long wavy dark-brown hair with a daisy clip, cream floral ruffled long-sleeve midi dress, white socks, brown mary-jane shoes",
    anchor: "cream floral midi dress",
  },

  guide_korean_m_40s: {
    id: "guide_korean_m_40s",
    name: "민우 (40대 현지 거주 한국인 드라이빙 가이드)",
    nameEn: "Min-woo",
    ageGroup: "guide",
    gender: "male",
    role: "guide",
    assetPath: "assets/characters/guide_korean_m_40s.jpg",
    ghibliStylePrompt:
      "side-parted short black hair, round dark-rimmed glasses, navy blazer over a light-blue shirt, no tie, grey trousers, brown leather shoes",
    anchor: "navy blazer",
  },
  guide_korean_f_40s: {
    id: "guide_korean_f_40s",
    name: "지은 (40대 현지 거주 한국인 VIP 가이드)",
    nameEn: "Ji-eun",
    ageGroup: "guide",
    gender: "female",
    role: "guide",
    assetPath: "assets/characters/guide_korean_f_40s.jpg",
    ghibliStylePrompt:
      "shoulder-length wavy black hair, no glasses, beige belted trench coat, colourful patterned silk neck scarf, small dark crossbody bag, black trousers, dark-brown chelsea boots",
    anchor: "beige trench coat",
  },
};

// ⚠️ 수정금지(승인필요) 2026-09-27 사장님 결정 = 차량 = 종류(type)만 = 안 쓰는 이름·설명·지시문 칸 삭제 (정본 §)
export function getVehicleConfigByCompanionCount(
  companionCount: number = 2,
): VehicleConfig {
  if (companionCount <= 4) {
    return { type: "sedan" };
  }

  if (companionCount <= 8) {
    return { type: "van" };
  }

  return { type: "sprinter_bus" };
}

function characterByAge(
  age: number,
  gender: "male" | "female",
): GhibliCharacter {
  const g = gender === "male" ? "m" : "f";
  let key: string;
  if (age < 13) key = `${g}_kids`;
  else if (age < 20) key = `${g}_teen`;
  else if (age < 30) key = `${g}_20s`;
  else if (age < 45) key = `${g}_30s`;
  else if (age < 55) key = `${g}_40s`;
  else if (age < 65) key = `${g}_50s`;
  else key = `${g}_60s`;
  return GHIBLI_CHARACTER_ROSTER_18[key];
}

export interface GhibliCast {
  travelers: GhibliCharacter[];
  totalTravelerCount: number;
  koreanGuide: GhibliCharacter;
  vehicle: VehicleConfig;
}

// ⚠️ 수정금지(승인필요) 2026-11-02 사장님 지시 "그 매트릭스대로 들어가야지. 옛 것을 왜 살려" = 지금 코드: 출연진 = '누구랑'·인원 + 생년월일 매트릭스 1벌(자녀 = 본인−30 · 부모 = 본인+25) · 동반자 나이 입력 읽기 삭제 (정본 2026-11-01)
export function selectGhibliCast(opts: {
  companionType?: string | null;
  companionCount?: number | null;
  userAge?: number | null;
  userGender?: string | null;
}): GhibliCast {
  const count = Math.max(1, opts.companionCount || 2);
  const gender: "male" | "female" =
    opts.userGender === "female" ? "female" : "male";
  const spouseGender: "male" | "female" = gender === "male" ? "female" : "male";
  const age = opts.userAge || 40; // 생년월일 = 로그인 필수 입력값. 미연결 계정(인증 정식화 전) = 40대 폴백
  const est = estimateFamilyAges(age);
  const childAge = Math.max(5, est.estimatedChildAge); // 영상용 최소 5살
  const parentAge = est.estimatedParentAge;

  const self = characterByAge(age, gender);
  const travelers: GhibliCharacter[] = [self];

  switch (opts.companionType) {
    case "Single":
      break; // 본인 1명
    case "Couple":
      travelers.push(characterByAge(age, spouseGender));
      break;
    case "Family": {
      travelers.push(characterByAge(age, spouseGender));
      const restCount = Math.max(1, count - 2);
      for (let i = 0; i < restCount; i++) {
        travelers.push(
          characterByAge(childAge, i % 2 === 0 ? "female" : "male"),
        );
      }
      break;
    }
    case "ExtendedFamily": {
      travelers.push(characterByAge(age, spouseGender));
      travelers.push(characterByAge(parentAge, "male"));
      travelers.push(characterByAge(parentAge, "female"));
      for (let i = 0; i < count - 4; i++) {
        travelers.push(
          characterByAge(childAge, i % 2 === 0 ? "female" : "male"),
        );
      }
      break;
    }
    case "Group":
    default: {
      for (let i = 1; i < count; i++) {
        travelers.push(
          characterByAge(age, i % 2 === 1 ? spouseGender : gender),
        );
      }
      break;
    }
  }

  return {
    travelers: travelers.slice(0, 4),
    totalTravelerCount: count,
    koreanGuide: GHIBLI_CHARACTER_ROSTER_18.guide_korean_m_40s,
    vehicle: getVehicleConfigByCompanionCount(count),
  };
}
