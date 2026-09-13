import { estimateFamilyAges } from "./protagonist-generator";

export interface GhibliCharacter {
  id: string;
  name: string;
  ageGroup: string;
  gender: "male" | "female";
  role: "traveler" | "guide";
  assetPath: string; // 에셋 저장 경로
  ghibliStylePrompt: string;
}

export interface VehicleConfig {
  type: "sedan" | "van" | "sprinter_bus";
  name: string; // "고급 승용차", "8인승 밴", "벤츠 스프린터급 18인승 버스"
  description: string;
  ghibliVehiclePrompt: string;
}

export const GHIBLI_CHARACTER_ROSTER_18: Record<string, GhibliCharacter> = {
  m_20s: {
    id: "m_20s",
    name: "민준",
    ageGroup: "20s",
    gender: "male",
    role: "traveler",
    assetPath: "assets/characters/m_20s.jpg",
    ghibliStylePrompt:
      "20s stylish Korean male traveler with navy jacket, Studio Ghibli anime style, warm lighting",
  },
  f_20s: {
    id: "f_20s",
    name: "서연",
    ageGroup: "20s",
    gender: "female",
    role: "traveler",
    assetPath: "assets/characters/f_20s.jpg",
    ghibliStylePrompt:
      "20s elegant Korean female traveler with beret and beige coat, Studio Ghibli anime style",
  },

  m_30s: {
    id: "m_30s",
    name: "도현",
    ageGroup: "30s",
    gender: "male",
    role: "traveler",
    assetPath: "assets/characters/m_30s.jpg",
    ghibliStylePrompt:
      "30s handsome urban Korean male traveler recording travel vlogs with a sleek modern smartphone, Studio Ghibli anime style",
  },
  f_30s: {
    id: "f_30s",
    name: "지민",
    ageGroup: "30s",
    gender: "female",
    role: "traveler",
    assetPath: "assets/characters/f_30s.jpg",
    ghibliStylePrompt:
      "30s sophisticated Korean female in stylish trench coat, Studio Ghibli anime style",
  },

  m_40s: {
    id: "m_40s",
    name: "정우",
    ageGroup: "40s",
    gender: "male",
    role: "traveler",
    assetPath: "assets/characters/m_40s.jpg",
    ghibliStylePrompt:
      "40s refined Korean male traveler in casual blazer, Studio Ghibli anime style",
  },
  f_40s: {
    id: "f_40s",
    name: "유진",
    ageGroup: "40s",
    gender: "female",
    role: "traveler",
    assetPath: "assets/characters/f_40s.jpg",
    ghibliStylePrompt:
      "40s graceful Korean female traveler with silk scarf, Studio Ghibli anime style",
  },

  m_50s: {
    id: "m_50s",
    name: "성호",
    ageGroup: "50s",
    gender: "male",
    role: "traveler",
    assetPath: "assets/characters/m_50s.jpg",
    ghibliStylePrompt:
      "50s distinguished Korean male traveler, Studio Ghibli anime style",
  },
  f_50s: {
    id: "f_50s",
    name: "혜경",
    ageGroup: "50s",
    gender: "female",
    role: "traveler",
    assetPath: "assets/characters/f_50s.jpg",
    ghibliStylePrompt:
      "50s warm elegant Korean female traveler, Studio Ghibli anime style",
  },

  m_60s: {
    id: "m_60s",
    name: "종인",
    ageGroup: "60s",
    gender: "male",
    role: "traveler",
    assetPath: "assets/characters/m_60s.jpg",
    ghibliStylePrompt:
      "60s gentle Korean grandfather traveler with hat, Studio Ghibli style",
  },
  f_60s: {
    id: "f_60s",
    name: "순자",
    ageGroup: "60s",
    gender: "female",
    role: "traveler",
    assetPath: "assets/characters/f_60s.jpg",
    ghibliStylePrompt:
      "60s kind Korean grandmother traveler with cardigan, Studio Ghibli style",
  },

  m_kids: {
    id: "m_kids",
    name: "하준",
    ageGroup: "kids",
    gender: "male",
    role: "traveler",
    assetPath: "assets/characters/m_10s_kid.jpg",
    ghibliStylePrompt:
      "7-year-old cute Korean boy with yellow backpack, Studio Ghibli anime style",
  },
  f_kids: {
    id: "f_kids",
    name: "아린",
    ageGroup: "kids",
    gender: "female",
    role: "traveler",
    assetPath: "assets/characters/f_10s_kid.jpg",
    ghibliStylePrompt:
      "6-year-old adorable Korean girl with hair ribbons, Studio Ghibli anime style",
  },

  m_teen: {
    id: "m_teen",
    name: "시우",
    ageGroup: "teen",
    gender: "male",
    role: "traveler",
    assetPath: "assets/characters/m_10s_teen.jpg",
    ghibliStylePrompt:
      "Teenage Korean boy with headphones, Studio Ghibli anime style",
  },
  f_teen: {
    id: "f_teen",
    name: "수아",
    ageGroup: "teen",
    gender: "female",
    role: "traveler",
    assetPath: "assets/characters/f_10s_teen.jpg",
    ghibliStylePrompt:
      "Teenage Korean girl with smartphone, Studio Ghibli anime style",
  },

  m_20s_sub: {
    id: "m_20s_sub",
    name: "태양",
    ageGroup: "20s",
    gender: "male",
    role: "traveler",
    assetPath: "assets/characters/m_couple_20s.jpg",
    ghibliStylePrompt: "20s cheerful Korean male traveler, Studio Ghibli style",
  },
  f_20s_sub: {
    id: "f_20s_sub",
    name: "채원",
    ageGroup: "20s",
    gender: "female",
    role: "traveler",
    assetPath: "assets/characters/f_couple_20s.jpg",
    ghibliStylePrompt:
      "20s artistic Korean female traveler, Studio Ghibli style",
  },

  guide_korean_m_40s: {
    id: "guide_korean_m_40s",
    name: "민우 (40대 파리 현지 거주 한국인 드라이빙 가이드)",
    ageGroup: "guide",
    gender: "male",
    role: "guide",
    assetPath: "assets/characters/guide_korean_m_40s.jpg",
    ghibliStylePrompt:
      "40s refined Paris-resident Korean male driving guide in navy jacket, Studio Ghibli anime style, warm welcoming smile",
  },
  guide_korean_f_40s: {
    id: "guide_korean_f_40s",
    name: "지은 (40대 파리 현지 거주 한국인 VIP 가이드)",
    ageGroup: "guide",
    gender: "female",
    role: "guide",
    assetPath: "assets/characters/guide_korean_f_40s.jpg",
    ghibliStylePrompt:
      "40s elegant Paris-resident Korean female guide with silk scarf, Studio Ghibli anime style, professional friendly demeanor",
  },
};

