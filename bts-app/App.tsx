import React, { useState, useEffect } from "react";
import GlassLightStickAuth from "./components/GlassLightStickAuth";
import {
  StyleSheet,
  View,
  Text,
  TouchableWithoutFeedback,
  Dimensions,
  SafeAreaView,
  ScrollView,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  Easing,
} from "react-native-reanimated";

const { width, height } = Dimensions.get("window");
const CENTER_X = width / 2 - 50;
const CENTER_Y = height / 2 - 120;

const MEMBERS = [
  { id: "1", name: "RM", color: "#BDE0FE", x: 40, y: height * 0.1 },
  { id: "2", name: "Jin", color: "#FFC8DD", x: width - 120, y: height * 0.18 },
  { id: "3", name: "Suga", color: "#A2D2FF", x: 60, y: height * 0.35 },
  {
    id: "4",
    name: "J-Hope",
    color: "#FFAFCC",
    x: width - 140,
    y: height * 0.45,
  },
  { id: "5", name: "Jimin", color: "#FFF3B0", x: 30, y: height * 0.58 },
  { id: "6", name: "V", color: "#CDB4DB", x: width - 110, y: height * 0.68 },
  { id: "7", name: "JK", color: "#90E0EF", x: width / 2 - 40, y: height * 0.8 },
];
const VIBE_CARDS = [
  "📸 핫플",
  "🌳 자연",
  "🎨 예술",
  "🍷 나이트",
  "🍰 디저트",
  "🛍️ 쇼핑",
  "🧘 휴식",
  "🏰 역사",
];

// --- SCREEN 1 & 2: Main Select & Expand --- //
const BubbleAvatar = ({ member, selectedId, onPress }) => {
  const isSelected = selectedId === member.id;
  const isHidden = selectedId !== null && selectedId !== member.id;

  const animatedStyle = useAnimatedStyle(() => {
    let tx = isSelected
      ? withSpring(CENTER_X, { damping: 12, stiffness: 90 })
      : isHidden
        ? withTiming(member.x)
        : withSpring(member.x, { damping: 15 });

    let ty = isSelected
      ? withSpring(CENTER_Y, { damping: 12, stiffness: 90 })
      : isHidden
        ? withTiming(height + 200, { duration: 400 })
        : withSpring(member.y, { damping: 15 });

    let scale = isSelected
      ? withSpring(1.3, { damping: 10 })
      : isHidden
        ? withTiming(0.5)
        : withSpring(1);

    return {
      transform: [{ translateX: tx }, { translateY: ty }, { scale }],
      opacity: isHidden ? withTiming(0, { duration: 300 }) : withTiming(1),
    };
  });

  return (
    <TouchableWithoutFeedback onPress={() => onPress(member.id)}>
      <Animated.View
        style={[
          styles.bubble,
          { backgroundColor: member.color },
          animatedStyle,
        ]}
      >
        <Text style={styles.bubbleText}>{member.name}</Text>
      </Animated.View>
    </TouchableWithoutFeedback>
  );
};

const VibeCardsArray = ({ isVisible, cart, onToggleCart }) => {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {VIBE_CARDS.map((cardLabel, index) => {
        const isSelected = cart.includes(cardLabel);
        const angle = (index / VIBE_CARDS.length) * (2 * Math.PI) - Math.PI / 2;
        const radius = 140;
        const targetX = CENTER_X + 15 + Math.cos(angle) * radius;
        const targetY = CENTER_Y + 30 + Math.sin(angle) * radius;

        const cardStyle = useAnimatedStyle(() => {
          return {
            transform: [
              {
                translateX: isVisible
                  ? withSpring(targetX, { damping: 14 })
                  : withTiming(CENTER_X + 15, { duration: 300 }),
              },
              {
                translateY: isVisible
                  ? withSpring(targetY, { damping: 14 })
                  : withTiming(CENTER_Y + 30, { duration: 300 }),
              },
              {
                scale: isVisible
                  ? isSelected
                    ? withSpring(1.15)
                    : withSpring(1)
                  : withTiming(0),
              },
            ],
            opacity: isVisible
              ? withTiming(1, { duration: 400 })
              : withTiming(0, { duration: 200 }),
            backgroundColor: isSelected
              ? withTiming("#8B5CF6")
              : withTiming("#FFF"),
          };
        });

        const textStyle = useAnimatedStyle(() => ({
          color: isSelected ? withTiming("#FFF") : withTiming("#444"),
          fontWeight: isSelected ? "900" : "700",
        }));

        return (
          <TouchableWithoutFeedback
            key={index}
            onPress={() => isVisible && onToggleCart(cardLabel)}
          >
            <Animated.View
              style={[
                styles.vibeCard,
                cardStyle,
                isSelected && {
                  borderColor: "#8B5CF6",
                  borderWidth: 2,
                  shadowOpacity: 0.5,
                },
              ]}
            >
              <Animated.Text style={[styles.cardText, textStyle]}>
                {isSelected ? "✅ " : ""}
                {cardLabel}
              </Animated.Text>
            </Animated.View>
          </TouchableWithoutFeedback>
        );
      })}
    </View>
  );
};

