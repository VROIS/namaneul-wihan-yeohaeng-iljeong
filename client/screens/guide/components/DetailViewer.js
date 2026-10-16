// ⚠️ 수정금지(승인필요): 네이티브 DetailViewer = 운영앱(내손안에 가이드) 상세페이지 완전 클론
// = 2026-07-20 사장님 SSOT: 운영앱(my-handyguide1) 6개월 실증본이 정답. 코드+운영 페이지 DevTools 실측으로 클론.
//   · 모든 버튼 = 완전 투명 + 아이콘만 (2026-07-20 사장님 실기기 지시 = 컴포넌트 전체 통일)
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, Image, StyleSheet, ScrollView, TouchableOpacity,
  ActivityIndicator, Animated, Platform,
} from 'react-native';
import * as Speech from 'expo-speech';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SvgXml } from 'react-native-svg';
import { CONFIG } from '../config/constants';
import GuideIcon from './GuideIcons';
import { placeholderMarkerSvg } from '@/components/bts/bts-marker-svg';

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
  locationName, voiceQuery, mode = 'camera', placeholderCategory = null,
  lang = 'ko', onClose, onSave, onAskAgain, alreadySaved = false,
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
  const [saveState, setSaveState] = useState('idle');
  const saveTimerRef = useRef(null);
  //   ⚠️ 2026-08-03 사장님 지시 = **한 사용자 = 한 장소 = 해설 1행**. 이미 담아둔 장소면(창고 응답 mine)
  const savedRef = useRef(alreadySaved);
  useEffect(() => { savedRef.current = alreadySaved; }, [alreadySaved]);
  const textOpacity = useRef(new Animated.Value(1)).current;
  const sentencesRef = useRef([]);
  const currentIdxRef = useRef(-1);
  const advanceRef = useRef(false); // 자동 진행(재생) 중
  const pausedRef = useRef(false);
  const waitingRef = useRef(false); // 스트리밍 대기(다음 문장 도착 시 이어 낭독)
  const startedRef = useRef(false); // 자동재생 1회 시작 빗장
  const doneRef = useRef(false);

  const isVoiceMode = mode === 'voice';
  // ⚠️ 수정금지(승인필요) 2026-08-03 사장님 지시 = 검정은 여행앱 금기색.
  const onLightBg = isVoiceMode || !imageUri;
  const noImageSvg = placeholderMarkerSvg(placeholderCategory);
  sentencesRef.current = sentences;
  doneRef.current = done;

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
        // ⚠️ 2026-08-03 사장님 지적("저장 후 1단락만 읽고 끝남") 실측 원인:
        if (pausedRef.current) return;
        advanceRef.current = false;
        setIsPlaying(false);
        setCurrentSentence(-1);
      },
    });
  }, [lang]);

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

  useEffect(() => {
    if (done && waitingRef.current && advanceRef.current && !pausedRef.current) {
      waitingRef.current = false;
      speakSentence(currentIdxRef.current + 1);
    }
  }, [done, speakSentence]);

  useEffect(() => () => { Speech.stop(); }, []);

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

  useEffect(() => {
    if (currentSentence < 0 || !scrollRef.current || !contentHRef.current) return;
    const arr = sentencesRef.current;
    const total = arr.reduce((s, x) => s + x.length, 0) || 1;
    const before = arr.slice(0, currentSentence).reduce((s, x) => s + x.length, 0);
    const y = Math.max(0, (before / total) * contentHRef.current - viewportHRef.current * 0.35);
    scrollRef.current.scrollTo({ y, animated: true });
  }, [currentSentence]);

  const pauseTTS = useCallback(() => {
    pausedRef.current = true;
    setIsPaused(true);
    Speech.stop();
  }, []);

  const resumeTTS = useCallback(() => {
    pausedRef.current = false;
    setIsPaused(false);
    waitingRef.current = false; // 일시정지 중 도착분과 이중진행 방지
    speakSentence(Math.max(currentIdxRef.current, 0));
  }, [speakSentence]);

  const handleAudioToggle = useCallback(() => {
    if (isPlaying && !isPaused) { pauseTTS(); return; }
    if (isPlaying && isPaused) { resumeTTS(); return; }
    advanceRef.current = true;
    pausedRef.current = false;
    setIsPaused(false);
    setIsPlaying(true);
    speakSentence(0);
  }, [isPlaying, isPaused, pauseTTS, resumeTTS, speakSentence]);

  const handleTextToggle = useCallback(() => {
    const next = !textVisible;
    setTextVisible(next);
    Animated.timing(textOpacity, { toValue: next ? 1 : 0, duration: 200, useNativeDriver: true }).start();
  }, [textVisible, textOpacity]);

  // ⚠️ 저장 안내음성 = 사장님 설계(2026-07-21): 일시정지 → 안내음성 → 자동 일시정지 해제(낭독 지속).
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
  const handleSave = useCallback(async () => {
    if (saveState !== 'idle' || !onSave) return;

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

  useEffect(() => () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); }, []);

  const handleClose = useCallback(() => {
    stopTTS();
    onClose();
  }, [onClose, stopTTS]);

  return (
    <View style={[styles.container, !onLightBg && styles.containerPhoto]}>
      {/* 배경 = 사진 / 밝은 바탕(음성 모드·사진 없는 장소 공용 1벌) */}
      {onLightBg ? (
        <View style={[styles.bg, styles.lightBg]}>
          {/* ⚠️ 2026-08-03 사장님 지시 = 사진 없는 장소는 분류 아이콘이 화면을 거의 다 채운다.
              부모(화면) 폭 비율로만 커진다 = 화면크기를 한 번 재서 굳히지 않는다(어느 기기·회전에도 같은 비율).
              글이 먼저 읽혀야 하므로 옅게 깔리는 장식. 음성 모드는 아이콘 없이 바탕만. */}
          {!isVoiceMode && (
            <View style={styles.noImageIcon} pointerEvents="none">
              {noImageSvg ? (
                <SvgXml xml={noImageSvg} width="100%" height="100%" />
              ) : (
                <GuideIcon name="location" size="100%" />
              )}
            </View>
          )}
        </View>
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
          {/* 밝은 바탕에서는 흰 스피너·흰 글씨가 안 보인다 → 화면이 이미 쓰는 파랑·어두운 글씨로(2026-08-03 §23 결) */}
          <ActivityIndicator size="large" color={onLightBg ? '#4285F4' : '#fff'} />
          <Text
            style={[styles.loadingText, onLightBg && styles.loadingTextDark]}
            allowFontScaling={false}
          >
            {loadingText || t.loading}
          </Text>
        </View>
      )}

      {/* 텍스트 오버레이 = 상단부터 + 문장 하이라이트 + 자동 스크롤 + 스크롤바 */}
      {!loading && (
        <Animated.View
          style={[
            styles.textArea,
            { top: insets.top + ((locationName || voiceQuery) ? 124 : 72), opacity: textOpacity },
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
                    onLightBg ? styles.sentenceDark : styles.sentence,
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

          {/* 저장 = 운영 클론: 스피너 → 체크마크(1.5초) → 북마크 복원.
              ⚠️ 2026-08-01 사장님 = 보기 전용(onSave 미전달 = 이미 저장된 콘텐츠)이면 흐리게 비활성만, 3단 버튼 레이아웃 유지 */}
          <TouchableOpacity
            style={[styles.footerBtn, !onSave && { opacity: 0.35 }]}
            onPress={handleSave}
            disabled={saveState !== 'idle' || !onSave}
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
  container: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 200 },
  // ⚠️ 수정금지(승인필요) 2026-08-03 사장님 = 어두운 바탕은 **사진이 깔릴 때만**(사진 로딩 중 여백용).
  containerPhoto: { backgroundColor: '#000' },
  // ⚠️ 2026-08-01 사장님 "풀로 차게" = 앱 시작 때 화면크기 1회 고정(Dimensions) 버릇 제거 → 어느 크기에서든 부모 꽉 채움
  bg: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  lightBg: { backgroundColor: '#FFFEFA', alignItems: 'center', justifyContent: 'center' },
  noImageIcon: { width: '80%', aspectRatio: 1, opacity: 0.15 },
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
  loadingTextDark: { color: '#000', textShadowColor: 'transparent' },
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
