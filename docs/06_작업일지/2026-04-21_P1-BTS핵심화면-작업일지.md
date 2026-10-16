# P1 — BTS 핵심 화면 작업일지

> **기간**: 2026-04-01 ~ 04-07 (원래) → 4/6 현재 ~40% 진행
> **목표**: BTS 랜딩 + BTS 홈 3씬 + 공통 UI 컴포넌트 완성
> **전제**: P0 완료 (서버 기동 + DB 준비 + 앱 빌드 가능)
> **참조**: `docs/백서-v1.2.md` §12 로드맵 P1 + §4 화면 상세 + Phase 2 BTS 홈
> **이전**: ← `docs/P0-기반구축-작업일지.md`
> **다음**: → `docs/P2-숏폼여정-작업일지.md` (미작성)
> **D-Day**: 고양 첫 공연 4/09 = **D-3** (4/6 기준)

---

## 1. 공통 UI 컴포넌트 (Apple HIG 수준)

> 백서 §6.3 컴포넌트 스펙 + §1-3 원칙 9번 "Apple 수준 디자인" 기준
> 이모지 절대 금지. Lucide 아이콘만. 절제된 프리미엄.

### 1-1. 테마 / 상수 / 훅 (완료)

| 날짜 | 상태 | 작업 | 파일 (줄수) | 메모 |
|------|------|------|-------------|------|
| ~4/3 | ✅ | BTS 테마 상수 | `client/constants/bts-theme.ts` (212줄) | Gemini 색감 팔레트, 다크/라이트 토큰, 타이포, 여백 |
| ~4/3 | ✅ | BTS 캐릭터 상수 | `client/constants/bts-characters.ts` (108줄) | 7명 이름, Vibe, 설명, 이미지 경로, 프롬프트 성격 |
| ~4/3 | ✅ | BTS 테마 훅 | `client/hooks/useBTSTheme.ts` (37줄) | 시간대별 자동 라이트/다크 전환 |
| ~4/3 | ✅ | BTS Context | `client/contexts/BTSContext.tsx` (157줄) | 선택 멤버, 도시, 날짜, 상태 관리 |

### 1-2. 공통 UI 컴포넌트 (미완료)

| 날짜 | 상태 | 작업 | 스펙 (백서 §6.3) | 파일 | 메모 |
|------|------|------|------------------|------|------|
| — | ⬜ | Button | 52px height, 14px radius, scale(0.97) 터치 피드백, solid fill 또는 subtle gradient | `client/components/ui/Button.tsx` | — |
| — | ⬜ | Card | 16~20px radius, shadow(0,2,8,rgba(0,0,0,0.08)), 1px border rgba(255,255,255,0.06) | `client/components/ui/Card.tsx` | — |
| — | ⬜ | TabBar | 60px height, frosted glass blur 20px, hairline 구분선 1px | `client/components/ui/TabBar.tsx` | P3에서 5탭 사용, P1에서 기반만 |
| — | ⬜ | FAB (현지인인증) | 56px circle, subtle glow 애니메이션 (과하지 않게) | `client/components/ui/FAB.tsx` | P3에서 사용, P1에서 기반만 |
| — | ⬜ | Chip/Tag | 999px radius (pill), 32px height, muted fill | `client/components/ui/Chip.tsx` | Vibe 선택 등 |
| — | ⬜ | Lucide 아이콘 패키지 설치 | `package.json` | `lucide-react-native` |
| — | ⬜ | 이모지 → Lucide 아이콘 전환 | 전체 BTS 파일 | UI에서 이모지 전부 제거 |

### 1-3. 시간대별 모드 전환

| 날짜 | 상태 | 작업 | 파일 | 메모 |
|------|------|------|------|------|
| ~4/3 | ✅ | `useBTSTheme` 훅 작성 | `client/hooks/useBTSTheme.ts` | 6~18시 라이트 / 18~6시 다크 |
| — | ⬜ | 앱 전역 적용 (App.tsx 레벨) | `client/App.tsx` | 현재 BTS 전용 → 전역으로 |
| — | ⬜ | 실기기 시간대 전환 테스트 | 실기기 | 기기 시간 변경 → UI 확인 |

