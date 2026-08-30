// ⚠️ 수정금지(승인필요) 2026-08-16 사장님 승인 = 여정 생성 로딩화면 "숨은 기능 소개" 캐러셀.
//   ⚠️ 연출 컨셉(사장님 확정 2026-08-16) = "카드 = 작은 모바일 폰"처럼 보이게:
//     하단 탭바(55+insets.bottom)와 안 겹친다(사장님 지적 2026-08-16, 320×720 실측 확인).
import React, { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, AccessibilityInfo } from "react-native";
// ⚠️ 수정금지(승인필요) 2026-08-16 사장님 승인 = 카드 3D(입체) 효과 = 대각선 그라데이션.
import { LinearGradient } from "expo-linear-gradient";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedScrollHandler,
  withTiming,
  Easing,
  runOnJS,
} from "react-native-reanimated";
import { useTranslation } from "react-i18next";
import Icon from "@/components/Icon";
import { Colors, Spacing, BorderRadius, Fonts } from "@/constants/theme";

const SLIDE_DURATION_MS = 5000; // 사장님 확정(2026-08-16) = 5초 자동전환, 터치 시 정지
const IDEAL_CARD_W = 290;
const IDEAL_CARD_H = Math.round((IDEAL_CARD_W * 16) / 9); // 9:16 = 516
const MINI_TABBAR_H = 52; // 실제 앱 탭바(55px)를 축소 재현한 높이
const TYPE_CHAR_MS = 26; // 타자기 = 1글자당 지연(본문 40~90자 기준 1~2.3초에 완료)

type Theme = (typeof Colors)["light"];

// 순서(사장님 확정 2026-08-16) = TRIPIS → 오디오가이드 → AI의견상담 → 전문가검증 → 일별영상생성 → 곧만나요
const SLIDES = [
  {
    icon: "camera",
    navLabelKey: "tab.guide", // = "Tripis"(전 언어 공통, 브랜드명 무번역)
    gradient: ["#F59E0B", "#EC4899"] as const,
    titleKey: "loadingCarousel.slide1Title",
    bodyKey: "loadingCarousel.slide1Body",
  },
  {
    icon: "book-open",
    navLabelKey: "loadingCarousel.navGuide",
    gradient: ["#06B6D4", "#3B82F6"] as const, // BADGE_COLORS.guide
    titleKey: "loadingCarousel.slide2Title",
    bodyKey: "loadingCarousel.slide2Body",
  },
  {
    icon: "bot",
    navLabelKey: "tab.aiOpinion",
    gradient: ["#4285F4", "#1A73E8"] as const,
    titleKey: "loadingCarousel.slide3Title",
    bodyKey: "loadingCarousel.slide3Body",
  },
  {
    icon: "brain",
    navLabelKey: "tab.expert",
    gradient: ["#10B981", "#06B6D4"] as const,
    titleKey: "loadingCarousel.slide4Title",
    bodyKey: "loadingCarousel.slide4Body",
  },
  {
    icon: "film",
    navLabelKey: "loadingCarousel.navVideo",
    gradient: ["#4F46E5", "#7C3AED"] as const, // BADGE_COLORS.video
    titleKey: "loadingCarousel.slide5Title",
    bodyKey: "loadingCarousel.slide5Body",
  },
  {
    icon: "share-2",
    navLabelKey: "common.share",
    gradient: ["#EC4899", "#8B5CF6"] as const, // BADGE_COLORS.course
    titleKey: "loadingCarousel.slide6Title",
    bodyKey: "loadingCarousel.slide6Body",
  },
] as const;

// ⚠️ 타자기 애니메이션 = "화면(색상 영역)에 사람이 입력하는 것처럼" 본문을 한 글자씩 노출(사장님 지시 2026-08-16).
function SlideScreen({
  icon,
  title,
  body,
  active,
}: {
  icon: string;
  title: string;
  body: string;
  active: boolean;
}) {
  const [shown, setShown] = useState("");

  useEffect(() => {
    if (!active) {
      setShown("");
      return;
    }
    let i = 0;
    setShown("");
    const timer = setInterval(() => {
      i += 1;
      setShown(body.slice(0, i));
      if (i >= body.length) clearInterval(timer);
    }, TYPE_CHAR_MS);
    return () => clearInterval(timer);
  }, [active, body]);

  return (
    <View style={styles.screenArea}>
      <View style={styles.iconRing}>
        <Icon name={icon} size={26} color="#fff" />
      </View>
      <Text style={styles.slideTitle}>{title}</Text>
      <Text style={styles.slideBody}>{shown}</Text>
    </View>
  );
}

