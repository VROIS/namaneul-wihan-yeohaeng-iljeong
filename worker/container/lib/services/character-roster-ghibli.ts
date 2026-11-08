import { estimateFamilyAges } from "./protagonist-generator";

export interface GhibliCharacter {
  id: string;
  name: string;
  ageGroup: string;
  gender: "male" | "female";
  role: "traveler" | "guide";
  assetPath: string; // 세트 폴더 안 파일 이름 (경로 = characterImage)
}

export interface VehicleConfig {
  type: "sedan" | "van" | "sprinter_bus";
}

// ⚠️ 수정금지(승인필요) 2026-11-03 최적값 = 캐릭터 설명 = 3D 그림 그대로의 겉모습(머리·옷·신발) · 지시문은 역할·나이만 쓴다(설명은 쓰지 않음) (정본 2026-11-03)
export const GHIBLI_CHARACTER_ROSTER_18: Record<string, GhibliCharacter> = {
  m_20s: {
    id: "m_20s",
    name: "민준",
    ageGroup: "20s",
    gender: "male",
    role: "traveler",
    assetPath: "m_20s.jpg",
  },
  f_20s: {
    id: "f_20s",
    name: "서연",
    ageGroup: "20s",
    gender: "female",
    role: "traveler",
    assetPath: "f_20s.jpg",
  },

  m_30s: {
    id: "m_30s",
    name: "도현",
    ageGroup: "30s",
    gender: "male",
    role: "traveler",
    assetPath: "m_30s.jpg",
  },
  f_30s: {
    id: "f_30s",
    name: "지민",
    ageGroup: "30s",
    gender: "female",
    role: "traveler",
    assetPath: "f_30s.jpg",
  },

  m_40s: {
    id: "m_40s",
    name: "정우",
    ageGroup: "40s",
    gender: "male",
    role: "traveler",
    assetPath: "m_40s.jpg",
  },
  f_40s: {
    id: "f_40s",
    name: "유진",
    ageGroup: "40s",
    gender: "female",
    role: "traveler",
    assetPath: "f_40s.jpg",
  },

  m_50s: {
    id: "m_50s",
    name: "성호",
    ageGroup: "50s",
    gender: "male",
    role: "traveler",
    assetPath: "m_50s.jpg",
  },
  f_50s: {
    id: "f_50s",
    name: "혜경",
    ageGroup: "50s",
    gender: "female",
    role: "traveler",
    assetPath: "f_50s.jpg",
  },

  m_60s: {
    id: "m_60s",
    name: "종인",
    ageGroup: "60s",
    gender: "male",
    role: "traveler",
    assetPath: "m_60s.jpg",
  },
  f_60s: {
    id: "f_60s",
    name: "순자",
    ageGroup: "60s",
    gender: "female",
    role: "traveler",
    assetPath: "f_60s.jpg",
  },

  m_kids: {
    id: "m_kids",
    name: "하준",
    ageGroup: "kids",
    gender: "male",
    role: "traveler",
    assetPath: "m_10s_kid.jpg",
  },
  f_kids: {
    id: "f_kids",
    name: "아린",
    ageGroup: "kids",
    gender: "female",
    role: "traveler",
    assetPath: "f_10s_kid.jpg",
  },

  m_teen: {
    id: "m_teen",
    name: "시우",
    ageGroup: "teen",
    gender: "male",
    role: "traveler",
    assetPath: "m_10s_teen.jpg",
  },
  f_teen: {
    id: "f_teen",
    name: "수아",
    ageGroup: "teen",
    gender: "female",
    role: "traveler",
    assetPath: "f_10s_teen.jpg",
  },

  m_20s_sub: {
    id: "m_20s_sub",
    name: "태양",
    ageGroup: "20s",
    gender: "male",
    role: "traveler",
    assetPath: "m_couple_20s.jpg",
  },
  f_20s_sub: {
    id: "f_20s_sub",
    name: "채원",
    ageGroup: "20s",
    gender: "female",
    role: "traveler",
    assetPath: "f_couple_20s.jpg",
  },

  guide_m_40s: {
    id: "guide_m_40s",
    name: "가이드 (40대 남)",
    ageGroup: "guide",
    gender: "male",
    role: "guide",
    assetPath: "guide_m_40s.jpg",
  },
  guide_f_40s: {
    id: "guide_f_40s",
    name: "가이드 (40대 여)",
    ageGroup: "guide",
    gender: "female",
    role: "guide",
    assetPath: "guide_f_40s.jpg",
  },
};

// ⚠️ 수정금지(승인필요) 2026-11-08 사장님 결정 = 기준 그림 2세트(jpg, 같은 파일 이름) · 영상 언어 ko·ja·zh = 동양인(asian) · en·fr·es·de = 서양인(western) (정본 2026-11-08)
export function characterImage(c: GhibliCharacter, lang: string): string {
  const set = ["ko", "ja", "zh"].includes(lang) ? "asian" : "western";
  return `assets/characters/${set}/${c.assetPath}`;
}

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
  guide: GhibliCharacter;
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
    guide: GHIBLI_CHARACTER_ROSTER_18.guide_m_40s,
    vehicle: getVehicleConfigByCompanionCount(count),
  };
}
