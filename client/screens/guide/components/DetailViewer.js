// ⚠️ 수정금지(승인필요): 2026-04-03 네이티브 DetailViewer — TTS 자동재생 해결
// WebView autoplay 정책 우회: expo-speech 직접 호출 (네이티브 모듈 → 제한 없음)
// 웹 버전과 동일한 UI: 전체화면 이미지 + 텍스트 오버레이 + 문장 하이라이트 + TTS
// ⚠️ 2026-07-20 사장님 SSOT = 웹 원본(index.html 상세페이지) 기준 교정:
//   리턴버튼 우측상단(웹 backBtn right-4) · 텍스트 상단부터(content-safe-area) ·
//   로딩 = 이미지 유지 + 스피너 + 문구(웹 loader-container) · 하단버튼 = 반투명 검정 원(bg-black/60) ·
//   문장 스트리밍 수신(sentences 배열) + 스트림 완료(done) 후 자동 낭독(웹 speakNext 시점).
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, Image, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Dimensions, Animated, Platform,
} from 'react-native';
import * as Speech from 'expo-speech';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// ⚠️ 수정금지(승인필요): i18n 7개 언어 사전 주입
const I18N = {
  ko: { play: '오디오 재생', pause: '일시정지', save: '보관함에 저장', saved: '저장되었습니다', textToggle: '해설 읽기', askAgain: '다시 질문하기', loading: '로딩 중...', back: '뒤로' },
  en: { play: 'Play Audio', pause: 'Pause', save: 'Save to Archive', saved: 'Saved!', textToggle: 'Read Text', askAgain: 'Ask Again', loading: 'Loading...', back: 'Back' },
  ja: { play: '音声再生', pause: '一時停止', save: '保管庫に保存', saved: '保存しました', textToggle: 'テキスト', askAgain: 'もう一度', loading: '読み込み中...', back: '戻る' },
  'zh-CN': { play: '播放', pause: '暂停', save: '保存', saved: '已保存', textToggle: '文字', askAgain: '重新提问', loading: '加载中...', back: '返回' },
  fr: { play: 'Lire', pause: 'Pause', save: 'Sauvegarder', saved: 'Sauvegardé!', textToggle: 'Texte', askAgain: 'Reposer', loading: 'Chargement...', back: 'Retour' },
  de: { play: 'Abspielen', pause: 'Pause', save: 'Speichern', saved: 'Gespeichert!', textToggle: 'Text', askAgain: 'Erneut', loading: 'Laden...', back: 'Zurück' },
  es: { play: 'Reproducir', pause: 'Pausar', save: 'Guardar', saved: '¡Guardado!', textToggle: 'Texto', askAgain: 'Preguntar', loading: 'Cargando...', back: 'Atrás' },
};

// ⚠️ 수정금지(승인필요): iOS 음성 우선순위
const IOS_VOICE_MAP = {
  'ko': 'com.apple.ttsbundle.Yuna-compact',
  'en': 'com.apple.ttsbundle.Samantha-compact',
  'ja': 'com.apple.ttsbundle.Kyoko-compact',
  'zh-CN': 'com.apple.ttsbundle.Ting-Ting-compact',
  'fr': 'com.apple.ttsbundle.Thomas-compact',
  'de': 'com.apple.ttsbundle.Anna-compact',
  'es': 'com.apple.ttsbundle.Monica-compact',
};

// 문장 분리 = 호출자(GuideResultHost)가 원본 index.js processImage 방식으로 수행 = 2026-07-20 §19.

