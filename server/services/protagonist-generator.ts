/**
 * 주인공 문장 생성기 (Protagonist Generator)
 * 
 * 🎯 목적: Gemini 프롬프트 가중치 1순위로 사용될 "주인공 문장" 생성
 * 
 * 조합 요소:
 * 1. curationFocus (Kids, Parents, Everyone, Self) - 누구를 위한 여행?
 * 2. companionType (Single, Couple, Family, ExtendedFamily, Group) - 누구랑?
 * 3. companionAges - 동반자 나이 (특히 아이, 부모님)
 * 4. vibes - 여행 취향 (Romantic, Foodie, Adventure 등)
 * 5. destination - 목적지
 * 
 * 출력 예시:
 * - "5살 아이를 동반한 한국인 가족의 힐링+미식 파리 여행 (아이 중심)"
 * - "60대 부모님을 모시고 가는 로맨틱 파리 여행 (부모님 체력 고려)"
 * - "한국인 커플의 로맨틱+핫스팟 파리 여행"
 * - "혼자 떠나는 모험+문화 파리 여행"
 */

type CurationFocus = 'Kids' | 'Parents' | 'Everyone' | 'Self';
type CompanionType = 'Single' | 'Couple' | 'Family' | 'ExtendedFamily' | 'Group';
type Vibe = 'Healing' | 'Adventure' | 'Hotspot' | 'Foodie' | 'Romantic' | 'Culture';

interface ProtagonistInput {
  curationFocus: CurationFocus;
  companionType: CompanionType;
  companionCount: number;
  companionAges?: string;  // "5,8" 형태 (아이 나이) 또는 "65,68" (부모님 나이)
  vibes: Vibe[];
  destination: string;
}

interface ProtagonistOutput {
  sentence: string;           // 완성된 주인공 문장
  promptContext: string;      // Gemini 프롬프트용 상세 컨텍스트
  priorityNotes: string[];    // 일정 생성시 우선 고려사항
}

// 한국어 라벨 매핑
const COMPANION_LABELS: Record<CompanionType, string> = {
  Single: '혼자',
  Couple: '커플',
  Family: '가족',
  ExtendedFamily: '대가족',
  Group: '친구들',
};

const VIBE_LABELS: Record<Vibe, string> = {
  Healing: '힐링',
  Adventure: '모험',
  Hotspot: '핫스팟',
  Foodie: '미식',
  Romantic: '로맨틱',
  Culture: '문화/예술',
};

const FOCUS_LABELS: Record<CurationFocus, string> = {
  Kids: '아이 중심',
  Parents: '부모님 중심',
  Everyone: '모두 함께',
  Self: '나 중심',
};

/**
 * 나이 분석 - 아이/부모님 나이 파싱
 */
function parseAges(agesString?: string): { ages: number[]; hasKids: boolean; hasElders: boolean; youngest: number | null; oldest: number | null } {
  if (!agesString) {
    return { ages: [], hasKids: false, hasElders: false, youngest: null, oldest: null };
  }
  
  const ages = agesString.split(',').map(a => parseInt(a.trim())).filter(a => !isNaN(a));
  const youngest = ages.length > 0 ? Math.min(...ages) : null;
  const oldest = ages.length > 0 ? Math.max(...ages) : null;
  
  return {
    ages,
    hasKids: ages.some(age => age < 13),
    hasElders: ages.some(age => age >= 60),
    youngest,
    oldest,
  };
}

/**
 * 주인공 문장 생성
 */
