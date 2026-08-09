// ⚠️ 수정금지(승인필요) 2026-08-09 사장님 지시 — 앱을 열면 **이 앱이 뭐하는 앱인지** 보여주는 소개 화면.
//
// 왜 여기서 하는가 = 폰이 띄우는 시작 그림(app.json)은 **그림 한 장**이라 글자를 움직일 수 없다.
//   앱이 아직 안 켜진 상태라 우리 코드가 돌지 않기 때문. 그래서 그 그림이 걷힌 **직후**를 이 화면이 받는다.
//   바탕색을 시작 그림과 **같은 베이지**로 두어 두 화면이 이어붙은 것처럼 넘어간다.
//   ⚠️ 이 화면은 우리 코드 = **무선 업데이트로 들어간다**(시작 그림 자체를 바꾸면 앱을 다시 구워야 함).
//
// 글자 효과 = 낱말이 **차례로 아래에서 올라오며 진해진다**(사장님 확정 (가)안).
//   요란한 것보다 조용히 살아나는 쪽이 글라스 미니멀리즘에 맞다.
import React, { useCallback, useEffect } from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from "react-native-reanimated";
import { Brand, Fonts } from "@/constants/theme";

// ⚠️ 수정금지(승인필요) 2026-08-09 사장님 확정 = **어두운 화면(다크) 지원 안 함 = 밝음 고정.**
//   사유(사장님) = 한국 사용자는 다크를 거의 쓰지 않는다. 어둡게 쓰고 싶은 사람은 자기 폰에서 바꾼다.
//   그래서 기기 설정을 따라가는 분기를 두지 않는다(§0 = 분기 안 만듦). 시작 그림 바탕과 같은 색 1개뿐.
//   ⚠️ 남은 일 = app.json 의 시작 그림에 `dark: { backgroundColor: "#0B0B0D" }` 가 아직 있다.
//     그 칸은 **다시 구워야** 바뀌므로 다음 빌드 때 #FAF6EF 로 통일한다(그때까지 다크 폰만 첫 순간 검정).
const BG = "#FAF6EF";
const WORD_STEP_MS = 90; // 낱말 하나가 다음 낱말보다 먼저 올라오는 간격
const WORD_RISE_MS = 420; // 낱말 하나가 다 올라오는 데 걸리는 시간
const HOLD_MS = 1000; // 다 나온 뒤 머무는 시간 = 전체 약 1.8초
const FADE_OUT_MS = 320;

// ⚠️ 수정금지(승인필요) 2026-08-09 사장님 확정 — 상표 한 줄. **영어 고정 = 번역하지 않는다.**
//   뜻 = 이름이 만들어진 방식 그대로. Trip + (아이언맨의) 자비스 = "내 편인 AI" → 쉬운 말로 **여행친구**.
//   ⚠️ 'Jarvis' 는 글자로 쓰지 않는다 = 마블·디즈니 상표. 이름 Tripis 는 만든 낱말이라 안전.
//   ⚠️ 'companion' 도 쓰지 않는다 = BTS 캐릭터 화면이 "Who's your travel companion?" 로 이미 쓴다.
//   ⚠️ login.slogan(9단어 = concierge…) 을 쓰지 않는 이유 = 같은 뜻을 두 번 말하고(personal·just for you)
//     'concierge' 가 비영어권에 어렵다. 다만 그 문구는 **아직 살아 있다**(LoginScreen.tsx:95 + 7개 로케일).
//     그 화면은 지금 안 뜨지만 코드에는 있으므로 "폐기"가 아니다 = 정리는 그 화면을 손볼 때 함께(§19).
const TAGLINE = "Your AI travel friend";
// ⚠️ 수정금지(승인필요) 2026-08-09 판단3종 지적 = 낱말 나누기는 **모듈에서 한 번만** 한다.
//   렌더 안에서 나누면 매번 새 배열이 되고, 그 배열이 자동 종료 타이머의 조건에 들어가 있어
//   **화면이 다시 그려질 때마다 1.8초가 처음부터 다시 시작**됐다(화면 회전·인셋 확정 시 실제로 발생).
const TAGLINE_LINES = TAGLINE.split("\n").map((l) => l.trim().split(/\s+/));
const TAGLINE_WORDS = TAGLINE_LINES.flat().length; // 자동 종료 시각 계산용