const EnergyGauge = ({ fillRatio, isVisible }) => {
  const barStyle = useAnimatedStyle(() => ({
    width: withSpring(`${fillRatio * 100}%`, { damping: 15 }),
  }));

  const containerStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: isVisible ? withSpring(0) : withTiming(50) }],
    opacity: isVisible ? withTiming(1) : withTiming(0),
  }));

  return (
    <Animated.View style={[styles.gaugeContainer, containerStyle]}>
      <Text style={styles.gaugeText}>아미밤 바이브 에너지 충전 💜</Text>
      <View style={styles.gaugeTrack}>
        <Animated.View style={[styles.gaugeFill, barStyle]} />
      </View>
    </Animated.View>
  );
};

const SelectScreen = ({
  onNavigate,
  selectedCharId,
  setSelectedCharId,
  cart,
  setCart,
}) => {
  const handleCharPress = (id) => {
    setSelectedCharId((prev) => (prev === id ? null : id));
    if (selectedCharId !== id) setCart([]); // 새 캐릭터 탭하면 무조건 카트 초기화
  };

  const handleToggleCart = (cardLabel) => {
    setCart((prev) =>
      prev.includes(cardLabel)
        ? prev.filter((c) => c !== cardLabel)
        : [...prev, cardLabel],
    );
  };

  const showGauge = selectedCharId !== null;
  const canGenerate = cart.length >= 2;

  const btnStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: canGenerate ? withSpring(0) : withTiming(200) }],
    opacity: canGenerate ? withTiming(1) : withTiming(0),
  }));

  return (
    <View style={styles.fullScreen}>
      <Text style={styles.headerTitle}>NUBI VIBE</Text>
      <Text style={styles.headerSub}>누구의 여정 바이브와 함께할까요?</Text>

      <VibeCardsArray
        isVisible={selectedCharId !== null}
        cart={cart}
        onToggleCart={handleToggleCart}
      />

      {MEMBERS.map((member) => (
        <BubbleAvatar
          key={member.id}
          member={member}
          selectedId={selectedCharId}
          onPress={handleCharPress}
        />
      ))}

      <EnergyGauge fillRatio={cart.length / 8} isVisible={showGauge} />

      <Animated.View style={[styles.bottomBtnContainer, btnStyle]}>
        <TouchableWithoutFeedback onPress={onNavigate}>
          <View style={styles.startBtn}>
            <Text style={styles.startBtnText}>
              ✨ {cart.length}개의 바이브로 1초 일정 생성
            </Text>
          </View>
        </TouchableWithoutFeedback>
      </Animated.View>
    </View>
  );
};

// --- SCREEN 3: Loading --- //
const LoadingScreen = ({ onFinish }) => {
  useEffect(() => {
    const timer = setTimeout(() => {
      onFinish();
    }, 2000);
    return () => clearTimeout(timer);
  }, [onFinish]);

  return (
    <View style={styles.centerScreen}>
      <View style={styles.loadingRing} />
      <Text style={styles.loadingTitle}>Gemini AI 최적화 중</Text>
      <Text style={styles.loadingSub}>
        담으신 바이브 조각들을 조합하고 있어요...
      </Text>
    </View>
  );
};

