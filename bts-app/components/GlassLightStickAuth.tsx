import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TextInput, Pressable, Dimensions, Keyboard } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming, Easing, runOnJS } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import * as Haptics from 'expo-haptics';

const { width, height } = Dimensions.get('window');
const OUTLINE_COLOR = 'rgba(255,255,255,0.06)'; // Apple HIG 가이드의 얇은 유리틀

export default function GlassLightStickAuth({ onLoginComplete }: { onLoginComplete: () => void }) {
  // 인증창 단계: 0(초기 30% 밝기) -> 0.5(생년월일 완료, 50% 밝기) -> 1.0(로그인 클릭, 전체 100% 밝기)
  const progress = useSharedValue(0); 
  const panelY = useSharedValue(height);
  const scale = useSharedValue(1);
  const authOpacity = useSharedValue(1);

  const [dob, setDob] = useState('');

  // 1단계: 암전 상태에서 아미봉 패널이 스르륵 밀려 올라옴
  useEffect(() => {
    panelY.value = withSpring(0, { damping: 16, stiffness: 90 });
  }, []);

  const handleDobChange = (text: string) => {
    // DD/MM/YYYY 포맷 변환 로직
    let cleaned = text.replace(/[^0-9]/g, '');
    let formatted = '';
    if (cleaned.length > 0) formatted += cleaned.substring(0, 2);
    if (cleaned.length > 2) formatted += '/' + cleaned.substring(2, 4);
    if (cleaned.length > 4) formatted += '/' + cleaned.substring(4, 8);
    
    setDob(formatted);

    // 2단계: 생년월일(10자리) 완벽히 타이핑되면 50% 밝기로 예열 및 약한 Haptic 피드백 추가
    if (formatted.length === 10 && progress.value < 0.5) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      progress.value = withSpring(0.5, { damping: 12 });
    } else if (formatted.length < 10 && progress.value >= 0.5) {
      progress.value = withSpring(0, { damping: 12 });
    }
  };

  const handleLogin = (provider: string) => {
    if (dob.length !== 10) {
      alert('생년월일을 DD/MM/YYYY 형식으로 모두 입력해주세요.');
      return;
    }
    Keyboard.dismiss();
    
    // 3단계: 소셜 로긴 누를 시 100% 점등, 터지는 듯한 느낌과 함께 화이트아웃
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    progress.value = withTiming(1.0, { duration: 450, easing: Easing.out(Easing.exp) });
    
    // 4단계: 짧게 발광 후, 부드럽게 기존 SelectScreen 맵 및 홈으로 포커스 넘김 
    setTimeout(() => {
      scale.value = withSpring(1.5, { damping: 14 });
      authOpacity.value = withTiming(0, { duration: 400 }, (finished) => {
        if (finished) {
          runOnJS(onLoginComplete)();
        }
      });
    }, 700);
  };

  const animatedBackdrop = useAnimatedStyle(() => {
    // 배경: progress에 따라 코발트 블루 -> 화이트아웃으로 변경
    // A안과 동일한 색상 사용: #0B1026 (코발트 딥)
    const brightness = progress.value;
    return {
      backgroundColor: progress.value === 1.0 ? '#FFFFFF' : '#0B1026',  // 코발트 블루 배경
      opacity: authOpacity.value,
    };
  });

  const animatedStick = useAnimatedStyle(() => {
    // 아미봉의 글로우(Glow) 효과를 그리기 위한 쉐도우 컨트롤
    const shadowRad = 15 + (progress.value * 80);
    const shadowOp = 0.1 + (progress.value * 0.9);
    
    return {
      transform: [{ translateY: panelY.value }, { scale: scale.value }],
      shadowColor: '#FFFFFF',
      shadowOffset: { width: 0, height: 0 },
      shadowOpacity: shadowOp,
      shadowRadius: shadowRad,
    };
  });

  return (
    <Animated.View style={[styles.container, animatedBackdrop]}>
      {/* 아미봉 실루엣 본체 래퍼 */}
      <Animated.View style={[styles.stickWrapper, animatedStick]}>
        
        {/* 아미봉 상단 헤드 (둥근 구형) */}
        <BlurView intensity={20 + progress.value * 80} tint={progress.value === 1.0 ? 'light' : 'dark'} style={styles.bombHead}>
          <Text style={styles.title}>ARMY BOMB</Text>
          <Text style={styles.subtitle}>BTS 아리랑 월드투어 2026</Text>
          
          <View style={styles.inputSection}>
            <Text style={[styles.label, progress.value >= 0.5 && { color: '#FFF' }]}>생년월일 (1단계: 예열 스위치)</Text>
            <TextInput
              style={[styles.input, progress.value >= 0.5 && { borderColor: 'rgba(255,255,255,0.5)', backgroundColor: 'rgba(255,255,255,0.15)' }]}
              placeholder="DD/MM/YYYY"
              placeholderTextColor="rgba(255,255,255,0.3)"
              keyboardType="number-pad"
              maxLength={10}
              value={dob}
              onChangeText={handleDobChange}
            />
          </View>
        </BlurView>

        {/* 아미봉 하단 손잡이 (기둥) - progress 0.5부터 켜짐 효과 강화 */}
        <BlurView intensity={20 + progress.value * 80} tint={progress.value >= 0.5 ? 'default' : 'dark'} style={styles.bombHandle}>
          <Text style={[styles.label, { marginBottom: 15 }, progress.value >= 0.5 && { color: '#FFF' }]}>2단계: 메인 스위치 점등</Text>
          
          <Pressable style={({pressed}) => [styles.socialBtn, pressed && styles.pressedBtn]} onPress={() => handleLogin('Google')}>
            <Text style={styles.socialText}>Google 시작</Text>
          </Pressable>
          <Pressable style={({pressed}) => [styles.socialBtn, pressed && styles.pressedBtn]} onPress={() => handleLogin('Kakao')}>
            <Text style={styles.socialText}>Kakao 시작</Text>
          </Pressable>
          <Pressable style={({pressed}) => [styles.socialBtn, pressed && styles.pressedBtn]} onPress={() => handleLogin('Apple')}>
            <Text style={styles.socialText}>Apple 시작</Text>
          </Pressable>
        </BlurView>

      </Animated.View>
    </Animated.View>
  );
}

const HEAD_SIZE = width * 0.85;

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 999, // 가장 위에 오버레이
  },
  stickWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 40,
  },
  bombHead: {
    width: HEAD_SIZE,
    height: HEAD_SIZE,
    borderRadius: HEAD_SIZE / 2,
    borderWidth: 1,
    borderColor: OUTLINE_COLOR,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    zIndex: 2,
  },
  bombHandle: {
    width: HEAD_SIZE * 0.45,
    height: 280,
    borderBottomLeftRadius: 40,
    borderBottomRightRadius: 40,
    borderWidth: 1,
    borderColor: OUTLINE_COLOR,
    borderTopWidth: 0,
    marginTop: -30, // 헤드 밑에 스며들도록
    overflow: 'hidden',
    alignItems: 'center',
    paddingTop: 50,
    zIndex: 1,
  },
  title: {
    color: '#FFF',
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 6,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 35,
  },
  inputSection: {
    width: '100%',
    alignItems: 'center',
  },
  label: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 12,
    fontWeight: '700',
    marginBottom: 10,
    letterSpacing: -0.2,
  },
  input: {
    width: '80%',
    height: 54,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 27,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 3,
  },
  socialBtn: {
    width: '85%',
    height: 50,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  pressedBtn: {
    opacity: 0.6,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  socialText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: -0.3,
  }
});