---

## 2. BTS 랜딩 화면 (로그인 전)

> 백서 §4-1 + §7-5 "가입 퍼널"
> 상단: "BTS 아리랑 월드투어 2026" + 아미봉 파티클
> 하단: OAuth (Google/Kakao/Apple) + 생년월일
> 가입 3초 완료, 흐름 끊김 없이 홈으로

### 2-1. 랜딩 스크린 (3개 버전 — 택1 필요)

| 날짜 | 상태 | 작업 | 파일 (줄수) | 메모 |
|------|------|------|-------------|------|
| ~4/3 | ✅ | 랜딩 v1 (기본) | `client/screens/BTSLandingScreen.tsx` (180줄) | — |
| ~4/3 | ✅ | 랜딩 A1 (대안) | `client/screens/BTSLandingScreenA1.tsx` (131줄) | — |
| ~4/3 | ✅ | 랜딩 C (대안) | `client/screens/BTSLandingScreenC.tsx` (236줄) | — |
| — | 🔴 | **최종 버전 확정** | — | 사용자가 3개 비교 후 택1. 나머지 삭제 |

### 2-2. 상단 비주얼 (히어로 + 파티클)

| 날짜 | 상태 | 작업 | 파일 (줄수) | 메모 |
|------|------|------|-------------|------|
| ~4/3 | ✅ | 투어 히어로 v1 | `client/components/BTSTourHero.tsx` (154줄) | "BTS 아리랑 월드투어 2026" 비주얼 |
| ~4/3 | ✅ | 투어 히어로 A1 | `client/components/BTSTourHeroA1.tsx` (157줄) | 대안 |
| ~4/3 | ✅ | 아리랑 엠블럼 | `client/components/bts/ArirangEmblems.tsx` (171줄) | 로고/엠블럼 애니메이션 |
| ~4/3 | ✅ | 라이트 파티클 | `client/components/bts/LightParticles.tsx` (155줄) | 아미봉 파티클 배경 효과 |
| — | 🔴 | **히어로 최종 확정** | — | v1 vs A1 택1 |

### 2-3. 하단 인증 (OAuth + 생년월일)

| 날짜 | 상태 | 작업 | 파일 (줄수) | 메모 |
|------|------|------|-------------|------|
| ~4/3 | ✅ | 아미봉 인증 v1 | `client/components/bts/ArmyBombAuth.tsx` (551줄) | OAuth 버튼 + 생년월일 |
| ~4/3 | ✅ | 아미봉 인증 A1 | `client/components/bts/ArmyBombAuthA1.tsx` (363줄) | 대안 |
| ~4/3 | ✅ | 아미봉 C | `client/components/bts/ArmyBombC.tsx` (379줄) | 대안 |
| ~4/3 | ✅ | 인증 입력 존 | `client/components/AuthInputZone.tsx` | 공통 입력 컴포넌트 |
| — | 🔴 | **인증 UI 최종 확정** | — | 3개 중 택1 |
| — | ⬜ | OAuth 실제 연동 (Google) | `server/googleAuth.ts` | ⚠️ 수정금지 — 테스트만 |
| — | ⬜ | OAuth 실제 연동 (Kakao) | `server/kakaoAuth.ts` | ⚠️ 수정금지 — 테스트만 |
| — | ⬜ | OAuth 실제 연동 (Apple) | `server/appleAuth.ts` | — |
| — | ⬜ | 생년월일 → 캐릭터 매칭 연결 | — | birthDate → 연령대 → M1~F7 or BTS 멤버 추천 |
| — | ⬜ | 로그인 성공 → 홈 자동 전환 | — | 끊김 없이 BTS 홈으로 |

---

## 3. BTS 홈 — 공연 인트로 3씬