// --- SCREEN 4: Result Dashboard --- //
// 여기서 선택한 장바구니 데이터를 받아서 동기화합니다!
const DashboardScreen = ({ onReset, selectedVibes }) => {
  // 가짜 데이터를 바이브 카드에 맞춰 생성 (예술->미술관, 핫플->성지 등)
  const getDynamicContent = (vibe) => {
    if (vibe.includes("핫플"))
      return { time: "09:00 AM", title: "방탄 성지 투어 코스", tag: vibe };
    if (vibe.includes("자연"))
      return { time: "12:00 PM", title: "RM이 걷던 평창동 숲길", tag: vibe };
    if (vibe.includes("예술"))
      return {
        time: "14:00 PM",
        title: "영감이 떠오르는 비공개 갤러리",
        tag: vibe,
      };
    if (vibe.includes("나이트"))
      return {
        time: "19:00 PM",
        title: "제이홉 무드의 힙합 라운지",
        tag: vibe,
      };
    if (vibe.includes("디저트"))
      return {
        time: "11:00 AM",
        title: "지민픽 달콤 푹신 디저트 카페",
        tag: vibe,
      };
    if (vibe.includes("쇼핑"))
      return {
        time: "16:00 PM",
        title: "하이브 패션 스트릿 플렉스",
        tag: vibe,
      };
    if (vibe.includes("휴식"))
      return {
        time: "10:00 AM",
        title: "뷔가 사랑하는 재즈 멍때리기 룸",
        tag: vibe,
      };
    if (vibe.includes("역사"))
      return {
        time: "15:00 PM",
        title: "전통 고궁 미디어아트 야경",
        tag: vibe,
      };
    return { time: "18:00 PM", title: "방탄 테마 시크릿 장소", tag: vibe };
  };

  return (
    <ScrollView
      style={styles.fullScreen}
      contentContainerStyle={{ paddingBottom: 100 }}
    >
      <View style={styles.dashHeader}>
        <Text style={styles.headerTitle}>나만의 맞춤 방탄 투어</Text>
        <Text style={styles.headerSub}>총 3일 • 예상 예산: $450</Text>
      </View>

      <View style={styles.videoBox}>
        <Text style={styles.videoLabel}>🎬 8초 릴스 (생성 완료)</Text>
        <Text style={{ color: "#888", marginTop: 10 }}>
          AI가 [{selectedVibes.join(", ")}] 테마로 편집했어요!
        </Text>
        <View style={[styles.playBtn, { marginTop: 15 }]}>
          <Text style={styles.playIcon}>▶</Text>
        </View>
      </View>

      <Text style={styles.sectionTitle}>
        🗺️ 스마트 동선 타임라인 (고객 맞춤)
      </Text>

      {/* 🌟 선택한 바이브 카드 개수만큼 타임라인 슬롯 생성! 🌟 */}
      {selectedVibes.map((vibe, index) => {
        const spot = getDynamicContent(vibe);
        return (
          <View key={index} style={styles.timelineItem}>
            <View style={styles.dot} />
            <View style={styles.timelineContent}>
              <Text style={styles.timeText}>DAY 1 - {spot.time}</Text>
              <Text style={styles.placeTitle}>{spot.title}</Text>
              <Text style={styles.placeTags}>{spot.tag} 테마 동기화 완료</Text>
            </View>
          </View>
        );
      })}

      <View style={{ padding: 20, marginTop: 20 }}>
        <TouchableWithoutFeedback
          onPress={() => alert("영수증/예산표가 슬라이드 업 됩니다.")}
        >
          <View
            style={[
              styles.startBtn,
              { backgroundColor: "#333", marginBottom: 10 },
            ]}
          >
            <Text style={styles.startBtnText}>🧾 내 지갑 (상세 예산 보기)</Text>
          </View>
        </TouchableWithoutFeedback>

        <TouchableWithoutFeedback onPress={onReset}>
          <View style={[styles.startBtn, { backgroundColor: "#EEE" }]}>
            <Text style={[styles.startBtnText, { color: "#444" }]}>
              처음으로 돌아가기
            </Text>
          </View>
        </TouchableWithoutFeedback>
      </View>
    </ScrollView>
  );
};

