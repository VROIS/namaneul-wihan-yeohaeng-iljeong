# BTS 미니앱 디자인 시스템
> NUBI Travel × BTS Concert City Trip Planner
> Version 1.0 — 밝은 테마, 실사 기반 만화 캐릭터

---

## 1. Design Tokens

### 1.1 Colors — Light Theme

#### Brand Colors
| Token | Hex | Usage |
|-------|-----|-------|
| `brand-primary` | `#7C3AED` | 주요 CTA, 강조, 선택 상태 |
| `brand-secondary` | `#A78BFA` | 보조 강조, 호버 |
| `brand-tertiary` | `#EDE9FE` | 배경 강조, 카드 하이라이트 |
| `brand-gradient` | `#7C3AED → #4F46E5` | 버튼, 프로그레스 |

#### Background
| Token | Hex | Usage |
|-------|-----|-------|
| `bg-base` | `#FAFAFA` | 앱 전체 배경 |
| `bg-surface` | `#FFFFFF` | 카드, 패널 표면 |
| `bg-elevated` | `#F5F3FF` | 선택된 카드, 활성 영역 |
| `bg-overlay` | `rgba(0,0,0,0.04)` | 오버레이, 비활성 |

#### Text
| Token | Hex | Usage |
|-------|-----|-------|
| `text-primary` | `#1A1A2E` | 제목, 중요 텍스트 |
| `text-secondary` | `#4A4A6A` | 본문, 설명 |
| `text-tertiary` | `#9CA3AF` | 보조 정보, 힌트 |
| `text-on-brand` | `#FFFFFF` | 브랜드 컬러 위 텍스트 |

#### Semantic
| Token | Hex | Usage |
|-------|-----|-------|
| `success` | `#10B981` | 완료, 성공 |
| `warning` | `#F59E0B` | 경고, 주의 |
| `error` | `#EF4444` | 에러 |
| `info` | `#3B82F6` | 정보 |

### 1.2 캐릭터 컬러 팔레트

각 캐릭터는 고유한 2색 그라데이션 + 악센트 컬러를 가짐.

| 캐릭터 | Primary | Secondary | Accent | 분위기 |
|--------|---------|-----------|--------|--------|
| 컬렉터 | `#3B82F6` | `#06B6D4` | `#DBEAFE` | 지적, 차분한 블루 |
| 로맨티스트 | `#EC4899` | `#F472B6` | `#FCE7F3` | 로맨틱, 핑크 |
| 익스플로러 | `#F97316` | `#FB923C` | `#FFF7ED` | 에너지, 오렌지 |
| 챌린저 | `#EF4444` | `#F87171` | `#FEF2F2` | 열정, 레드 |
| 컴패니언 | `#FBBF24` | `#FCD34D` | `#FFFBEB` | 따뜻한, 골드 |
| 리차저 | `#A78BFA` | `#C4B5FD` | `#F5F3FF` | 럭셔리, 바이올렛 |
| 칠러 | `#34D399` | `#6EE7B7` | `#ECFDF5` | 힐링, 민트 |

### 1.3 Typography

#### Font Stack
- **한국어 제목**: Pretendard Bold / ExtraBold
- **한국어 본문**: Pretendard Regular / Medium
- **영문 제목**: Inter Bold / Outfit Bold
- **영문 본문**: Inter Regular
- **숫자/데이터**: Outfit Medium (탭형 숫자)

#### Scale
| Token | Size | Weight | Usage |
|-------|------|--------|-------|
| `heading-xl` | 28px | 800 | Scene 제목 |
| `heading-lg` | 22px | 700 | 섹션 제목 |
| `heading-md` | 18px | 700 | 카드 제목 |
| `body-lg` | 16px | 500 | 본문 강조 |
| `body-md` | 14px | 400 | 기본 본문 |
| `body-sm` | 12px | 400 | 보조 텍스트 |
| `caption` | 10px | 500 | 태그, 배지 |

### 1.4 Spacing

8px 기반 시스템:
| Token | Value |
|-------|-------|
| `space-xs` | 4px |
| `space-sm` | 8px |
| `space-md` | 16px |
| `space-lg` | 24px |
| `space-xl` | 32px |
| `space-2xl` | 48px |

### 1.5 Border Radius
| Token | Value | Usage |
|-------|-------|-------|
| `radius-sm` | 8px | 태그, 칩 |
| `radius-md` | 12px | 인풋, 작은 카드 |
| `radius-lg` | 16px | 일반 카드 |
| `radius-xl` | 24px | 메인 카드, 모달 |
| `radius-full` | 9999px | 아바타, 버튼 |