> 백서 Phase 2 BTS 홈 (lines 1046~1083)
> 풀스크린 몰입. 상단/하단 푸터 없음. 버튼 최소. 게임 시작 장면처럼.
> 모든 전환 = 애니메이션, 로딩 화면 없음.

### 3-1. Scene 1 — 세계지도 + 아미봉 34핀

| 날짜 | 상태 | 작업 | 파일 | 메모 |
|------|------|------|------|------|
| — | ⬜ | 다크 세계지도 배경 | — | 일러스트 또는 react-native-maps 다크 테마 |
| — | ⬜ | 아미봉 핀 34개 배치 | — | cities.btsRank 1~34 좌표 |
| — | ⬜ | 핀 하나씩 빛나며 등장 애니메이션 | — | reanimated 순차 fadeIn + glow |
| — | ⬜ | 각 핀에 공연 날짜 표시 | — | cities.btsConcertDates |
| — | ⬜ | 배경 은은한 인트로 음악 | — | Expo Audio |
| — | ⬜ | 아미봉 탭 → Scene 2 줌인 | — | 탭 이벤트 → 줌인 전환 |

### 3-2. Scene 2 — 도시 줌인 + 공연 정보 + 7명 등장

| 날짜 | 상태 | 작업 | 파일 | 메모 |
|------|------|------|------|------|
| — | ⬜ | 탭한 도시로 지도 줌인 애니메이션 | — | spring damping 15~20 |
| — | ⬜ | 공연 정보 표시 | — | "4/09~12 고양 스타디움" (cities.btsVenue) |
| 4/21 | ✅ | 7명 캐릭터 둥글게 등장 | `BTSCharacterSelectScreen.tsx` | 타원 배치 (rx=128, ry=154) + ZoomIn 애니 (커밋 b9c20ce→207b643) |
| 4/21 | 🟨 | "누구와 XX를 여행할까요?" 텍스트 | `BTSCharacterSelectScreen.tsx` | 타이틀 구현됨("누구랑 여행하고 싶으세요?"), **도시명 동적 미반영** |

### 3-3. Scene 3 — 멤버 선택 → 대사 → 자동 시작

| 날짜 | 상태 | 작업 | 파일 | 메모 |
|------|------|------|------|------|
| ~4/4 | ✅ | 캐릭터 선택 스크린 기본 | `client/screens/bts/BTSCharacterSelectScreen.tsx` (517줄) | 7명 선택 UI 구현 |
| 4/21 | ✅ | 멤버 탭 → 나머지 6명 페이드 아웃 | `BTSCharacterSelectScreen.tsx` | dim overlay rgba(30,30,30,0.65) + 중앙 hero 262px 줌인 (커밋 205eecb) |
| — | ⬜ | Vibe 자동 확정 (멤버별 고정) | — | 정국=모험, 지민=힐링 등 (`bts-characters.ts`) |
| — | ⬜ | 날짜 자동 설정 (공연 D-3) | — | 선택 도시 공연일 기준 |
| — | ⬜ | 1인칭 대사 표시 | — | "저랑 LA에서 모험을 시작할까요?" |
| — | ⬜ | 대사 탭 = 여정 생성 시작 | — | 3초 후 자동 시작 옵션 |
| 4/21 | ✅ | 돌아오기 = 자동 리셋 | `BTSCharacterSelectScreen.tsx` | `useFocusEffect`로 selectedId null 초기화 (커밋 207b643) |

**Screen C 완성도: ~95%** (사용자 판정, 2026-04-21)
- 시각/인터랙션/2단계 탭/배경 취소/overlay 탭 관통 완료
- 남은 5%: 도시명 동적, 1인칭 대사, Vibe/날짜 자동 확정, 대사 탭 confirm (별도 이터레이션)

### 3-4. Scene 4 — BGM 전환 + 숏폼 대기