export default function DetailViewer({
  imageUri, sentences = [], loading = false, loadingText = '', done = false,
  locationName, voiceQuery, mode = 'camera',
  lang = 'ko', onClose, onSave, onAskAgain,
}) {
  const t = I18N[lang] || I18N.ko;
  const insets = useSafeAreaInsets();
  const scrollRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentSentence, setCurrentSentence] = useState(-1);
  const [textVisible, setTextVisible] = useState(true);
  const [saved, setSaved] = useState(false);
  const textOpacity = useRef(new Animated.Value(1)).current;
  const sentencesRef = useRef([]);
  const currentIdxRef = useRef(-1);

  const isVoiceMode = mode === 'voice';
  sentencesRef.current = sentences;

  // ⚠️ 수정금지(승인필요): 문장별 순차 TTS 재생 + 하이라이트
  const speakSentence = useCallback((index) => {
    if (index >= sentencesRef.current.length) {
      setIsPlaying(false);
      setCurrentSentence(-1);
      currentIdxRef.current = -1;
      return;
    }
    currentIdxRef.current = index;
    setCurrentSentence(index);

    const voice = Platform.OS === 'ios' ? IOS_VOICE_MAP[lang] : undefined;
    Speech.speak(sentencesRef.current[index], {
      language: lang === 'zh-CN' ? 'zh-CN' : lang,
      voice,
      rate: Platform.OS === 'ios' ? 0.5 : 0.9,
      pitch: 1.0,
      onDone: () => {
        if (currentIdxRef.current === index) speakSentence(index + 1);
      },
      onError: () => {
        setIsPlaying(false);
        setCurrentSentence(-1);
      },
    });
  }, [lang]);

  const playTTS = useCallback(() => {
    Speech.stop();
    setIsPlaying(true);
    speakSentence(0);
  }, [speakSentence]);

  const stopTTS = useCallback(() => {
    currentIdxRef.current = -1;
    Speech.stop();
    setIsPlaying(false);
    setCurrentSentence(-1);
  }, []);

  // ⚠️ 수정금지(승인필요): TTS 자동재생 — 웹 원본 = 스트림 완료 후 speakNext() 시점 그대로 + 500ms 딜레이
  //   (playTTS 선언 뒤에 위치 필수 = 앞서 두면 웹 프로덕션 번들 TDZ 크래시 = 2026-07-20 DevTools 실증)
  useEffect(() => {
    if (!done || !sentencesRef.current.length) return;
    const timer = setTimeout(() => playTTS(), 500);
    return () => { clearTimeout(timer); Speech.stop(); };
  }, [done, playTTS]);

  // ⚠️ 수정금지(승인필요): 오디오 토글
  const handleAudioToggle = useCallback(() => {
    if (isPlaying) stopTTS();
    else playTTS();
  }, [isPlaying, stopTTS, playTTS]);

  // ⚠️ 수정금지(승인필요): 텍스트 토글 (토글 시 TTS 정지)
  const handleTextToggle = useCallback(() => {
    if (isPlaying) stopTTS();
    const next = !textVisible;
    setTextVisible(next);
    Animated.timing(textOpacity, { toValue: next ? 1 : 0, duration: 200, useNativeDriver: true }).start();
  }, [textVisible, isPlaying, stopTTS, textOpacity]);

  // ⚠️ 수정금지(승인필요): 저장 버튼
  const handleSave = useCallback(() => {
    if (saved) return;
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSaved(true);
    onSave?.();
  }, [saved, onSave]);

  // ⚠️ 수정금지(승인필요): 리턴 (TTS 정지 + 닫기)
  const handleClose = useCallback(() => {
    stopTTS();
    onClose();
  }, [stopTTS, onClose]);

  return (
    <View style={styles.container}>
      {/* 배경: 이미지모드 또는 음성모드 */}
      {isVoiceMode ? (
        <View style={[styles.bg, { backgroundColor: '#FFFEFA' }]} />
      ) : (
        <Image source={{ uri: imageUri }} style={styles.bg} resizeMode="cover" />
      )}

      {/* ← 리턴 버튼 = 웹 원본 backBtn 그대로 (우측상단, 반투명 검정 원, 제미니블루) */}
      <TouchableOpacity style={[styles.backBtn, { top: insets.top + 16 }]} onPress={handleClose}>
        <Ionicons name="arrow-back" size={24} color="#4285F4" />
      </TouchableOpacity>

      {/* 위치명 / 음성질문 박스 (상호배타) */}
      {(locationName || voiceQuery) && (
        <View style={[styles.infoBox, { top: insets.top + 72 }]}>
          <Ionicons name={voiceQuery ? 'chatbubble' : 'location'} size={16} color="#4285F4" />
          <Text style={styles.infoText} numberOfLines={2}>{voiceQuery || locationName}</Text>
        </View>
      )}

      {/* 로딩 = 웹 원본 loader-container 그대로: 이미지 유지 + 중앙 스피너 + 로테이션 문구 */}
      {loading && (
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.loadingText}>{loadingText || t.loading}</Text>
        </View>
      )}

      {/* 텍스트 오버레이 = 웹 원본 content-safe-area 그대로: 상단부터 시작 + 문장별 하이라이트 */}
      {!loading && (
        <Animated.View
          style={[
            styles.textArea,
            { top: insets.top + ((locationName || voiceQuery) ? 124 : 72), opacity: textOpacity },
          ]}
        >
          <ScrollView ref={scrollRef} contentContainerStyle={styles.textContent} showsVerticalScrollIndicator={false}>
            {sentences.map((sentence, i) => (
              <Text
                key={i}
                style={[
                  isVoiceMode ? styles.sentenceDark : styles.sentence,
                  i === currentSentence && styles.sentenceHighlight,
                ]}
              >
                {sentence}{' '}
              </Text>
            ))}
          </ScrollView>
        </Animated.View>
      )}

      {/* ⚠️ 수정금지(승인필요): 하단 footer = 웹 원본 detailFooter 그대로 — 로딩 중 숨김, 64px 반투명 검정 원 버튼 */}
      {!loading && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 8 }]}>
          {/* 재질문 (음성모드만) */}
          {isVoiceMode && onAskAgain && (
            <TouchableOpacity style={styles.footerBtn} onPress={() => { stopTTS(); onAskAgain(); }}>
              <Ionicons name="mic" size={28} color="#4285F4" />
            </TouchableOpacity>
          )}

          {/* 오디오 토글 */}
          <TouchableOpacity style={styles.footerBtn} onPress={handleAudioToggle}>
            <Ionicons name={isPlaying ? 'pause' : 'play'} size={28} color="#4285F4" />
          </TouchableOpacity>

          {/* 텍스트 토글 */}
          <TouchableOpacity style={styles.footerBtn} onPress={handleTextToggle}>
            <Ionicons name={textVisible ? 'document-text' : 'document-text-outline'} size={28} color="#4285F4" />
          </TouchableOpacity>

          {/* 저장 */}
          <TouchableOpacity style={styles.footerBtn} onPress={handleSave} disabled={saved}>
            <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={28} color={saved ? '#00C851' : '#4285F4'} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 200, backgroundColor: '#000' },
  bg: { position: 'absolute', top: 0, left: 0, width: SCREEN_W, height: SCREEN_H },
  // ⚠️ 2026-07-20 웹 원본(index.html) 기준: backBtn = 우측 48px 원(bg-black/60) / 텍스트 = 상단부터(text-content 2rem·1.5rem, text-xl, 행간 1.8) / footer 버튼 = 64px 반투명 검정 원.
  backBtn: {
    position: 'absolute', right: 16, width: 48, height: 48, borderRadius: 24,
    backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', zIndex: 10,
  },
  infoBox: {
    position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.9)', borderRadius: 8, padding: 8, gap: 8, zIndex: 10,
  },
  infoText: { color: '#1f2937', fontSize: 15, fontWeight: '600', flex: 1 },
  loaderWrap: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center', zIndex: 5,
  },
  loadingText: {
    color: '#fff', fontSize: 18, fontWeight: '600', marginTop: 16, textAlign: 'center',
    paddingHorizontal: 16,
    textShadowColor: 'rgba(0,0,0,0.95)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8,
  },
  textArea: { position: 'absolute', bottom: 108, left: 0, right: 0 },
  textContent: { paddingHorizontal: 24, paddingVertical: 32 },
  sentence: {
    color: '#fff', fontSize: 20, lineHeight: 36,
    textShadowColor: 'rgba(0,0,0,0.95)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8,
  },
  sentenceDark: { color: '#000', fontSize: 20, lineHeight: 36 },
  sentenceHighlight: { backgroundColor: 'rgba(66,133,244,0.3)', fontWeight: '600' },
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: 100,
    flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingHorizontal: 16,
  },
  footerBtn: {
    width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.6)',
    shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 24,
    elevation: 12,
  },
});