### 1.6 Shadows (밝은 테마용)
| Token | Value | Usage |
|-------|-------|-------|
| `shadow-sm` | `0 1px 2px rgba(0,0,0,0.05)` | 미묘한 입체감 |
| `shadow-md` | `0 4px 12px rgba(0,0,0,0.08)` | 카드 기본 |
| `shadow-lg` | `0 8px 24px rgba(0,0,0,0.12)` | 플로팅 카드 |
| `shadow-glow` | `0 4px 20px rgba(124,58,237,0.2)` | 선택된 요소 |
| `shadow-card-hover` | `0 12px 32px rgba(0,0,0,0.15)` | 호버 카드 |

### 1.7 Motion
| Token | Value | Usage |
|-------|-------|-------|
| `duration-fast` | 150ms | 마이크로 인터랙션 |
| `duration-normal` | 300ms | 상태 변화 |
| `duration-slow` | 500ms | Scene 전환 |
| `easing-default` | `cubic-bezier(0.4, 0, 0.2, 1)` | 일반 |
| `easing-spring` | `cubic-bezier(0.175, 0.885, 0.32, 1.275)` | 바운스 |
| `easing-decel` | `cubic-bezier(0, 0, 0.2, 1)` | 진입 |

---

## 2. 7명 캐릭터 디자인 가이드

### 2.1 캐릭터 아트 스타일

**기본 방향**: 일본 만화 주인공 스타일, 실사 기반
- 비율: 실사 비율 (머리:몸 = 1:6~7)
- 눈: 크되 실사 비율 유지, 캐릭터 감정 표현
- 머리카락: 만화적 볼륨감 + 자연스러운 흐름
- 의상: 각 아키타입에 맞는 현대적 패션
- 포즈: 자연스러운 여행 중 모습
- 배경: 없음 (투명 또는 캐릭터 컬러 후광)

**레퍼런스 분위기**: 솔로 레벨링 캐릭터 디자인, 주술회전의 세련된 라인워크, 나의 히어로 아카데미아의 개성 표현

### 2.2 각 캐릭터 상세

#### 컬렉터 (Culture Collector)
- **컬러**: 블루 계열 (`#3B82F6` → `#06B6D4`)
- **성격**: 지적, 차분, 호기심
- **외형**: 안경, 깔끔한 셔츠+재킷, 베레모 또는 뉴스보이캡
- **소품**: 작은 노트북, 박물관 팜플렛
- **표정**: 미소 띤 관찰하는 눈빛
- **포즈**: 한 손으로 턱을 괴고 뭔가를 바라보는 자세
- **배경 이펙트**: 떠다니는 작은 별자리/책 페이지 조각
- **태그**: #Museums #Art #History
- **pace**: Normal

#### 로맨티스트 (Romantic Wanderer)
- **컬러**: 핑크 계열 (`#EC4899` → `#F472B6`)
- **성격**: 감성적, 낭만, 부드러운
- **외형**: 웨이브 헤어, 오버핏 니트 또는 트렌치코트
- **소품**: 폴라로이드 카메라, 꽃
- **표정**: 부드러운 미소, 살짝 꿈꾸는 눈
- **포즈**: 한 손에 카메라를 들고 석양을 바라보는 자세
- **배경 이펙트**: 떠다니는 벚꽃잎, 하트 파티클
- **태그**: #Romance #Sunset #Café
- **pace**: Relaxed

#### 익스플로러 (Aesthetic Explorer)
- **컬러**: 오렌지 계열 (`#F97316` → `#FB923C`)
- **성격**: 트렌디, 활발, 사교적
- **외형**: 스트릿 패션, 버킷햇, 선글라스를 이마에
- **소품**: 스마트폰 (셀카 찍는 중)
- **표정**: 밝은 웃음, 눈이 반짝이는
- **포즈**: 한 손으로 피스 사인, 약간 기운 자세
- **배경 이펙트**: 카메라 플래시 이펙트, 별 스파클
- **태그**: #Hotspot #Trendy #Insta
- **pace**: Packed

#### 챌린저 (Adrenaline Foodie)
- **컬러**: 레드 계열 (`#EF4444` → `#F87171`)
- **성격**: 열정적, 대담, 에너지 넘치는
- **외형**: 무스탕/가죽 재킷, 밴드 티셔츠, 부츠
- **소품**: 백팩, 지도를 한 손에
- **표정**: 자신감 넘치는 웃음, 도전적인 눈빛
- **포즈**: 주먹을 불끈 쥔 파이팅 자세
- **배경 이펙트**: 불꽃 파티클, 번개 효과
- **태그**: #Adventure #Food #Extreme
- **pace**: Packed

