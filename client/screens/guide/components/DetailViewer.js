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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CONFIG } from '../config/constants';
// 아이콘 = 운영 SVG 경로 직접 렌더(GuideIcons) = iOS Expo Go 에서 Ionicons 미표시 근본 해결(2026-07-20 실기기 SSOT).
import GuideIcon from './GuideIcons';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// ⚠️ 수정금지(승인필요): i18n 7개 언어 사전 주입. alreadySaved = 중복 저장 시 안내(2026-07-21 사장님).
const I18N = {
  ko: { play: '오디오 재생', pause: '일시정지', save: '보관함에 저장', saved: '저장되었습니다', alreadySaved: '이미 저장되었습니다', textToggle: '해설 읽기', askAgain: '다시 질문하기', loading: '로딩 중...', back: '뒤로' },
  en: { play: 'Play Audio', pause: 'Pause', save: 'Save to Archive', saved: 'Saved!', alreadySaved: 'Already saved.', textToggle: 'Read Text', askAgain: 'Ask Again', loading: 'Loading...', back: 'Back' },
  ja: { play: '音声再生', pause: '一時停止', save: '保管庫に保存', saved: '保存しました', alreadySaved: 'すでに保存済みです', textToggle: 'テキスト', askAgain: 'もう一度', loading: '読み込み中...', back: '戻る' },
  'zh-CN': { play: '播放', pause: '暂停', save: '保存', saved: '已保存', alreadySaved: '已经保存过了', textToggle: '文字', askAgain: '重新提问', loading: '加载中...', back: '返回' },
  fr: { play: 'Lire', pause: 'Pause', save: 'Sauvegarder', saved: 'Sauvegardé!', alreadySaved: 'Déjà sauvegardé.', textToggle: 'Texte', askAgain: 'Reposer', loading: 'Chargement...', back: 'Retour' },
  de: { play: 'Abspielen', pause: 'Pause', save: 'Speichern', saved: 'Gespeichert!', alreadySaved: 'Bereits gespeichert.', textToggle: 'Text', askAgain: 'Erneut', loading: 'Laden...', back: 'Zurück' },
  es: { play: 'Reproducir', pause: 'Pausar', save: 'Guardar', saved: '¡Guardado!', alreadySaved: 'Ya guardado.', textToggle: 'Texto', askAgain: 'Preguntar', loading: 'Cargando...', back: 'Atrás' },
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
  // 저장 상태 = 운영 saveBtn 클론: 'idle'(북마크) → 'saving'(스피너) → 'success'(체크마크 1.5초) → 'idle' 복원.
  const [saveState, setSaveState] = useState('idle');
  const saveTimerRef = useRef(null);
  // ⚠️ 이 해설의 DB 저장 완료 여부 = 중복저장 방지(2026-07-21 사장님 지시). 한 번 저장되면 재클릭해도 DB 재기록 안 함(안내음성만).
  const savedRef = useRef(false);
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

  // ⚠️ 낭독 완전 정지 = 운영 index.js:3057 resetSpeechState 클론(단일 진입점, §0·§16 재발명 금지).
  //   저장 안내음성·닫기·재질문 3곳이 각자 인라인으로 정지하던 것을 이 함수 1벌로 통일.
  const stopTTS = useCallback(() => {
    advanceRef.current = false;
    pausedRef.current = false;
    waitingRef.current = false;
    currentIdxRef.current = -1;
    Speech.stop();
    setIsPlaying(false);
    setIsPaused(false);
    setCurrentSentence(-1);
  }, []);

  // ⚠️ 자동 스크롤 = 운영 scrollIntoView(center) 클론 — 문장 글자수 비례 위치로 부드럽게.
  useEffect(() => {
    if (currentSentence < 0 || !scrollRef.current || !contentHRef.current) return;
    const arr = sentencesRef.current;
    const total = arr.reduce((s, x) => s + x.length, 0) || 1;
    const before = arr.slice(0, currentSentence).reduce((s, x) => s + x.length, 0);
    const y = Math.max(0, (before / total) * contentHRef.current - viewportHRef.current * 0.35);
    scrollRef.current.scrollTo({ y, animated: true });
  }, [currentSentence]);

  // ⚠️ 일시정지 = 읽던 문장 기억(운영 onAudioBtnClick pause 경로). 저장·토글 공용(§16 재발명 금지).
  const pauseTTS = useCallback(() => {
    pausedRef.current = true;
    setIsPaused(true);
    Speech.stop();
  }, []);

  // ⚠️ 재개 = 멈춘 문장부터(운영 resume 경로). 저장·토글 공용.
  const resumeTTS = useCallback(() => {
    pausedRef.current = false;
    setIsPaused(false);
    waitingRef.current = false; // 일시정지 중 도착분과 이중진행 방지
    speakSentence(Math.max(currentIdxRef.current, 0));
  }, [speakSentence]);

  // ⚠️ 재생⇄일시정지 = 운영 onAudioBtnClick 네이티브 패턴 클론:
  //   재생 중 → 정지 + 읽던 문장 기억 / 일시정지 중 → 그 문장부터 재개 / 종료 후 → 처음부터.
  const handleAudioToggle = useCallback(() => {
    if (isPlaying && !isPaused) { pauseTTS(); return; }
    if (isPlaying && isPaused) { resumeTTS(); return; }
    advanceRef.current = true;
    pausedRef.current = false;
    setIsPaused(false);
    setIsPlaying(true);
    speakSentence(0);
  }, [isPlaying, isPaused, pauseTTS, resumeTTS, speakSentence]);

  // ⚠️ 텍스트 토글 = 운영 1줄 클론(표시만 토글) — 음성·하이라이트 상태는 건드리지 않음.
  const handleTextToggle = useCallback(() => {
    const next = !textVisible;
    setTextVisible(next);
    Animated.timing(textOpacity, { toValue: next ? 1 : 0, duration: 200, useNativeDriver: true }).start();
  }, [textVisible, textOpacity]);

  // ⚠️ 저장 안내음성 = 사장님 설계(2026-07-21): 일시정지 → 안내음성 → 자동 일시정지 해제(낭독 지속).
  //   ⚠️ 재개 판단 = React state(isPlaying/isPaused = 비동기)가 아니라 ref(currentIdxRef = 즉시반영)로 =
  //     연속 저장 시 state 리렌더 지연으로 재개가 꺼지던 버그 근본(2026-07-21). 낭독 미완료(문장 남음)면 항상 재개.
  const announce = useCallback((message) => {
    const resumeIdx = currentIdxRef.current;
    const wasReading = resumeIdx >= 0 && resumeIdx < sentencesRef.current.length;
    if (wasReading) pauseTTS(); // 일시정지 버튼과 동일(§16 재사용). stop 前 pausedRef 선점 = 끊긴 문장 onDone 이 다음으로 안 넘어감.
    const resume = () => {
      if (wasReading) resumeTTS(); // 자동 일시정지 해제 = 멈춘 문장부터 낭독 지속(§16 재사용).
    };
    Speech.speak(message, {
      language: lang === 'zh-CN' ? 'zh-CN' : lang,
      voice: Platform.OS === 'ios' ? IOS_VOICE_MAP[lang] : undefined,
      rate: CONFIG.VOICE.TTS_RATE,
      pitch: CONFIG.VOICE.TTS_PITCH,
      onDone: resume,
      onStopped: resume,
    });
  }, [pauseTTS, resumeTTS, lang]);

  // ⚠️ 저장 클릭 = ①DB 저장은 최초 1회만(중복 방지, 2026-07-21 사장님) ②안내음성+낭독 이어가기는 매번 동일.
  //   운영 handleSaveClick(index.js:3051~) = 스피너 → 체크마크 1.5초 → 북마크 복원.
  const handleSave = useCallback(async () => {
    if (saveState !== 'idle' || !onSave) return;

    // 이미 저장된 해설 = DB 재기록 없이 "이미 저장되었습니다" 안내음성만(중복 저장 차단).
    if (savedRef.current) {
      setSaveState('success');
      announce(t.alreadySaved);
      saveTimerRef.current = setTimeout(() => setSaveState('idle'), 1500);
      return;
    }

    setSaveState('saving');
    try {
      const ok = await onSave();
      if (ok) {
        savedRef.current = true; // 이 해설 = 저장 완료 = 이후 중복 저장 차단.
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        setSaveState('success');
        announce(t.saved); // 1차 = "저장되었습니다"
        saveTimerRef.current = setTimeout(() => setSaveState('idle'), 1500);
      } else {
        setSaveState('idle');
      }
    } catch {
      setSaveState('idle');
    }
  }, [saveState, onSave, announce, t.saved, t.alreadySaved]);

  // 언마운트 시 저장 복원 타이머 정리.
  useEffect(() => () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); }, []);

  // ⚠️ 리턴 (낭독 정지 + 닫기) = stopTTS 단일 진입점 사용(§0·§16 재발명 금지, 인라인 중복 삭제)
  const handleClose = useCallback(() => {
    stopTTS();
    onClose();
  }, [onClose, stopTTS]);

  return (
    <View style={styles.container}>
      {/* 배경: 이미지모드 또는 음성모드 */}
      {isVoiceMode ? (
        <View style={[styles.bg, { backgroundColor: '#FFFEFA' }]} />
      ) : (
        <Image source={{ uri: imageUri }} style={styles.bg} resizeMode="cover" />
      )}

      {/* ← 리턴 버튼 = 우측상단(운영 backBtn 위치) + 완전 투명 + 운영 SVG 화살표 */}
      <TouchableOpacity style={[styles.backBtn, { top: insets.top + 16 }]} onPress={handleClose}>
        <GuideIcon name="back" size={28} />
      </TouchableOpacity>

      {/* 위치창 / 음성질문 박스 = 운영 locationInfo 클론(흰 반투명 + 파란 마커 SVG) */}
      {(locationName || voiceQuery) && (
        <View style={[styles.infoBox, { top: insets.top + 72 }]}>
          <GuideIcon name={voiceQuery ? 'mic' : 'location'} size={18} />
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
            // ⚠️ AOS = footer(insets+12 올림, 높이 100) 위로 텍스트존 하단을 동적 확보 = 겹침 방지, 2026-07-20 3차 실기기
            Platform.OS === 'android' && { bottom: insets.bottom + 120 },
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

      {/* 하단 footer = 완전 투명 버튼 + 운영 SVG 아이콘 — 로딩 중 숨김(운영 detailFooter hidden 클론).
          AOS = 기기 버튼과 겹침 방지 = 바 전체를 인셋만큼 위로(2026-07-20 실기기 SSOT). iOS = 기존 그대로. */}
      {!loading && (
        <View
          style={[
            styles.footer,
            Platform.OS === 'ios'
              ? { paddingBottom: insets.bottom + 8 }
              : { bottom: insets.bottom + 12 },
          ]}
        >
          {/* 재질문 (음성모드만) */}
          {isVoiceMode && onAskAgain && (
            <TouchableOpacity
              style={styles.footerBtn}
              onPress={() => { stopTTS(); onAskAgain(); }}
            >
              <GuideIcon name="mic" size={34} />
            </TouchableOpacity>
          )}

          {/* 재생⇄일시정지 */}
          <TouchableOpacity style={styles.footerBtn} onPress={handleAudioToggle}>
            <GuideIcon name={isPlaying && !isPaused ? 'pause' : 'play'} size={34} />
          </TouchableOpacity>

          {/* 텍스트 표시 토글 (숨김 상태 = 흐린 파랑) */}
          <TouchableOpacity style={styles.footerBtn} onPress={handleTextToggle}>
            <GuideIcon name="documentText" size={34} color={textVisible ? '#4285F4' : 'rgba(66,133,244,0.4)'} />
          </TouchableOpacity>

          {/* 저장 = 운영 클론: 스피너 → 체크마크(1.5초) → 북마크 복원 */}
          <TouchableOpacity
            style={styles.footerBtn}
            onPress={handleSave}
            disabled={saveState !== 'idle'}
          >
            {saveState === 'saving' ? (
              <ActivityIndicator size="small" color="#4285F4" />
            ) : saveState === 'success' ? (
              <GuideIcon name="check" size={34} color="#00C851" strokeWidth={3} />
            ) : (
              <GuideIcon name="bookmark" size={34} color="#4285F4" />
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
    width: 68, height: 68, borderRadius: 34, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'transparent',
  },
});
