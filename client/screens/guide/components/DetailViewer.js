// ⚠️ 수정금지(승인필요): 네이티브 DetailViewer = 운영앱(내손안에 가이드) 상세페이지 완전 클론
// = 2026-07-20 사장님 SSOT: 운영앱(my-handyguide1) 6개월 실증본이 정답. 코드+운영 페이지 DevTools 실측으로 클론.
//   · 낭독 = 첫 문장 등장 즉시 시작(운영 실측 = 텍스트와 +19ms 동시) + 스트리밍 문장 이어 낭독
//   · 속도 = CONFIG.VOICE.TTS_RATE 1.0 (진입 음성안내와 동일 = 사장님 확정 최적)
//   · 일시정지 = 읽던 문장 기억 → 그 문장부터 재개 (운영 네이티브 패턴 = 문장 스킵 방지)
//   · 텍스트 토글 = 표시만 토글(운영 = classList.toggle 1줄) = 음성 계속 + 하이라이트 연동 유지
//   · 자동 스크롤 = 낭독 문장 따라 (운영 scrollIntoView center 클론 = 글자수 비례 근사) + 스크롤바
//   · 글자 = 운영 실측 20px/행간 32.5 + 폰 글자확대 무시(allowFontScaling=false = WebView와 동일)
//   · 모든 버튼 = 완전 투명 + 아이콘만 (2026-07-20 사장님 실기기 지시 = 컴포넌트 전체 통일)
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, Image, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Dimensions, Animated, Platform,
} from 'react-native';
import * as Speech from 'expo-speech';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CONFIG } from '../config/constants';

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