| 날짜 | 상태 | 작업 | 파일 | 메모 |
|------|------|------|------|------|
| — | ⬜ | Vibe별 BGM 매칭 | — | 모험=록, 힐링=앰비언트, 미식=보사노바 등 |
| — | ⬜ | BGM 재생 (Expo Audio) | — | 씬 전환 시 자연스럽게 |
| — | ⬜ | 숏폼 준비 중 BGM이 배경으로 | — | P2 숏폼과 연결 |

### 3-5. 씬 전환 애니메이션

| 날짜 | 상태 | 작업 | 파일 | 메모 |
|------|------|------|------|------|
| — | ⬜ | Scene 1→2 줌인 전환 | — | spring, 끊김 없음 |
| — | ⬜ | Scene 2→3 캐릭터 포커스 전환 | — | fadeOut/fadeIn |
| — | ⬜ | Scene 3→4 BGM 크로스페이드 | — | 음악 전환 |
| — | ⬜ | 전체 spring damping 15~20 통일 | — | Apple 느낌 |

---

## 4. 기존 BTS 스크린 (구현됨, 점검 필요)

| 날짜 | 상태 | 작업 | 파일 (줄수) | 메모 |
|------|------|------|-------------|------|
| ~4/4 | ✅ | 대시보드 스크린 | `client/screens/bts/BTSDashboardScreen.tsx` (586줄) | 3씬 흐름과 연결 확인 필요 |
| ~4/4 | ✅ | 로딩 스크린 | `client/screens/bts/BTSLoadingScreen.tsx` (241줄) | 숏폼 대기 화면 |
| ~4/4 | ✅ | 장소 카트 스크린 | `client/screens/bts/BTSPlaceCartScreen.tsx` (513줄) | 장소 선택/변경 |
| — | ⬜ | 3씬 흐름과 기존 스크린 연결 정리 | — | 중복/불필요 스크린 정리 |
| — | ⬜ | 네비게이션 흐름 최종 확정 | `client/navigation/BTSStackNavigator.tsx` (57줄) | 랜딩→Scene1→2→3→로딩→결과 |

---

## 5. 앱 진입점 연결

| 날짜 | 상태 | 작업 | 파일 | 메모 |
|------|------|------|------|------|
| ~4/3 | ✅ | App.tsx BTS 분기 추가 | `client/App.tsx` (수정됨, 미커밋) | — |
| ~4/3 | ✅ | RootStackNavigator BTS 스택 추가 | `client/navigation/RootStackNavigator.tsx` (수정됨, 미커밋) | — |
| — | ⬜ | BTS/범용 앱 분기 로직 확정 | — | 랜딩만 다르고 이후 동일 |
| — | ⬜ | 에러 바운더리 | `client/lib/error-reporter.ts` (신규) | 크래시 방지 |

---

## P1 완료 체크리스트

> 아래 전부 ✅ 되면 P1 완료 → P2 진행

### 필수 (P2 진입 전 반드시)
- [ ] 랜딩 최종 버전 확정 (3개 중 택1, 나머지 삭제)
- [ ] 히어로 최종 확정 (v1 vs A1)
- [ ] 인증 UI 최종 확정 (3개 중 택1)
- [ ] OAuth 1개 이상 실제 동작 확인 (Google 우선)
- [ ] 로그인 → 홈 전환 정상
- [ ] Scene 1: 세계지도 + 핀 표시
- [ ] Scene 2: 줌인 + 7명 등장
- [ ] Scene 3: 멤버 선택 → 대사
- [ ] 네비게이션 흐름 (랜딩→1→2→3) 끊김 없음

### 권장 (P2에서 병행 가능)
- [ ] 공통 UI 컴포넌트 (Button, Card, Chip)
- [ ] Lucide 아이콘 통일
- [ ] BGM 재생
- [ ] 씬 전환 spring 애니메이션 Polish
- [ ] 실기기 테스트

---

## 의존성 / 블로커

