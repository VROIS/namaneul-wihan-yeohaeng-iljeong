// ⚠️ 수정금지(승인필요): 5개 버튼 Footer — 기존 WebView index.html:1009-1043 100% 클론
// 터치: scale(0.95) 0.1s ease (기존 .interactive-btn:active)
// 비활성화: opacity 0.5 (기존 .interactive-btn:disabled)
// 아이콘: Heroicons SVG (기존 앱과 동일 path)
// i18n: 다국어 라벨 (Google Translate 미적용 → 자체 번역)
import React, { useRef } from 'react';
import { View, Pressable, Text, StyleSheet, Platform, Animated } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { CONFIG } from '../config/constants';
import { useStore } from '../state/store';
import { t } from '../i18n/translations';

// ⚠️ 수정금지(승인필요): 기존 index.html에서 추출한 Heroicons SVG path — 그대로 복붙
const ICONS = {
  // 촬영 — index.html:1012-1014
  capture: [
    'M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z',
    'M15 13a3 3 0 11-6 0 3 3 0 016 0z',
  ],
  // 업로드 — index.html:1029-1030
  upload: [
    'M2.25 15.75l5.159-5.159a2.25 2.25 0 013.182 0l5.159 5.159m-1.5-1.5l1.409-1.409a2.25 2.25 0 013.182 0l2.909 2.909m-18 3.75h16.5a1.5 1.5 0 001.5-1.5V6a1.5 1.5 0 00-1.5-1.5H3.75A1.5 1.5 0 002.25 6v12a1.5 1.5 0 001.5 1.5zm10.5-11.25h.008v.008h-.008V8.25zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z',
  ],
  // 보관함 — index.html:1037-1038
  archive: [
    'M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z',
  ],
  // 라이브 ★신규 — Heroicons signal
  live: [
    'M9.348 14.652a3.75 3.75 0 010-5.304m5.304 0a3.75 3.75 0 010 5.304m-7.425 2.121a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.808-3.808-9.98 0-13.788m13.788 0c3.808 3.808 3.808 9.98 0 13.788M12 12h.008v.008H12V12zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z',
  ],
  // 여행비서 ★신규 — Heroicons globe-alt
  assistant: [
    'M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 017.843 4.582M12 3a8.997 8.997 0 00-7.843 4.582m15.686 0A11.953 11.953 0 0112 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0121 12c0 .778-.099 1.533-.284 2.253m0 0A17.919 17.919 0 0112 16.5c-3.162 0-6.133-.815-8.716-2.247m0 0A9.015 9.015 0 013 12c0-1.605.42-3.113 1.157-4.418',
  ],
};

// ⚠️ 수정금지(승인필요): SVG 아이콘 — Heroicons outline (stroke, no fill)
function HeroIcon({ name, size = 28, color = CONFIG.GEMINI_BLUE }) {
  const paths = ICONS[name];
  if (!paths) return null;
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      {paths.map((d, i) => (
        <Path key={i} d={d} stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </Svg>
  );
}

// ⚠️ 수정금지(승인필요): 개별 버튼 — scale(0.95) 터치 애니메이션 (기존 .interactive-btn:active 클론)
function AnimatedButton({ id, isActive, isDisabled, onPress }) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.timing(scaleAnim, {
      toValue: 0.95, // 기존: transform: scale(0.95)
      duration: 100,  // 기존: transition: transform 0.1s ease
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.timing(scaleAnim, {
      toValue: 1,
      duration: 100,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
      <Pressable
        style={[
          styles.button,
          isActive && styles.buttonActive,
          isDisabled && styles.buttonDisabled, // 기존: opacity 0.5
        ]}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={isDisabled}
      >
        <HeroIcon name={id} color={isActive ? '#fff' : CONFIG.GEMINI_BLUE} />
      </Pressable>
    </Animated.View>
  );
}

// ⚠️ 수정금지(승인필요): Footer 컴포넌트 — 기존 .footer-safe-area CSS 100% 클론
export default function FooterButtons({ onPress, isProcessing }) {
  const liveMode = useStore((s) => s.liveMode);
  const activeFeature = useStore((s) => s.activeFeature);
  const lang = useStore((s) => s.language) || 'ko';

  return (
    <View style={styles.footer}>
      {CONFIG.BUTTONS.map(({ id }) => {
        const isActive = (id === 'live' && liveMode !== 'off') || activeFeature === id;
        const isDisabled = isProcessing && (id === 'capture' || id === 'upload');

        return (
          <View key={id} style={styles.buttonContainer}>
            <AnimatedButton
              id={id}
              isActive={isActive}
              isDisabled={isDisabled}
              onPress={() => onPress(id)}
            />
            {/* ⚠️ 수정금지(승인필요): i18n 라벨 — 다국어 텍스트 길이 대응 */}
            <Text style={styles.buttonLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
              {t(id, lang)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

// ⚠️ 수정금지(승인필요): 기존 CSS 완벽 클론
// .footer-safe-area: height 100px, flex space-around, padding 0 1rem
// 버튼: w-14 h-14 (56px), rounded-full, bg-black/60
// 라벨: text-xs (12px), text-white, font-medium, drop-shadow-md
// margin-bottom: env(safe-area-inset-bottom, 0px) → paddingBottom으로 대응
const styles = StyleSheet.create({
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 100, // 기존: height: 100px
    flexDirection: 'row',
    justifyContent: 'space-around', // 기존: justify-content: space-around
    alignItems: 'center',
    paddingHorizontal: 16, // 기존: padding: 0 1rem
    paddingBottom: Platform.OS === 'ios' ? 20 : 0, // 기존: margin-bottom: env(safe-area-inset-bottom)
  },
  buttonContainer: {
    alignItems: 'center',
    gap: 4, // 기존: gap-1 (0.25rem = 4px)
    minWidth: 48, // i18n 라벨 공간 확보
  },
  button: {
    width: 56, // 기존: w-14 (56px)
    height: 56, // 기존: h-14 (56px)
    borderRadius: 28, // 기존: rounded-full
    backgroundColor: 'rgba(0,0,0,0.6)', // 기존: bg-black/60
    alignItems: 'center',
    justifyContent: 'center',
    // 기존: shadow-2xl
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 25 },
    shadowOpacity: 0.25,
    shadowRadius: 50,
    elevation: 25,
  },
  buttonActive: {
    backgroundColor: CONFIG.GEMINI_BLUE, // 활성 상태: 파란색
  },
  buttonDisabled: {
    opacity: 0.5, // 기존: .interactive-btn:disabled { opacity: 0.5 }
  },
  buttonLabel: {
    fontSize: 12, // 기존: text-xs (12px)
    color: '#fff', // 기존: text-white
    fontWeight: '500', // 기존: font-medium
    textShadowColor: 'rgba(0,0,0,0.5)', // 기존: drop-shadow-md
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
    textAlign: 'center', // i18n 라벨 중앙 정렬
  },
});
