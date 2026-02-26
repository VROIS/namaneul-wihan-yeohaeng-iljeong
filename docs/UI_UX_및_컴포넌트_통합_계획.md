# UI/UX 및 컴포넌트 통합 계획

## 1. NUBI 앱 화면 흐름 및 UI 컴포넌트 아키텍처 플랜

앱 전반에 걸친 통일감을 제공하기 위해 사용자 요구사항을 바탕으로 화면 명칭과 역할, 공통으로 사용될 컴포넌트를 정리한 설계서입니다.

### 1-1. 앱 스크린 구성 및 명칭 (Screen Flow)

| 단계 (Flow) | 공식 명칭 (Screen Name) | 역할 및 주요 기능 | 재사용/공통 컴포넌트 (UI/UX) | 개발 상태 |
| :--- | :--- | :--- | :--- | :--- |
| **1. 첫 로그인** | `LoginScreen` | 소셜 로그인, 생년월일 입력 및 연령 검증 등 초기 진입점 | 텍스트(Pretendard), 둥근 버튼(`Button`), 소셜 아이콘 | 구현됨 (폰트/아이콘 리팩토링 필요) |
| **2. 사용자 입력 (메인)** | `TripPlannerScreen` | 목적지 검색, 일정, 동행인, 취향 등 데이터 입력 폼 | 자동완성 폼(`PlaceAutocomplete`), 공통 Date/Time Picker, Vibe Chip | 구현됨 (폼 요소 통일감 강화 필요) |
| **3. 여정 생성 결과** | `ItineraryResultModal` | 생성된 여정을 인앱 슬롯 형태로 제공, 시간대별 카드, 사진+지도 뷰어 | 여정 카드(`SlotCard`), 공통 이미지 뷰어, 인터랙티브 맵(`InteractiveMap`), 바텀 시트(`BottomSheet`) | 현존 (인앱 모달/독립 컴포넌트로 분리 필요) |
| **4. 전문가 검증** | `VerificationScreen` | 전문가 검증 (결제상태 및 무/유료 회원 구별 표시) | 회원 상태 표시 UI, 일반/프리미엄 버튼 구분 | 🟢 **구현됨** |
| **5. 프로필 (마이페이지)** | `ProfileScreen` | 저장된 여정 목록, 🟢 **신규: 결제/구독 관리 섹션** | 리스트 아이템(`ListItem`), 결제 폼 UI | 🟢 **구현됨** |
| ***. 이벤트 여정 (추후)** | `ThemePlannerScreen` (ex. BTS) | 특정 이벤트(BTS 공연 등) 테마에 맞춘 독립적 맞춤 여정 생성 | 테마 전용 컬러 필터, 특화 장소 핀(Pin) 마커 | 🔴 추후 연동 (독립 모듈화 준비) |
| ***. 미리보기 (추후)** | `ItineraryPreviewScreen` | 생성 전/후 간략 정보 제공 | 썸네일 캐러셀(`Carousel`) | 🔴 추후 연동 |

---

### 1-2. 공통 UI 컴포넌트(Design System) 통일 전략

화면(Screen) 단위로 코딩하는 대신, 아래의 **'공용 컴포넌트 레고 블록'**을 먼저 만들어 두고 모든 화면에서 가져다 쓰는(Import) 방식을 적용합니다. 이렇게 해야 추후 디자인이 변경되어도 한 곳만 고치면 전체가 바뀝니다.

#### A. Core Foundation (기초)
* **Typography (`ThemedText.tsx` 강화)**
  * **프리텐다드(Pretendard)** 폰트 적용: `display`, `h1`, `h2`, `body`, `caption` 등으로 미리 정의된 스타일만 강제 배정.
* **Iconography (`Icon.tsx` 통합)**
  * 기존 투박하고 서로 다른 설정(FontAwesome, Feather 등)을 전부 버리고 **Lucide Icons** 단일 패키지로 통일 래핑(Wrapping) 컴포넌트를 만듭니다.

#### B. UI Components (요소)
* **`ActionButton`**: 앱 전반에 걸친 둥근 모서리 버튼 (Primary, Secondary, Outline 등 Variant 지원)
* **`SlotCard`**: 여정 생성 시 나오는 시간별 장소 뷰 (이미지 + 텍스트 + 우측 맵 핀 아이콘)
* **`TagChip`**: Vibe(취향) 선택이나 상태(전문가 검증 '대기중/완료')를 표시하는 둥근 배경 텍스트
* **`BottomSheetModal`**: 장소를 클릭했을 때 사진+지도가 위로 스윽 올라오는 인앱 슬롯 팝업 뷰

---

## 2. NUBI UI/UX 및 컴포넌트 통합 작업 내역 (체크리스트)

- [x] 1. 앱 내비게이션 및 화면 명칭 일관성 설계 (표 작성 완료)
- [x] 2. 핵심 UI 컴포넌트 설정
    - [x] 통합 폰트 적용 (Pretendard)
    - [x] 통합 아이콘 세트 적용 (Lucide)
    - [x] 공통 컴포넌트 표준화 (버튼, 모달, 카드)
- [x] 3. 화면 수정 및 연동
    - [x] `LoginScreen` 리팩토링 및 불필요한 타이포/글로우 애니메이션 원상복구 (정적 텍스트 설계 유지)
    - [x] `TripPlannerScreen` 리팩토링 (사용자 입력 폼)
    - [x] `ItineraryResultModal` 생성/수정 (슬롯 + 이미지/지도 뷰)
    - [x] `VerificationScreen` 적용 (현지 전문가 검증) 영역의 `route.params` 참조 크래시 해결
    - [x] `ProfileScreen` 업데이트 (설정 메뉴 라우팅 누락 복구 및 대시보드 연결)
- [ ] 4. 향후 작업 준비
    - [x] `BTSConcertPlanner` 구조 준비 (독립적인 플로우 구성)
- [x] 5. 클라이언트 내 TypeScript 및 ESLint 에러 완벽 해결 (NoEmit 검증 및 Fix 완료)