| 블로커 | 영향 | 해결 |
|--------|------|------|
| ~~P0 서버 미기동~~ | ~~OAuth 테스트 불가~~ | ✅ P0 완료 (4/7) |
| ~~랜딩 3버전 미확정~~ | ~~중복 코드~~ | ✅ 18KB 메인 버전 확정 (4/11 Cursor 커밋) |
| ~~react-native-maps 미설치~~ | ~~세계지도 불가~~ | ✅ SVG 도트맵으로 대체 (2,134점 보라 사각형) |
| Rive 미설치 | 캐릭터 애니메이션 PNG만 가능 | P2에서 도입 |
| ~~Expo Go 직접 연결 불가~~ | ~~실기기 테스트 불가~~ | Windows 방화벽 차단 → Chrome DevTools 모바일 뷰로 대체 |

---

## 2026-04-16 작업 기록

### Screen C (캐릭터 선택) — 완전 재구현

| 항목 | 변경 전 | 변경 후 |
|------|---------|---------|
| 레이아웃 | FlatList 캐러셀 + 파티클 | 삼각함수 원형 배치 (sin/cos) |
| 디자인 패턴 | 다크 시네마틱 | 화이트 프리미엄 + TeamShowcase 호버 |
| 캐릭터 이미지 | 구 아바타 (char_*.png) | 신규 전신 일러스트 (bts_*.png) + 얼굴 크롭 |
| 반응형 | Dimensions.get 고정값 | useWindowDimensions 훅 (동적 계산) |
| 인터랙션 | 스와이프 캐러셀 | 호버(1.25x 확대) + 탭(즉시 전환) |
| 호버 효과 | 없음 | 공유 hoveredId: 나머지 dim + 그레이스케일→컬러 |
| 중앙 영역 | "누구랑 여행하고 싶으세요?" 고정 | 호버 시 캐릭터 영어이름 + 한국어특징 + 태그 표시 |
| 타이틀 | 원형 중심에 겹침 | 원형 상단으로 분리 (여백 24px) |
| 선택 후 | 1.5초 골드링 대기 | 즉시 다음 화면(BTSPlaceCart) 이동 |
| 패키지 | react-native-circle-layout | 제거 (미사용) |

### 에셋 추가
- `assets/images/bts-characters/bts_*.png` × 7장 (전신 일러스트)
- `assets/images/tripis-icon.png` (앱 아이콘)
- `assets/images/tripis-logo.png` (Tripis 로고)

### 폰트 통일 (Pretendard-Bold)
- `BTSLandingScreen.tsx` — SpaceGrotesk/NotoSerifKR → Pretendard-Bold
- `BTSWorldMapScreen.tsx` — SpaceGrotesk → Pretendard-Bold
- `BTSCharacterSelectScreen.tsx` — 신규 작성 시 Pretendard-Bold 적용

### 서버
- `server/bts-routes.ts` — top-places/generate 쿼리에 lat/lng 좌표 추가

### 내부 검증
- TypeScript 빌드: 에러 0개
- /simplify 실행: react-native-circle-layout 제거, CSS filter 정리, useMemo 적용
- 화면 전환 확인: WorldMap → CharacterSelect → PlaceCart 정상

### 앱 이름 변경
- **Tripis (트리피스)** — "당신의 여행을 전달하는, 세상에 하나뿐인 AI 비서"
| BGM 에셋 없음 | Scene 4 BGM 재생 불가 | 로열티프리 확보 필요 |
| ~~Expo 앱 빌드 환경~~ | ~~네이티브 확인 불가~~ | ⚠️ Playwright 웹 검증으로 대체 |

---

## 4/11~13 작업 완료 사항

### 인프라
| 날짜 | 상태 | 작업 | 커밋 |
|------|------|------|------|
| 4/11 | ✅ | Cursor 개발본 통합 (18KB BTSLanding + WorldMap + SVG) | ba37254, 37bddd5 |
| 4/11 | ✅ | BTS 배너→랜딩→미니앱 네비게이션 연결 | 6f30235 |
| 4/12 | ✅ | Gemini API 키 갱신 (Supabase DB 직접 업데이트) | — |
| 4/12 | ✅ | Replit 배포 확인 (my-guide.replit.app) | — |
| 4/12 | ✅ | Koyeb 배포 확인 + 자동 배포 정상 | — |