// ⚠️ 수정금지(승인필요) 2026-08-09 사장님 지시 = **화면을 채운다.**
//   옛 고정 크기(로고 132 · 이름 34 · 문구 16) 폐기 = 2026-08-09 §19 —
//   아이폰12 실체감(300pt 폭)에서 **화면이 텅 비어 보였다**. 고정 px 는 작은 화면일수록 더 허전해진다.
//   그래서 **화면 크기의 비율**로 잡는다 = 폰이 커지면 같이 커지고 비율은 그대로.
//   위쪽 한도(cap) = 아이패드에서 글자만 괴물처럼 커지는 것 방지(app.json supportsTablet).
function useIntroSize() {
  const { width: sw, height: sh } = useWindowDimensions();
  const base = Math.min(sw, sh); // 세로/가로 어느 쪽으로 들어도 같은 그림
  return {
    mark: Math.round(Math.min(base * 0.7, 300)), // 로고 그림
    brand: Math.round(Math.min(sw * 0.19, 76)), // 'Tripis'
    tagline: Math.round(Math.min(sw * 0.065, 26)), // 'Your AI travel friend'
  };
}

/** 낱말 하나 = 아래에서 올라오며 진해진다. order 만큼 늦게 시작한다. */
const Word = React.memo(function Word({
  text,
  order,
  size,
}: {
  text: string;
  order: number;
  size: number;
}) {
  const p = useSharedValue(0);
  useEffect(() => {
    p.value = withDelay(
      order * WORD_STEP_MS,
      withTiming(1, {
        duration: WORD_RISE_MS,
        easing: Easing.out(Easing.quad),
      }),
    );
  }, [order, p]);

  const style = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [{ translateY: (1 - p.value) * 12 }],
  }));

  return (
    <Animated.Text
      style={[
        styles.slogan,
        { fontSize: size, lineHeight: Math.round(size * 1.45) },
        style,
      ]}
    >
      {text}{" "}
    </Animated.Text>
  );
});