export function generateProtagonistSentence(input: ProtagonistInput): ProtagonistOutput {
  const { curationFocus, companionType, companionCount, companionAges, vibes, destination } = input;
  
  const ageInfo = parseAges(companionAges);
  const vibeLabels = vibes.map(v => VIBE_LABELS[v]).join('+');
  const companionLabel = COMPANION_LABELS[companionType];
  const focusLabel = FOCUS_LABELS[curationFocus];
  
  let sentence = '';
  let promptContext = '';
  const priorityNotes: string[] = [];
  
  // 🎯 주인공 문장 생성 로직
  switch (curationFocus) {
    case 'Kids':
      // 아이 중심 여행
      if (ageInfo.youngest !== null) {
        sentence = `${ageInfo.youngest}살 아이를 동반한 한국인 ${companionLabel}의 ${vibeLabels} ${destination} 여행 (${focusLabel})`;
        promptContext = `이 여행의 주인공은 ${ageInfo.youngest}살 아이입니다. `;
        promptContext += `아이의 체력과 흥미를 최우선으로 고려하세요. `;
        promptContext += `아이 친화적인 장소, 짧은 이동 거리, 적절한 휴식 시간을 배치해주세요.`;
        
        priorityNotes.push(`아이(${ageInfo.youngest}살) 체력 고려 - 하루 최대 4-5곳`);
        priorityNotes.push('이동 거리 최소화 - 도보 15분 이내');
        priorityNotes.push('아이 친화적 장소 우선 (놀이터, 공원, 체험형)');
        if (ageInfo.youngest < 5) {
          priorityNotes.push('유모차 접근 가능 장소 우선');
          priorityNotes.push('기저귀 교환대 있는 시설 선호');
        }
      } else {
        sentence = `아이를 동반한 한국인 ${companionLabel}의 ${vibeLabels} ${destination} 여행 (${focusLabel})`;
        promptContext = `이 여행의 주인공은 아이입니다. 아이 친화적인 일정을 구성하세요.`;
        priorityNotes.push('아이 친화적 장소 우선');
      }
      break;
      
    case 'Parents':
      // 부모님 중심 여행
      if (ageInfo.oldest !== null && ageInfo.oldest >= 60) {
        sentence = `${ageInfo.oldest}대 부모님을 모시고 가는 ${vibeLabels} ${destination} 여행 (${focusLabel})`;
        promptContext = `이 여행의 주인공은 ${ageInfo.oldest}대 부모님입니다. `;
        promptContext += `부모님의 체력과 건강을 최우선으로 고려하세요. `;
        promptContext += `계단이 적은 장소, 휴식 공간, 편안한 동선을 배치해주세요.`;
        
        priorityNotes.push(`부모님(${ageInfo.oldest}대) 체력 고려 - 하루 최대 3-4곳`);
        priorityNotes.push('계단/경사 최소화 - 엘리베이터 있는 곳 우선');
        priorityNotes.push('중간중간 카페 휴식 필수');
        if (ageInfo.oldest >= 70) {
          priorityNotes.push('도보 10분 이내 장소 배치');
          priorityNotes.push('의자 있는 장소 우선');
        }
      } else {
        sentence = `부모님을 모시고 가는 ${vibeLabels} ${destination} 여행 (${focusLabel})`;
        promptContext = `이 여행의 주인공은 부모님입니다. 편안한 일정을 구성하세요.`;
        priorityNotes.push('부모님 체력 고려 - 여유로운 일정');
      }
      break;
      
    case 'Self':
      // 나 중심 여행
      if (companionType === 'Single') {
        sentence = `혼자 떠나는 ${vibeLabels} ${destination} 여행`;
        promptContext = `혼자 여행하는 한국인 여행자입니다. `;
        promptContext += `자유롭고 유연한 일정을 구성하되, 혼자 가기 좋은 장소를 추천해주세요.`;
        
        priorityNotes.push('혼자 방문하기 좋은 장소 우선');
        priorityNotes.push('1인 식사 가능한 레스토랑');
        priorityNotes.push('안전한 동선 고려');
      } else {
        sentence = `한국인 ${companionLabel}의 ${vibeLabels} ${destination} 여행 (${focusLabel})`;
        promptContext = `여행자 본인의 취향을 최우선으로 한 여행입니다.`;
        priorityNotes.push('본인 취향 최우선');
      }
      break;
      
    case 'Everyone':
    default:
      // 모두 함께
      if (companionType === 'Family' || companionType === 'ExtendedFamily') {
        if (ageInfo.hasKids && ageInfo.hasElders) {
          sentence = `${ageInfo.youngest}살부터 ${ageInfo.oldest}대까지 함께하는 ${vibeLabels} ${destination} 가족 여행`;
          promptContext = `아이(${ageInfo.youngest}살)부터 어르신(${ageInfo.oldest}대)까지 함께하는 가족 여행입니다. `;
          promptContext += `모든 세대가 즐길 수 있는 장소를 선택하세요.`;
          
          priorityNotes.push('전 세대 만족 장소 우선');
          priorityNotes.push('아이 체력과 어르신 체력 동시 고려');
          priorityNotes.push('가족 단위 식사 가능한 레스토랑');
        } else if (ageInfo.hasKids) {
          sentence = `한국인 ${companionLabel}의 ${vibeLabels} ${destination} 여행 (${ageInfo.youngest}살 동반)`;
          promptContext = `${ageInfo.youngest}살 아이와 함께하는 가족 여행입니다.`;
          priorityNotes.push('아이 동반 가능 장소 우선');
        } else {
          sentence = `한국인 ${companionLabel}의 ${vibeLabels} ${destination} 여행`;
          promptContext = `가족이 함께하는 여행입니다. 모두가 즐길 수 있는 일정을 구성하세요.`;
          priorityNotes.push('가족 단위 활동 우선');
        }
      } else if (companionType === 'Couple') {
        sentence = `한국인 커플의 ${vibeLabels} ${destination} 여행`;
        promptContext = `커플 여행입니다. 로맨틱하고 분위기 있는 장소를 추천해주세요.`;
        priorityNotes.push('커플 분위기 좋은 장소 우선');
        priorityNotes.push('야경 명소 포함');
      } else if (companionType === 'Group') {
        sentence = `한국인 친구들(${companionCount}명)의 ${vibeLabels} ${destination} 여행`;
        promptContext = `${companionCount}명의 친구들이 함께하는 여행입니다. 그룹 활동에 적합한 장소를 추천해주세요.`;
        priorityNotes.push(`${companionCount}명 그룹 수용 가능 장소 우선`);
        priorityNotes.push('단체 활동/체험 추천');
      } else {
        sentence = `한국인 ${companionLabel}의 ${vibeLabels} ${destination} 여행`;
        promptContext = `한국인 여행자입니다. 취향에 맞는 일정을 구성하세요.`;
      }
      break;
  }
  
  // Vibe별 추가 노트
  if (vibes.includes('Foodie')) {
    priorityNotes.push('미식 장소 - 한국인 입맛 고려');
  }
  if (vibes.includes('Romantic')) {
    priorityNotes.push('로맨틱 분위기 장소 우선');
  }
  if (vibes.includes('Adventure')) {
    priorityNotes.push('체험/액티비티 포함');
  }
  if (vibes.includes('Culture')) {
    priorityNotes.push('문화/역사 장소 포함');
  }
  
  return {
    sentence,
    promptContext,
    priorityNotes,
  };
}

/**
 * Gemini 프롬프트용 전체 컨텍스트 생성
 * 가중치 1순위: 주인공 설정
 */
export function generatePromptContext(input: ProtagonistInput): string {
  const protagonist = generateProtagonistSentence(input);
  
  let prompt = `\n## 🎯 [가중치 1순위] 일정 생성의 주인공\n`;
  prompt += `**${protagonist.sentence}**\n\n`;
  prompt += `### 상세 컨텍스트\n${protagonist.promptContext}\n\n`;
  
  if (protagonist.priorityNotes.length > 0) {
    prompt += `### 우선 고려사항 (반드시 적용)\n`;
    protagonist.priorityNotes.forEach((note, idx) => {
      prompt += `${idx + 1}. ${note}\n`;
    });
  }
  
  return prompt;
}

export const protagonistGenerator = {
  generateProtagonistSentence,
  generatePromptContext,
};