// ⚠️ 미니 탭바 = 실제 앱 하단 5단탭을 흉내낸 6단(카드 순서 그대로) = 기존 점 인디케이터 대체(사장님 지시 2026-08-16).
function MiniTabBar({ activeIndex }: { activeIndex: number }) {
  const { t } = useTranslation();
  return (
    <View style={styles.miniTabBar}>
      {SLIDES.map((slide, i) => {
        const isActive = i === activeIndex;
        return (
          <View key={i} style={styles.miniTabItem}>
            <View
              style={[
                styles.miniTabIconWrap,
                isActive && styles.miniTabIconWrapActive,
              ]}
            >
              <Icon
                name={slide.icon}
                size={isActive ? 15 : 12}
                color={isActive ? "#fff" : "rgba(255,255,255,0.55)"}
              />
            </View>
            <Text
              style={[
                styles.miniTabLabel,
                isActive && styles.miniTabLabelActive,
              ]}
              numberOfLines={1}
            >
              {t(slide.navLabelKey)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

export default function LoadingCarousel({ theme }: { theme: Theme }) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const [box, setBox] = useState<{ w: number; h: number } | null>(null);
  const scrollRef = useRef<Animated.ScrollView>(null);
  const entrance = useSharedValue(0);

  const { cardW, cardH } = useMemo(() => {
    if (!box) return { cardW: IDEAL_CARD_W, cardH: IDEAL_CARD_H };
    let h = Math.floor(box.h * 0.98);
    let w = Math.round((h * 9) / 16);
    if (w > box.w) {
      w = Math.floor(box.w * 0.98);
      h = Math.round((w * 16) / 9);
    }
    return { cardW: Math.max(w, 160), cardH: Math.max(h, 284) };
  }, [box]);

  // ⚠️ 수정금지(승인필요) 2026-08-16 사장님 실측 발견 = 리사이즈로 cardW가 바뀌었는데 스크롤 위치는
  useEffect(() => {
    if (!box) return;
    scrollRef.current?.scrollTo({ x: index * cardW, animated: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cardW, box]);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => {
      if (mounted) setReduceMotion(v);
    });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    entrance.value = withTiming(1, {
      duration: reduceMotion ? 0 : 420,
      easing: Easing.out(Easing.cubic),
    });
  }, [reduceMotion, entrance]);

  useEffect(() => {
    if (paused || reduceMotion) return;
    if (index >= SLIDES.length - 1) return;
    const timer = setTimeout(() => {
      const next = index + 1;
      setIndex(next);
      scrollRef.current?.scrollTo({ x: next * cardW, animated: true });
    }, SLIDE_DURATION_MS);
    return () => clearTimeout(timer);
  }, [index, paused, reduceMotion, cardW]);

  const scrollHandler = useAnimatedScrollHandler({
    onMomentumEnd: (event) => {
      const newIndex = Math.round(event.contentOffset.x / cardW);
      runOnJS(setIndex)(newIndex);
    },
  });

  const containerStyle = useAnimatedStyle(() => ({
    opacity: entrance.value,
    transform: [{ translateY: (1 - entrance.value) * 16 }],
  }));

  return (
    <Animated.View
      style={[styles.container, containerStyle]}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setBox({ w: width, h: height });
      }}
    >
      {/* ⚠️ 수정금지(승인필요) 2026-08-16 사장님 승인 = 카드 1장만(peek 완전 제거) 최대한 크게.
          ⚠️ box(실측)가 잡히기 전엔 스크롤뷰 자체를 마운트하지 않는다(§근본원인 수정) = 추정 크기(290)로
          먼저 마운트했다가 실측 후 cardW가 바뀌면서 스크롤 콘텐츠 폭이 리사이즈되면 RN-Web이 스퓨리어스
          momentum-scroll-end 이벤트를 내보내 index가 제멋대로 건너뛰는 버그(2026-08-16 실측 발견,
          5초 자동전환 타이머가 아니라 이 리사이즈 이벤트가 원인). 실측 전엔 빈 자리만 차지하고, 실측 후
          최종 cardW로 단 한 번만 마운트하면 리사이즈 자체가 발생하지 않아 원인이 사라진다. */}
      {box && (
        <View style={[styles.scrollClip, { width: cardW, height: cardH }]}>
          <Animated.ScrollView
            ref={scrollRef}
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            onScroll={scrollHandler}
            onScrollBeginDrag={() => setPaused(true)}
            scrollEventThrottle={16}
            snapToInterval={cardW}
            decelerationRate="fast"
          >
            {SLIDES.map((slide, i) => (
              <LinearGradient
                key={i}
                colors={slide.gradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.card, { width: cardW, height: cardH }]}
                accessible
                accessibilityLabel={`${t(slide.titleKey)}. ${t(slide.bodyKey)}`}
              >
                <SlideScreen
                  icon={slide.icon}
                  title={t(slide.titleKey)}
                  body={t(slide.bodyKey)}
                  active={i === index}
                />
                <MiniTabBar activeIndex={index} />
              </LinearGradient>
            ))}
          </Animated.ScrollView>
        </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  scrollClip: {
    alignSelf: "center",
    overflow: "hidden",
  },
  card: {
    borderRadius: BorderRadius.xl,
    overflow: "hidden",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.4)",
  },
  screenArea: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: Spacing.xl,
  },
  iconRing: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: "rgba(0,0,0,0.35)",
    borderWidth: 1.5,
    borderColor: "rgba(255,255,255,0.8)",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.lg,
  },
  slideTitle: {
    fontSize: 18,
    fontFamily: Fonts.bold,
    color: "#fff",
    marginBottom: Spacing.sm,
    textAlign: "center",
  },
  slideBody: {
    fontSize: 13,
    fontFamily: Fonts.sans,
    color: "rgba(255,255,255,0.9)",
    lineHeight: 19,
    textAlign: "center",
  },
  miniTabBar: {
    height: MINI_TABBAR_H,
    flexDirection: "row",
    backgroundColor: "rgba(15, 23, 42, 0.82)",
    borderTopWidth: 1,
    borderTopColor: "rgba(255,255,255,0.12)",
  },
  miniTabItem: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
  },
  miniTabIconWrap: {
    width: 22,
    height: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  miniTabIconWrapActive: {
    transform: [{ scale: 1.3 }],
  },
  miniTabLabel: {
    fontSize: 8,
    fontFamily: Fonts.medium,
    color: "rgba(255,255,255,0.5)",
  },
  miniTabLabelActive: {
    color: "#fff",
    fontFamily: Fonts.bold,
  },
});