export default function IntroSplash({ onDone }: { onDone: () => void }) {
  const size = useIntroSize();
  const fade = useSharedValue(1);
  const finish = useCallback(() => {
    fade.value = withTiming(0, { duration: FADE_OUT_MS }, (done) => {
      if (done) runOnJS(onDone)();
    });
  }, [fade, onDone]);

  // 다 나온 뒤 잠시 머물다 스스로 넘어간다. 누르면 그 자리에서 바로 넘어간다.
  //   조건은 finish 하나뿐 = 화면이 다시 그려져도 시간이 처음부터 되감기지 않는다(위 TAGLINE_LINES 주석).
  useEffect(() => {
    const total = TAGLINE_WORDS * WORD_STEP_MS + WORD_RISE_MS + HOLD_MS;
    const timer = setTimeout(finish, total);
    return () => clearTimeout(timer);
  }, [finish]);

  const fadeStyle = useAnimatedStyle(() => ({ opacity: fade.value }));

  let order = 0;
  return (
    // ⚠️ 수정금지(승인필요) 2026-08-09 = 화면을 덮는 창의 읽어주기 처리.
    //   ① 아이폰 = accessibilityViewIsModal 로 **뒤 화면 초점 차단**.
    //      ⚠️ 안드로이드는 이 속성이 없다. 뒤 화면을 막으려면 **뒤쪽 트리**에 no-hide-descendants 를 줘야 하는데
    //      그 트리는 이 부품 밖(App.tsx 의 NavigationContainer)이라 여기서 못 한다 = **안드로이드는 미차단**이 사실이다.
    //      1.8초 뒤 사라지는 창이라 열어 둔다. 옛 주석("importantForAccessibility 로 안드로이드도 막는다") 폐기 = §19(거짓).
    //   ② 화면 전체가 '눌러서 건너뛰기' 버튼 = 역할·이름을 준다.
    //   ③ 로고 그림 = 장식 = 읽을 것 없음. 낱말들도 ②가 한 줄로 읽어 주므로 따로 안 읽힌다.
    <Animated.View style={[styles.fill, fadeStyle]} accessibilityViewIsModal>
      {/* 아무 데나 누르면 건너뛴다 = 매일 쓰는 분을 붙잡지 않는다(사장님 확정) */}
      <Pressable
        style={styles.fill}
        onPress={finish}
        accessibilityRole="button"
        accessibilityLabel={`Tripis. ${TAGLINE}`}
        accessibilityHint="두 번 두드리면 건너뜁니다"
      >
        <View style={styles.center}>
          <Image
            source={require("../../assets/images/tripis-mark.png")}
            style={[styles.mark, { width: size.mark, height: size.mark }]}
            resizeMode="contain"
            accessible={false}
          />
          <Text
            style={[
              styles.brand,
              {
                fontSize: size.brand,
                lineHeight: Math.round(size.brand * 1.16),
              },
            ]}
          >
            Tripis
          </Text>
          {/* 낱말을 따로 그리므로 읽어주는 기능에는 위 버튼 이름 한 줄로만 들리게 한다(중복 낭독 방지).
              감추는 속성이 폰마다 달라 **둘 다** 준다 = accessibilityElementsHidden(아이폰) · no-hide-descendants(안드로이드). */}
          <View
            style={styles.sloganBox}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            {TAGLINE_LINES.map((words, li) => (
              <View key={li} style={styles.sloganRow}>
                {words.map((w, wi) => (
                  <Word
                    key={`${li}-${wi}`}
                    text={w}
                    order={order++}
                    size={size.tagline}
                  />
                ))}
              </View>
            ))}
          </View>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFillObject, backgroundColor: BG },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 28,
  },
  // 크기는 화면에서 계산해 넣는다(useIntroSize) = 여기엔 자리만 잡는다.
  mark: { marginBottom: 10 },
  // ⚠️ 수정금지(승인필요) 2026-08-09 사장님 지시 = **글자 로고는 앱 전체와 한 벌.**
  //   여정 플래너 배너(ShinyPillBanner.logoText)·로그인 팝업(styles.loginBrandTitle)이 쓰는 값 그대로 —
  //   색 Brand.primary(#4285F4 = 제미니 블루) / 굵기 900 / 자간 -0.8.
  //   옛 값(검정 #1A1A1A · 자간 +0.5) 폐기 = 2026-08-09 §19 = 눈대중이라 다른 두 곳과 어긋났다.
  brand: {
    fontFamily: Fonts.bold,
    fontWeight: "900",
    color: Brand.primary,
    letterSpacing: -0.8,
    marginBottom: 6,
  },
  sloganBox: { alignItems: "center" },
  // 낱말을 따로 그리므로 줄은 가로로 세운다(= 자동 줄바꿈 대신 문구가 정한 줄바꿈).
  sloganRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
  },
  // 색 = Brand.secondary(#1A73E8) = 로고와 **같은 파랑 계열의 진한 쪽**(§16 = 새 색 안 만듦).
  //   작은 글씨라 진한 쪽이 또렷하다. 옛 회색(#5B5B5B) 폐기 = 2026-08-09 §19(톤이 따로 놀았음).
  slogan: {
    fontFamily: Fonts.semiBold,
    color: Brand.secondary,
    letterSpacing: -0.2,
    textAlign: "center",
  },
});