#### 컴패니언 (Caring Companion)
- **컬러**: 골드 계열 (`#FBBF24` → `#FCD34D`)
- **성격**: 따뜻한, 배려심, 친근한
- **외형**: 캐주얼 가디건, 부드러운 색상 옷, 머플러
- **소품**: 작은 선물 상자, 핫초코 컵
- **표정**: 따뜻한 미소, 편안한 눈빛
- **포즈**: 양 손으로 뭔가를 내미는 자세
- **배경 이펙트**: 떠다니는 하트, 따뜻한 빛 파티클
- **태그**: #Together #Healing #Culture
- **pace**: Normal

#### 리차저 (Luxury Recharger)
- **컬러**: 바이올렛 계열 (`#A78BFA` → `#C4B5FD`)
- **성격**: 우아한, 럭셔리, 세련된
- **외형**: 고급 코트, 액세서리 (시계, 반지), 세련된 헤어
- **소품**: 샴페인 글라스, 고급 여행 캐리어
- **표정**: 여유로운 미소, 우아한 눈빛
- **포즈**: 턱을 살짝 올리고 자신감 있게 서 있는 자세
- **배경 이펙트**: 다이아몬드 스파클, 은은한 빛
- **태그**: #Luxury #Spa #Gourmet
- **pace**: Relaxed

#### 칠러 (Ultimate Healer)
- **컬러**: 민트 계열 (`#34D399` → `#6EE7B7`)
- **성격**: 평화로운, 미니멀, 자연주의
- **외형**: 린넨 셔츠, 넓은 바지, 샌들
- **소품**: 이어폰 (음악 듣는 중), 작은 식물 화분
- **표정**: 평온한 미소, 눈을 살짝 감은
- **포즈**: 양 팔을 약간 벌리고 바람을 맞는 자세
- **배경 이펙트**: 나뭇잎 파티클, 물결 이펙트
- **태그**: #Chill #Nature #Minimal
- **pace**: Ultra-Relaxed

---

## 3. 컴포넌트 라이브러리

### 3.1 캐릭터 카드 (Character Card)

```
┌─────────────────────┐
│    [Avatar Image]    │  ← 실사 만화 캐릭터 상반신
│    120×120 원형       │
│                      │
│      캐릭터명          │  ← heading-md, text-primary
│   English Archetype  │  ← body-sm, text-secondary
│                      │
│  "설명 텍스트..."     │  ← body-sm, text-tertiary
│                      │
│  [#tag1] [#tag2]     │  ← 캐릭터 컬러 배경 칩
│                      │
│    〔 Normal 〕       │  ← pace 배지
└─────────────────────┘
```

**Variants**:
- `default`: `bg-surface`, `shadow-md`, `border: 1px solid #E5E7EB`
- `selected`: `bg-elevated`, `shadow-glow`, `border: 2px solid brand-primary`
- `hover`: `shadow-card-hover`, scale(1.02)

**Size**: 240w × 380h (px)

### 3.2 서라운드 카드 (Surround Place Card)

```
┌──────────┐
│ [emoji]  │  ← 카테고리 이모지 (22px)
│ 장소명    │  ← body-sm, bold
│  ₩가격   │  ← caption, brand-primary
│    [✓]   │  ← 선택 배지 (우상단)
└──────────┘
```

**Size**: 86w × 116h (px)
**Layout**: 8개가 중앙 아바타를 둘러싸고 원형 배치 (radius: 130px)

**Variants**:
- `default`: `bg-surface`, `shadow-sm`
- `selected`: `bg-elevated`, `shadow-glow`, 캐릭터 컬러 보더
- `entering`: scale(0) → scale(1), stagger delay

### 3.3 도시 칩 (City Chip)

```
┌──────────┐
│  서울 🇰🇷  │
└──────────┘
```

**Variants**:
- `default`: `bg-surface`, `text-secondary`, `border: 1px solid #E5E7EB`
- `active`: `bg-elevated`, `text: brand-primary`, `border: brand-primary`

### 3.4 CTA 버튼 (Primary Action)

```
┌────────────────────────────────┐
│     컬렉터 바이브로 시작하기 ✨    │
└────────────────────────────────┘
```

**Style**: `brand-gradient` 배경, `text-on-brand`, `radius-full`, `shadow-glow`
**States**:
- `enabled`: 풀 opacity
- `disabled`: 40% opacity
- `pressed`: scale(0.97)
- `loading`: 스피너 표시

### 3.5 게이지 바 (Progress Gauge)

```
[████████░░░░░░░] 3 / 8
```