export default function DetailViewer({
  imageUri, sentences = [], loading = false, loadingText = '', done = false,
  locationName, voiceQuery, mode = 'camera',
  lang = 'ko', onClose, onSave, onAskAgain,
}) {
  const t = I18N[lang] || I18N.ko;
  const insets = useSafeAreaInsets();
  const scrollRef = useRef(null);
  const contentHRef = useRef(0);
  const viewportHRef = useRef(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [currentSentence, setCurrentSentence] = useState(-1);
  const [textVisible, setTextVisible] = useState(true);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const textOpacity = useRef(new Animated.Value(1)).current;
  const sentencesRef = useRef([]);
  const currentIdxRef = useRef(-1);
  const advanceRef = useRef(false); // 자동 진행(재생) 중
  const pausedRef = useRef(false);
  const waitingRef = useRef(false); // 스트리밍 대기(다음 문장 도착 시 이어 낭독)
  const startedRef = useRef(false); // 자동재생 1회 시작 빗장
  const doneRef = useRef(false);

  const isVoiceMode = mode === 'voice';
  sentencesRef.current = sentences;
  doneRef.current = done;

  // ⚠️ 문장별 순차 낭독 + 하이라이트 = 운영 speakNext 클론.
  //   큐 소진 + 스트림 미완 = waiting(도착 시 이어 낭독) / 스트림 완료 = 종료 처리.
  const speakSentence = useCallback((index) => {
    if (index >= sentencesRef.current.length) {
      if (doneRef.current) {
        advanceRef.current = false;
        currentIdxRef.current = -1;
        setIsPlaying(false);
        setCurrentSentence(-1);
      } else {
        waitingRef.current = true;
      }
      return;
    }
    currentIdxRef.current = index;
    setCurrentSentence(index);

    const voice = Platform.OS === 'ios' ? IOS_VOICE_MAP[lang] : undefined;
    Speech.speak(sentencesRef.current[index], {
      language: lang === 'zh-CN' ? 'zh-CN' : lang,
      voice,
      // 운영 정답 = 진입 음성안내 속도(1.0) — 2026-07-20 사장님 확정 (옛 iOS 0.5 늘어짐 폐기)
      rate: CONFIG.VOICE.TTS_RATE,
      pitch: CONFIG.VOICE.TTS_PITCH,
      onDone: () => {
        if (!advanceRef.current || pausedRef.current) return;
        if (currentIdxRef.current === index) speakSentence(index + 1);
      },
      onError: () => {
        advanceRef.current = false;
        setIsPlaying(false);
        setCurrentSentence(-1);
      },
    });
  }, [lang]);

  // ⚠️ 자동재생 = 운영 실측 클론: 첫 문장 등장 즉시 시작(+19ms), 이후 도착 문장 이어 낭독.
  useEffect(() => {
    if (!sentences.length) return;
    if (!startedRef.current) {
      startedRef.current = true;
      advanceRef.current = true;
      setIsPlaying(true);
      speakSentence(0);
    } else if (waitingRef.current && advanceRef.current && !pausedRef.current) {
      waitingRef.current = false;
      speakSentence(currentIdxRef.current + 1);
    }
  }, [sentences.length, speakSentence]);

  // 스트림 완료 시 대기 중이면 마무리 흐름 진입(남은 문장 없으면 종료 처리).
  useEffect(() => {
    if (done && waitingRef.current && advanceRef.current && !pausedRef.current) {
      waitingRef.current = false;
      speakSentence(currentIdxRef.current + 1);
    }
  }, [done, speakSentence]);

  // 언마운트 = 낭독 정지.
  useEffect(() => () => { Speech.stop(); }, []);

  // ⚠️ 자동 스크롤 = 운영 scrollIntoView(center) 클론 — 문장 글자수 비례 위치로 부드럽게.
  useEffect(() => {
    if (currentSentence < 0 || !scrollRef.current || !contentHRef.current) return;
    const arr = sentencesRef.current;
    const total = arr.reduce((s, x) => s + x.length, 0) || 1;
    const before = arr.slice(0, currentSentence).reduce((s, x) => s + x.length, 0);
    const y = Math.max(0, (before / total) * contentHRef.current - viewportHRef.current * 0.35);
    scrollRef.current.scrollTo({ y, animated: true });
  }, [currentSentence]);

  // ⚠️ 재생⇄일시정지 = 운영 onAudioBtnClick 네이티브 패턴 클론:
  //   재생 중 → 정지 + 읽던 문장 기억 / 일시정지 중 → 그 문장부터 재개 / 종료 후 → 처음부터.
  const handleAudioToggle = useCallback(() => {
    if (isPlaying && !isPaused) {
      pausedRef.current = true;
      setIsPaused(true);
      Speech.stop();
      return;
    }
    if (isPlaying && isPaused) {
      pausedRef.current = false;
      setIsPaused(false);
      waitingRef.current = false; // 일시정지 중 도착분과 이중진행 방지(§22 검증 반영)
      speakSentence(Math.max(currentIdxRef.current, 0));
      return;
    }
    advanceRef.current = true;
    pausedRef.current = false;
    setIsPaused(false);
    setIsPlaying(true);
    speakSentence(0);
  }, [isPlaying, isPaused, speakSentence]);

  // ⚠️ 텍스트 토글 = 운영 1줄 클론(표시만 토글) — 음성·하이라이트 상태는 건드리지 않음.
  const handleTextToggle = useCallback(() => {
    const next = !textVisible;
    setTextVisible(next);
    Animated.timing(textOpacity, { toValue: next ? 1 : 0, duration: 200, useNativeDriver: true }).start();
  }, [textVisible, textOpacity]);

  // ⚠️ 저장 = 운영 인라인 스피너 패턴: onSave(비동기) 성공 시에만 저장 표시.
  const handleSave = useCallback(async () => {
    if (saved || saving || !onSave) return;
    setSaving(true);
    try {
      const ok = await onSave();
      if (ok) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setSaved(true);
      }
    } finally {
      setSaving(false);
    }
  }, [saved, saving, onSave]);

  // ⚠️ 리턴 (낭독 정지 + 닫기)
  const handleClose = useCallback(() => {
    advanceRef.current = false;
    Speech.stop();
    onClose();
  }, [onClose]);

  return (
    <View style={styles.container}>
      {/* 배경: 이미지모드 또는 음성모드 */}
      {isVoiceMode ? (
        <View style={[styles.bg, { backgroundColor: '#FFFEFA' }]} />
      ) : (
        <Image source={{ uri: imageUri }} style={styles.bg} resizeMode="cover" />
      )}

      {/* ← 리턴 버튼 = 우측상단(운영 backBtn 위치) + 완전 투명(사장님 지시) */}
      <TouchableOpacity style={[styles.backBtn, { top: insets.top + 16 }]} onPress={handleClose}>
        <Ionicons name="arrow-back" size={28} color="#4285F4" />
      </TouchableOpacity>

      {/* 위치창 / 음성질문 박스 = 운영 locationInfo 클론(흰 반투명 + 파란 아이콘) */}
      {(locationName || voiceQuery) && (
        <View style={[styles.infoBox, { top: insets.top + 72 }]}>
          <Ionicons name={voiceQuery ? 'chatbubble' : 'location'} size={16} color="#4285F4" />
          <Text style={styles.infoText} numberOfLines={2} allowFontScaling={false}>
            {voiceQuery || locationName}
          </Text>
        </View>
      )}

      {/* 로딩 = 운영 loader-container 클론: 이미지 유지 + 중앙 스피너 + 로테이션 문구 */}
      {loading && (
        <View style={styles.loaderWrap}>
          <ActivityIndicator size="large" color="#fff" />
          <Text style={styles.loadingText} allowFontScaling={false}>{loadingText || t.loading}</Text>
        </View>
      )}

      {/* 텍스트 오버레이 = 상단부터 + 문장 하이라이트 + 자동 스크롤 + 스크롤바 */}
      {!loading && (
        <Animated.View
          style={[
            styles.textArea,
            { top: insets.top + ((locationName || voiceQuery) ? 124 : 72), opacity: textOpacity },
          ]}
          pointerEvents={textVisible ? 'auto' : 'none'}
        >
          <ScrollView
            ref={scrollRef}
            contentContainerStyle={styles.textContent}
            showsVerticalScrollIndicator={true}
            onContentSizeChange={(_w, h) => { contentHRef.current = h; }}
            onLayout={(e) => { viewportHRef.current = e.nativeEvent.layout.height; }}
          >
            <Text allowFontScaling={false}>
              {sentences.map((sentence, i) => (
                <Text
                  key={i}
                  allowFontScaling={false}
                  style={[
                    isVoiceMode ? styles.sentenceDark : styles.sentence,
                    i === currentSentence && styles.sentenceHighlight,
                  ]}
                >
                  {sentence}{' '}
                </Text>
              ))}
            </Text>
          </ScrollView>
        </Animated.View>
      )}

      {/* 하단 footer = 완전 투명 버튼(사장님 지시) — 로딩 중 숨김(운영 detailFooter hidden 클론) */}
      {!loading && (
        <View style={[styles.footer, { paddingBottom: insets.bottom + 8 }]}>
          {/* 재질문 (음성모드만) */}
          {isVoiceMode && onAskAgain && (
            <TouchableOpacity
              style={styles.footerBtn}
              onPress={() => { advanceRef.current = false; Speech.stop(); onAskAgain(); }}
            >
              <Ionicons name="mic" size={30} color="#4285F4" />
            </TouchableOpacity>
          )}

          {/* 재생⇄일시정지 */}
          <TouchableOpacity style={styles.footerBtn} onPress={handleAudioToggle}>
            <Ionicons name={isPlaying && !isPaused ? 'pause' : 'play'} size={30} color="#4285F4" />
          </TouchableOpacity>

          {/* 텍스트 표시 토글 */}
          <TouchableOpacity style={styles.footerBtn} onPress={handleTextToggle}>
            <Ionicons name={textVisible ? 'document-text' : 'document-text-outline'} size={30} color="#4285F4" />
          </TouchableOpacity>

          {/* 저장 (운영 인라인 스피너) */}
          <TouchableOpacity style={styles.footerBtn} onPress={handleSave} disabled={saved || saving}>
            {saving ? (
              <ActivityIndicator size="small" color="#4285F4" />
            ) : (
              <Ionicons name={saved ? 'bookmark' : 'bookmark-outline'} size={30} color={saved ? '#00C851' : '#4285F4'} />
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

// ⚠️ 2026-07-20 운영앱 DevTools 실측 클론: 글자 20px/행간 32.5 + 여백 32·24 + 모든 버튼 완전 투명(사장님 지시).
const styles = StyleSheet.create({
  container: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 200, backgroundColor: '#000' },
  bg: { position: 'absolute', top: 0, left: 0, width: SCREEN_W, height: SCREEN_H },
  backBtn: {
    position: 'absolute', right: 16, width: 48, height: 48, borderRadius: 24,
    backgroundColor: 'transparent', alignItems: 'center', justifyContent: 'center', zIndex: 10,
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
    color: '#fff', fontSize: 20, lineHeight: 32,
    textShadowColor: 'rgba(0,0,0,0.95)', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 8,
  },
  sentenceDark: { color: '#000', fontSize: 20, lineHeight: 32 },
  sentenceHighlight: { backgroundColor: 'rgba(66,133,244,0.3)', fontWeight: '600' },
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0, height: 100,
    flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', paddingHorizontal: 16,
  },
  footerBtn: {
    width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'transparent',
  },
});
