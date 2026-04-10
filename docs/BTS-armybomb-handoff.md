# BTS 아미봉 랜딩 페이지 — 작업 인수인계 문서

## 과제
A안의 사각형 인증 카드를 **아미봉(라이트스틱) 형태**로 변경

## 요구사항
1. ㅇㄹㄹ 엠블럼 삭제
2. "Join the ARMY" 텍스트 삭제
3. 인증창 = 아미봉 형태 (원형 머리 + 손잡이)
4. 3단 점등: 등장(50%) → 생년월일(70%) → 인증(100%+화이트아웃)
5. 아미봉 + 배경이 동시에 밝아지는 조명 연동
6. OAuth 버튼 텍스트/비율은 A안 그대로 유지

## 현재 활성 버전: A안
- `client/screens/BTSLandingScreen.tsx`
- `client/components/BTSTourHero.tsx`
- `client/components/bts/ArmyBombAuth.tsx`
- `client/navigation/RootStackNavigator.tsx` → `BTSLandingScreen`

## 참고 버전 (원본 보존됨)
- **B안** `bts-app/components/GlassLightStickAuth.tsx` — 아미봉 형태 참고 (원형 머리 + 손잡이)
- **C안** `client/screens/BTSLandingScreenC.tsx` — 실패작 (참고만)
- **A1안** `client/components/bts/ArmyBombAuthA1.tsx` — 실패작 (참고만)

## 핵심 기술 이슈

### BlurView + borderRadius 버그 (expo-blur)
BlurView에 직접 borderRadius 적용하면 렌더링 깨짐!
```tsx
// ❌ 잘못된 방법
<BlurView style={{ borderRadius: 100 }} />

// ✅ 올바른 방법 — 부모 View에서 클리핑
<View style={{ borderRadius: 100, overflow: 'hidden' }}>
  <BlurView style={{ flex: 1 }} intensity={80} tint="dark" />
</View>
```
출처: https://github.com/expo/expo/issues/18615

### 검증된 아미봉 구현 패턴
```tsx
<View style={{ alignItems: 'center' }}>
  {/* 원형 머리 */}
  <View style={{ width: 200, height: 200, borderRadius: 100, overflow: 'hidden', zIndex: 2 }}>
    <BlurView style={{ flex: 1 }} intensity={80} tint="dark">
      {/* 생년월일 입력 */}
    </BlurView>
  </View>
  {/* 손잡이 */}
  <View style={{ width: 160, height: 260, borderRadius: 20, overflow: 'hidden', marginTop: -25, zIndex: 1 }}>
    <BlurView style={{ flex: 1 }} intensity={60} tint="dark">
      {/* OAuth 버튼 */}
    </BlurView>
  </View>
</View>
```

### 성능 주의사항
- BlurView intensity를 SharedValue로 직접 변경 금지 → opacity 레이어링
- Android: BlurView 대신 `rgba(0,0,0,0.65)` 반투명 배경 fallback
- setTimeout 대신 `withTiming callback + runOnJS`로 네비게이션
- Haptic: Light → Medium → Notification.Success

### 비율 가이드
- 원형 머리: `screenWidth * 0.62` (242px @390px 화면)
- 손잡이: 머리의 70-85% 너비 (OAuth 버튼 공간 확보)
- 실제 아미봉 비율: 머리 1 : 손잡이 1.8

## 설치된 (미사용) 라이브러리
- `react-native-animated-glow` — 3단 점등 글로우 효과에 활용 가능
- `@shopify/react-native-skia` — 위 라이브러리 의존성

## 디자인 토큰
- 배경: `#0B1026` (코발트 딥)
- 보라해: `#6C2DC7`
- 아리랑 레드: `#C73E2D`
- 카카오: `#FEE500`