export function getVehicleConfigByCompanionCount(
  companionCount: number = 2,
): VehicleConfig {
  if (companionCount <= 4) {
    return {
      type: "sedan",
      name: "고급 승용차 (Luxury Sedan)",
      description: "1~4인 프라이빗 전용 벤츠 S/E 클래스 고급 승용차",
      ghibliVehiclePrompt:
        "luxury dark Mercedes sedan driving through Paris streets, Studio Ghibli anime style",
    };
  }

  if (companionCount <= 8) {
    return {
      type: "van",
      name: "8인승 프리미엄 밴 (8-Seater Van)",
      description: "5~8인 대가족/친구들 전용 8인승 벤츠 V클래스 프리미엄 밴",
      ghibliVehiclePrompt:
        "premium 8-seater dark Mercedes V-class van in Paris, Studio Ghibli anime style",
    };
  }

  return {
    type: "sprinter_bus",
    name: "벤츠 스프린터급 18인승 버스 (Mercedes Sprinter 18-Seater Bus)",
    description: "9인 이상 대가족/단체 전용 벤츠 스프린터급 18인승 리무진 버스",
    ghibliVehiclePrompt:
      "luxurious dark Mercedes Sprinter 18-seater minibus cruising along Seine River, Studio Ghibli anime style",
  };
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

/** ⚠️ 수정금지(승인필요) 2026-07-22 사장님 SSOT = 출연진 동적 구성기 */
export function selectGhibliCast(opts: {
  companionType?: string | null;
  companionCount?: number | null;
  userAge?: number | null;
  userGender?: string | null;
  companionAges?: string | null; // "5,8" = 여정 플래너 입력(아이 나이)
}): GhibliCast {
  const count = Math.max(1, opts.companionCount || 2);
  const gender: "male" | "female" =
    opts.userGender === "female" ? "female" : "male";
  const spouseGender: "male" | "female" = gender === "male" ? "female" : "male";
  const age = opts.userAge || 40; // 생년월일 = 로그인 필수 입력값. 미연결 계정(인증 정식화 전) = 40대 폴백
  const est = estimateFamilyAges(age);
  const childAge = Math.max(5, est.estimatedChildAge); // 영상용 최소 5살
  const parentAge = est.estimatedParentAge;
  const inputAges = (opts.companionAges || "")
    .split(",")
    .map((a) => parseInt(a.trim()))
    .filter((a) => !isNaN(a));

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
        const restAge = inputAges[i] ?? childAge;
        travelers.push(
          characterByAge(restAge, i % 2 === 0 ? "female" : "male"),
        );
      }
      break;
    }
    case "ExtendedFamily": {
      travelers.push(characterByAge(age, spouseGender));
      travelers.push(characterByAge(parentAge, "male"));
      travelers.push(characterByAge(parentAge, "female"));
      for (let i = 0; i < count - 4; i++) {
        const kidAge = inputAges[i] ?? childAge;
        travelers.push(characterByAge(kidAge, i % 2 === 0 ? "female" : "male"));
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
    travelers: travelers.slice(0, 4), // 이미지 첨부 상한(+가이드+차량 = 6장). 초과 인원 = 스토리보드 텍스트로 전달
    totalTravelerCount: count,
    koreanGuide: GHIBLI_CHARACTER_ROSTER_18.guide_korean_m_40s,
    vehicle: getVehicleConfigByCompanionCount(count),
  };
}