**Track**: `#E5E7EB`, height 6px, `radius-full`
**Fill**: `brand-gradient`, animated width transition
**Text**: `body-sm`, `text-secondary`

### 3.6 릴스 카드 (Reel Card)

```
┌──────────────────────┐
│  [category badge]    │  ← 좌상단 카테고리 칩
│                      │
│                      │  ← 그라데이션 배경
│                      │
│  09:30               │  ← 시간, brand-primary
│  경복궁               │  ← heading-md, text-primary
│  추천 설명 텍스트...   │  ← body-sm, text-secondary
└──────────────────────┘
```

**Size**: 260w × 320h (px)
**Layout**: 수평 스크롤, snap center

### 3.7 타임라인 카드 (Timeline Card)

```
● ── ┌────────────────────────┐
│    │ 🏛️  경복궁              │
│    │     09:30 - 11:00       │  ₩3,000
│    │ 💡 추천 이유 텍스트       │
│    └────────────────────────┘
● ──  ...
```

**Dot**: 12px, 카테고리 컬러
**Connector**: 2px, `#E5E7EB`
**Card**: `bg-surface`, `shadow-sm`, `radius-lg`

### 3.8 요약 카드 (Summary Card)

```
┌─────────────────────────────┐
│  📊 여행 요약                │
│                             │
│   5곳     7.5h     ₩36,000  │
│  장소    예상시간   예상비용   │
└─────────────────────────────┘
```

**Style**: `bg-elevated`, `border: 1px solid brand-tertiary`, `radius-xl`

---

## 4. 화면 플로우 (4 Scenes)

### Scene 1: 캐릭터 선택
- 배경: `bg-base` + 상단 그라데이션 (캐릭터 컬러 10% opacity)
- 헤더: 글래스모피즘 바 (밝은 버전: `bg-surface` + `shadow-md`)
- 캐러셀: 수평 스크롤, snap center, 좌우 여백 50%
- 인디케이터: 7개 도트
- CTA: 하단 고정

### Scene 2: 장소 카트
- 배경: `bg-base`
- 도시 칩: 수평 스크롤
- 서라운드 레이아웃: 중앙 아바타 + 8개 카드 원형
- 게이지 바: 하단
- CTA: "AI 동선 최적화" (2개 이상 선택 시 활성)

### Scene 3: 로딩
- 배경: `bg-base` + 캐릭터 컬러 그라데이션
- 스피너: `brand-primary` 링
- 메시지: 5단계 순환
- 최소 3초 표시

### Scene 4: 대시보드
- 배경: `bg-base`
- 릴스 섹션: 수평 스크롤 카드
- 타임라인: 수직 리스트
- 요약 카드: 하단
- 액션 바: "처음부터 다시" + "일정 공유하기"

---

## 5. 아이콘 & 이모지 시스템

### 카테고리 아이콘
| 카테고리 | 이모지 | 컬러 |
|---------|--------|------|
| attraction | 🏛️ | `#3B82F6` |
| healing | 🧘 | `#10B981` |
| restaurant | 🍽️ | `#F59E0B` |
| hotspot | 📸 | `#EC4899` |
| adventure | 🏔️ | `#EF4444` |
| shopping | 🛍️ | `#8B5CF6` |
| romantic | 🌹 | `#F472B6` |

---

## 6. 반응형 & 접근성

### Safe Area
- Top: 54px (notch)
- Bottom: 34px (home indicator)
- Horizontal: 20px

### 접근성
- 최소 터치 타겟: 44×44px
- 색상 대비: WCAG AA (4.5:1 텍스트, 3:1 큰 텍스트)
- 선택 상태: 컬러 + 보더 + 스케일 (색각 이상 대응)
- 애니메이션: `prefers-reduced-motion` 지원

---

## 7. 파일 구조 (예상)

```
client/
├── constants/
│   ├── bts-theme.ts          ← 디자인 토큰
│   └── bts-characters.ts     ← 7명 캐릭터 데이터
├── assets/bts/
│   ├── characters/           ← 7명 캐릭터 이미지
│   │   ├── collector.png
│   │   ├── romanticist.png
│   │   ├── explorer.png
│   │   ├── challenger.png
│   │   ├── companion.png
│   │   ├── recharger.png
│   │   └── chiller.png
│   └── bgm/                  ← 7곡 BGM
├── contexts/BTSContext.tsx
├── navigation/BTSStackNavigator.tsx
└── screens/bts/
    ├── BTSCharacterSelectScreen.tsx
    ├── BTSPlaceCartScreen.tsx
    ├── BTSLoadingScreen.tsx
    └── BTSDashboardScreen.tsx
```