// --- ROUTER (App) --- //
export default function App() {
  const [currentScreen, setCurrentScreen] = useState("Auth");
  const [selectedCharId, setSelectedCharId] = useState(null);

  // 최상단으로 끌어올린 장바구니(카트) 상태!
  const [cart, setCart] = useState([]);

  const goToLoading = () => setCurrentScreen("Loading");
  const goToDashboard = () => setCurrentScreen("Dashboard");
  const goToSelect = () => {
    setSelectedCharId(null);
    setCart([]);
    setCurrentScreen("Select");
  };

  return (
    <SafeAreaView style={styles.container}>
      {currentScreen === "Auth" && (
        <GlassLightStickAuth
          onLoginComplete={() => setCurrentScreen("Select")}
        />
      )}
      {currentScreen === "Select" && (
        <SelectScreen
          onNavigate={goToLoading}
          selectedCharId={selectedCharId}
          setSelectedCharId={setSelectedCharId}
          cart={cart}
          setCart={setCart}
        />
      )}
      {currentScreen === "Loading" && (
        <LoadingScreen onFinish={goToDashboard} />
      )}
      {currentScreen === "Dashboard" && (
        <DashboardScreen onReset={goToSelect} selectedVibes={cart} />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#FAFAFA" },
  fullScreen: { flex: 1, position: "relative" },
  centerScreen: { flex: 1, justifyContent: "center", alignItems: "center" },

  // Select Screen
  headerTitle: {
    fontSize: 26,
    fontWeight: "900",
    textAlign: "center",
    marginTop: 40,
    color: "#111",
    letterSpacing: -1,
  },
  headerSub: { fontSize: 15, textAlign: "center", color: "#888", marginTop: 5 },
  bubble: {
    position: "absolute",
    width: 100,
    height: 100,
    borderRadius: 50,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 15,
    elevation: 8,
    borderWidth: 2,
    borderColor: "rgba(255,255,255,0.7)",
    zIndex: 10,
  },
  bubbleText: { fontSize: 20, fontWeight: "800", color: "#222" },

  // Vibe Cards
  vibeCard: {
    position: "absolute",
    width: 75,
    height: 95,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#8B5CF6",
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 5,
    zIndex: 5,
  },
  cardText: { fontSize: 13 },

  // Energy Gauge (Cart)
  gaugeContainer: {
    position: "absolute",
    bottom: 120,
    width: "80%",
    alignSelf: "center",
    alignItems: "center",
  },
  gaugeText: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#888",
    marginBottom: 8,
  },
  gaugeTrack: {
    width: "100%",
    height: 12,
    backgroundColor: "#E0E7FF",
    borderRadius: 6,
    overflow: "hidden",
  },
  gaugeFill: { height: "100%", backgroundColor: "#8B5CF6", borderRadius: 6 },

  // Bottom Buttons
  bottomBtnContainer: {
    position: "absolute",
    bottom: 50,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  startBtn: {
    backgroundColor: "#8B5CF6",
    paddingVertical: 18,
    paddingHorizontal: 30,
    borderRadius: 30,
    shadowColor: "#8B5CF6",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 10,
    width: "90%",
    alignItems: "center",
  },
  startBtnText: { color: "#FFF", fontSize: 16, fontWeight: "bold" },

  // Loading Screen
  loadingRing: {
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 5,
    borderColor: "#EEE",
    borderTopColor: "#8B5CF6",
    marginBottom: 30,
  },
  loadingTitle: { fontSize: 22, fontWeight: "bold", color: "#333" },
  loadingSub: { fontSize: 14, color: "#888", marginTop: 10 },

  // Dashboard Screen
  dashHeader: { padding: 20, alignItems: "center" },
  videoBox: {
    width: "90%",
    height: 200,
    backgroundColor: "#E0E7FF",
    alignSelf: "center",
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#C7D2FE",
    marginBottom: 20,
  },
  videoLabel: {
    position: "absolute",
    top: 15,
    left: 15,
    fontWeight: "bold",
    color: "#4F46E5",
  },
  playBtn: {
    width: 60,
    height: 60,
    backgroundColor: "rgba(255,255,255,0.8)",
    borderRadius: 30,
    justifyContent: "center",
    alignItems: "center",
  },
  playIcon: { fontSize: 24, color: "#4F46E5", marginLeft: 4 },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "800",
    marginHorizontal: 20,
    marginTop: 10,
    marginBottom: 15,
    color: "#222",
  },
  timelineItem: {
    flexDirection: "row",
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  dot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: "#8B5CF6",
    marginTop: 5,
    marginRight: 15,
  },
  timelineContent: {
    flex: 1,
    backgroundColor: "#FFF",
    padding: 15,
    borderRadius: 15,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
    borderWidth: 1,
    borderColor: "#F0F0F0",
  },
  timeText: {
    fontSize: 12,
    fontWeight: "bold",
    color: "#8B5CF6",
    marginBottom: 5,
  },
  placeTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#333",
    marginBottom: 5,
  },
  placeTags: { fontSize: 13, color: "#888" },
});