### 세계지도 도트맵
| 날짜 | 상태 | 작업 | 커밋 |
|------|------|------|------|
| 4/12 | ✅ | 보라 사각형 도트맵 SVG (2,134점 + 34 캡슐 마커) | 5b62814 |
| 4/12 | ✅ | DotWorldMap 재사용 컴포넌트 (좌표 변환 유틸) | 5b62814 |
| 4/13 | ✅ | 카드를 mapArea 안에 배치 (도시 좌표 위, 날아오지 않음) | 4b06d06 |
| 4/13 | ✅ | /api/bts/next-concert API 실시간 연동 | 4b06d06 |
| 4/13 | ✅ | 흰색 글래스 카드 + 보라 테두리 (도트맵과 대비) | 4b06d06 |
| 4/13 | ✅ | RN 베스트프랙티스: borderCurve, boxShadow, gap | 4b06d06 |
| 4/13 | ✅ | 타이밍 원본 복원 (1초→1.5초→3.5초) | 4b06d06 |
| 4/13 | ✅ | Playwright 자동 스크린샷 검증 체계 구축 | — |

### 랜딩 화면
| 날짜 | 상태 | 작업 | 커밋 |
|------|------|------|------|
| 4/13 | ✅ | OAuth 바이패스 (BTS 랜딩은 인증 없이 진입) | 4b06d06 |
| 4/13 | ✅ | next-concert 전체 데이터 전달 (city, date, dDay, venue) | 4b06d06 |

### 남은 작업
| 상태 | 작업 | 메모 |
|------|------|------|
| ⬜ | 카드 3D 입체감 강화 (앱에서 확인 후 조정) | 웹에서는 한계, 네이티브 앱 필요 |
| ⬜ | 캐릭터 이름 재명명 (저작권 회피) | Stitch에서 디자인 중 |
| ⬜ | BTS 미니앱 UI 개선 (Stitch 시안 반영) | 사용자 작업 중 |
| ⬜ | Layla식 여정 결과 (Dashboard) | P2 범위 |

---

## 2026-04-17 세션: Screen D 재설계 + EAS 자동화 기반 구축

### Screen D 재설계 (화이트 프리미엄 + 글라스 극투명)
사용자 피드백 5차 반영한 전면 재작성. 스크린샷 확인 완료, "초안 수준, 수정/조정 많음" 예정.

| 상태 | 작업 | 파일 | 메모 |
|------|------|------|------|
| ✅ | 전면 재작성 | `client/screens/bts/BTSPlaceCartScreen.tsx` | 다크→화이트, HERO 69% 공간, 이모지 완전 제거 |
| ✅ | 헤더 최소화 | 동일 | 뒤로가기(←) 단독 줄, "같이 떠나요" CTA |
| ✅ | 도시 버튼 5등분 | 동일 | 공연 임박 순, 가로 스크롤 제거 |
| ✅ | 장소 글라스 카드 | 동일 | BlurView + 0.18 투명 + 실제 사진 + 카테고리 목업 폴백 |
| ✅ | Rive 애니메이션 폴백 | 동일 | 선택 시 Reanimated bounce/tilt, Rive 파일 수급 대기 |
| ✅ | 전역 버튼 시스템 신규 | `client/components/ui/LiquidButton.tsx` | RN 어댑트 (shadcn LiquidButton → BlurView + shadow) |
| ✅ | 원본 shadcn 보관 | `docs/design-references/button-system-shadcn.tsx` | Button + LiquidButton + MetalButton 영구 참조 |
| ✅ | nextConcertDate 필드 | `server/bts-routes.ts` | cities API 응답 확장, 공연 임박 순 클라이언트 정렬 |
| ✅ | BTSCity 타입 확장 | `client/contexts/BTSContext.tsx` | nextConcertDate + clearSelectedPlaces 액션 |
| ✅ | dev fallback 프록시 | `server/index.ts` | `/dist` 없을 때 Metro 8081로 자동 프록시 |
| ✅ | tsconfig 제외 추가 | `tsconfig.json` | `docs/design-references/**`, `_agent/**` 제외 |

