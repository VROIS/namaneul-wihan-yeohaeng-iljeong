// ⚠️ 수정금지(승인필요): 2026-04-03 네이티브 DetailViewer — TTS 자동재생 해결
// WebView autoplay 정책 우회: expo-speech 직접 호출 (네이티브 모듈 → 제한 없음)
// 웹 버전과 동일한 UI: 전체화면 이미지 + 텍스트 오버레이 + 문장 하이라이트 + TTS
import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  View, Text, Image, StyleSheet, ScrollView, TouchableOpacity,
  Dimensions, Animated, Platform,
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

// ⚠️ 수정금지(승인필요): 문장 분리 정규식
const SENTENCE_REGEX = /[^.!?。！？]+[.!?。！？]+/g;

export default function DetailViewer({
  imageUri, description, locationName, voiceQuery, mode = 'camera',
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
  // ⚠️ 수정금지(승인필요): useMemo로 문장 분리 캐시 (렌더마다 재계산 방지)
  const sentences = useMemo(() =>
    (description.match(SENTENCE_REGEX) || [description]).map(s => s.trim()).filter(Boolean),
    [description]
  );
  sentencesRef.current = sentences;

  // ⚠️ 수정금지(승인필요): TTS 자동재생 — DetailViewer 표시 후 500ms 딜레이
  useEffect(() => {
    if (!description) return;
    const timer = setTimeout(() => playTTS(), 500);
    return () => { clearTimeout(timer); Speech.stop(); };
  }, [description, playTTS]);

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

      {/* ← 리턴 버튼 (좌측 상단) */}
      <TouchableOpacity style={[styles.backBtn, { top: insets.top + 12 }]} onPress={handleClose}>
        <Ionicons name="arrow-back" size={24} color={isVoiceMode ? '#000' : '#fff'} />
      </TouchableOpacity>

      {/* 위치명 / 음성질문 박스 (상호배타) */}
      {(locationName || voiceQuery) && (
        <View style={[styles.infoBox, { top: insets.top + 60 }]}>
          <Ionicons name={voiceQuery ? 'chatbubble' : 'location'} size={16} color="#4285F4" />
          <Text style={styles.infoText} numberOfLines={2}>{voiceQuery || locationName}</Text>
        </View>
      )}

      {/* 텍스트 오버레이 (문장별 하이라이트) */}
      <Animated.View style={[styles.textArea, { opacity: textOpacity }]}>
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

      {/* ⚠️ 수정금지(승인필요): 하단 footer — 64px 버튼, transparent 배경 */}
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 200, backgroundColor: '#000' },
  bg: { position: 'absolute', top: 0, left: 0, width: SCREEN_W, height: SCREEN_H },
  backBtn: {
    position: 'absolute', left: 16, width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.4)', alignItems: 'center', justifyContent: 'center', zIndex: 10,
  },
  infoBox: {
    position: 'absolute', left: 16, right: 16, flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 8, padding: 8, gap: 8, zIndex: 10,
  },
  infoText: { color: '#fff', fontSize: 14, flex: 1 },
  textArea: { position: 'absolute', bottom: 108, left: 0, right: 0, maxHeight: SCREEN_H * 0.45 },
  textContent: { paddingHorizontal: 24, paddingVertical: 16 },
  sentence: {
    color: '#fff', fontSize: 18, lineHeight: 28,
    textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 1, height: 1 }, textShadowRadius: 4,
  },
  sentenceDark: { color: '#000', fontSize: 18, lineHeight: 28 },
  sentenceHighlight: { backgroundColor: 'rgba(66,133,244,0.3)', fontWeight: '600' },
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: 100,
    flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingHorizontal: 16,
  },
  footerBtn: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
});
