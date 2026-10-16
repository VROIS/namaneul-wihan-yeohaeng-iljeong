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
}

// ⚠️ 수정금지(승인필요) 2026-09-25 사장님 결정 = 캐릭터 설명 = 배경 뺀 실제 그림과 일치 · 파리 문구 삭제 (정본 §)
export const GHIBLI_CHARACTER_ROSTER_18: Record<string, GhibliCharacter> = {
  m_20s: {
    id: "m_20s",
    name: "민준",
    ageGroup: "20s",
    gender: "male",
    role: "traveler",
    assetPath: "assets/characters/m_20s.jpg",
    ghibliStylePrompt: "Korean man in his 20s, short black hair, navy hoodie",
  },
  f_20s: {
    id: "f_20s",
    name: "서연",
    ageGroup: "20s",
    gender: "female",
    role: "traveler",
    assetPath: "assets/characters/f_20s.jpg",
    ghibliStylePrompt:
      "Korean woman in her 20s, long wavy dark hair, navy beret with a daisy pin, pink-and-cream striped cardigan, cream crossbody bag",
  },

  m_30s: {
    id: "m_30s",
    name: "도현",
    ageGroup: "30s",
    gender: "male",
    role: "traveler",
    assetPath: "assets/characters/m_30s.jpg",
    ghibliStylePrompt:
      "Korean man in his 30s, short black hair, olive green jacket over a navy shirt, backpack, lanyard badge",
  },
  f_30s: {
    id: "f_30s",
    name: "지민",
    ageGroup: "30s",
    gender: "female",
    role: "traveler",
    assetPath: "assets/characters/f_30s.jpg",
    ghibliStylePrompt:
      "Korean woman in her 30s, short brown bob, olive green coat, cream scarf, rust sweater, camera around her neck",
  },

  m_40s: {
    id: "m_40s",
    name: "정우",
    ageGroup: "40s",
    gender: "male",
    role: "traveler",
    assetPath: "assets/characters/m_40s.jpg",
    ghibliStylePrompt:
      "Korean man in his 40s, short dark hair, navy polo shirt",
  },
  f_40s: {
    id: "f_40s",
    name: "유진",
    ageGroup: "40s",
    gender: "female",
    role: "traveler",
    assetPath: "assets/characters/f_40s.jpg",
    ghibliStylePrompt:
      "Korean woman in her 40s, dark hair in a low bun, sage green cardigan, floral silk scarf",
  },

  m_50s: {
    id: "m_50s",
    name: "성호",
    ageGroup: "50s",
    gender: "male",
    role: "traveler",
    assetPath: "assets/characters/m_50s.jpg",
    ghibliStylePrompt:
      "Korean man in his 50s, short grey-black hair, round glasses, dark green knit cardigan over a plaid scarf",
  },
  f_50s: {
    id: "f_50s",
    name: "혜경",
    ageGroup: "50s",
    gender: "female",
    role: "traveler",
    assetPath: "assets/characters/f_50s.jpg",
    ghibliStylePrompt:
      "Korean woman in her 50s, straw sun hat, floral blue scarf, cream sweater",
  },

  m_60s: {
    id: "m_60s",
    name: "종인",
    ageGroup: "60s",
    gender: "male",
    role: "traveler",
    assetPath: "assets/characters/m_60s.jpg",
    ghibliStylePrompt:
      "Korean man in his 60s, white hair, round glasses, dark knit vest over a cream cardigan",
  },
  f_60s: {
    id: "f_60s",
    name: "순자",
    ageGroup: "60s",
    gender: "female",
    role: "traveler",
    assetPath: "assets/characters/f_60s.jpg",
    ghibliStylePrompt:
      "Korean woman in her 60s, white hair in a bun, dark patterned shawl over a rust-orange top",
  },

  m_kids: {
    id: "m_kids",
    name: "하준",
    ageGroup: "kids",
    gender: "male",
    role: "traveler",
    assetPath: "assets/characters/m_10s_kid.jpg",
    ghibliStylePrompt:
      "Korean boy about 8, yellow cap, grey hooded jacket over a navy striped shirt, navy backpack with yellow straps",
  },
  f_kids: {
    id: "f_kids",
    name: "아린",
    ageGroup: "kids",
    gender: "female",
    role: "traveler",
    assetPath: "assets/characters/f_10s_kid.jpg",
    ghibliStylePrompt:
      "Korean girl about 7, long dark pigtails with pink ribbons, cream knit cardigan over a striped shirt",
  },

  m_teen: {
    id: "m_teen",
    name: "시우",
    ageGroup: "teen",
    gender: "male",
    role: "traveler",
    assetPath: "assets/characters/m_10s_teen.jpg",
    ghibliStylePrompt:
      "Korean teenage boy, messy black hair, navy hoodie, headphones around his neck",
  },
  f_teen: {
    id: "f_teen",
    name: "수아",
    ageGroup: "teen",
    gender: "female",
    role: "traveler",
    assetPath: "assets/characters/f_10s_teen.jpg",
    ghibliStylePrompt:
      "Korean teenage girl, short wavy brown hair with a star clip, pastel striped sweater, navy backpack",
  },

  m_20s_sub: {
    id: "m_20s_sub",
    name: "태양",
    ageGroup: "20s",
    gender: "male",
    role: "traveler",
    assetPath: "assets/characters/m_couple_20s.jpg",
    ghibliStylePrompt: "Korean man in his 20s, wavy brown hair, white shirt",
  },
  f_20s_sub: {
    id: "f_20s_sub",
    name: "채원",
    ageGroup: "20s",
    gender: "female",
    role: "traveler",
    assetPath: "assets/characters/f_couple_20s.jpg",
    ghibliStylePrompt:
      "Korean woman in her 20s, long wavy brown hair with a small flower clip, cream floral blouse",
  },

  guide_korean_m_40s: {
    id: "guide_korean_m_40s",
    name: "민우 (40대 현지 거주 한국인 드라이빙 가이드)",
    ageGroup: "guide",
    gender: "male",
    role: "guide",
    assetPath: "assets/characters/guide_korean_m_40s.jpg",
    ghibliStylePrompt:
      "Korean driving guide in his 40s, short black hair, round glasses, navy blazer over a light blue shirt (his reference shows him seated at the wheel; in scenes he stands on foot with his hands free)",
  },
  guide_korean_f_40s: {
    id: "guide_korean_f_40s",
    name: "지은 (40대 현지 거주 한국인 VIP 가이드)",
    ageGroup: "guide",
    gender: "female",
    role: "guide",
    assetPath: "assets/characters/guide_korean_f_40s.jpg",
    ghibliStylePrompt:
      "Korean guide in her 40s, shoulder-length wavy dark hair, beige trench coat, patterned silk scarf",
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
    travelers: travelers.slice(0, 4),
    totalTravelerCount: count,
    koreanGuide: GHIBLI_CHARACTER_ROSTER_18.guide_korean_m_40s,
    vehicle: getVehicleConfigByCompanionCount(count),
  };
}