### EAS Update 자동화 기반 (비개발자 터미널 제로 워크플로우)
사용자가 Expo 대시보드 스크린샷 공유 → EAS 무료 계정 + Apple Developer 계정 확인 → GitHub 연결 + EAS Update 자동화 파이프라인 구축.

| 상태 | 작업 | 파일 | 메모 |
|------|------|------|------|
| ✅ | EAS 빌드 설정 | `eas.json` | cli 13.0+, appVersionSource=remote, channel(main/production) 추가, Android APK 유지 |
| ✅ | GitHub Actions 워크플로우 | `.github/workflows/eas-update.yml` | main 푸시 시 자동 `eas update` 실행 |
| ✅ | app.json EAS Update 설정 | `app.json` | updates.url + runtimeVersion.policy=appVersion 추가 |
| ✅ | 사용자 한글 가이드 | `docs/EAS-DASHBOARD-GUIDE.md` | 대시보드 클릭 4단계 + iPhone/Android 설치 + 문제해결 |
| ⬜ | **사용자 액션 필요** | Expo 대시보드 | Connect GitHub + EXPO_TOKEN 발급 + Secrets 등록 |
| ⬜ | **사용자 액션 필요** | 대시보드 Development builds | iOS + Android 최초 빌드 (20-30분 × 2) |
| ⬜ | **사용자 액션 필요** | 폰 2대 | QR 스캔 설치 |

### 최종 워크플로우 (셋업 후)
```
Claude 코드 수정 → git push → GitHub Actions → EAS Update → 폰 앱 재시작 → 새 버전
```
사용자 iteration 당 액션: **앱 닫고 다시 열기 1회**. 1000회 iteration 대응 가능.

### 다음 세션 즉시 재개 지점
1. 사용자 액션 1-3 완료 확인 (GitHub 연결 / EXPO_TOKEN / Dev Build 완료)
2. 의도적 작은 수정 (예: CTA 폰트 크기 1pt) → 푸시 → 폰 반영 확인
3. 성공 후 Screen D 본격 "수정/조정" iteration 시작
4. 사용자 피드백 수집 → Claude 수정 → push → 확인 루프

### 주의사항
- **네이티브 변경 시 (`package.json` expo-*/react-native-* 추가, `app.json` plugins 변경)**: EAS Build 재실행 필요 (20-30분). JS/이미지/스타일만 변경은 Update로 즉시 전달.
- **무료 플랜**: EAS Build 30회/월 (초기 + 네이티브 변경 시만 소모), EAS Update 무제한.

---

## 변경 이력

| 날짜 | 내용 |
|------|------|
| 2026-04-17 | Screen D 전면 재설계 + 전역 LiquidButton + EAS Update 자동화 파이프라인 구축 (GitHub Actions + 대시보드 가이드) |
| 2026-04-16 | Screen C 캐릭터 선택 화이트 프리미엄 재구현 + 에셋 교체 + 폰트 통일 (커밋 61b0ba2) |
| 2026-04-13 | 세계지도 줌인 카드 완성 — mapArea 내 배치, DB 연동, 글래스 스타일, Playwright 검증, RALPH LOOP 워크플로우 도입 |
| 2026-04-12 | Gemini API 키 갱신, Replit/Koyeb 배포 확인, 도트맵 SVG 교체, DotWorldMap 컴포넌트 |
| 2026-04-11 | Cursor 개발본 통합 (18KB 랜딩), 배너→랜딩→미니앱 연결, 프로젝트 구조 정리 |
| 2026-04-06 | P1 작업일지 초안 — 백서 v1.2 + 코드 실사 (5,260줄 분석) 기반 |
