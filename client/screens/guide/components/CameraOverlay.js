// ⚠️ 수정금지(승인필요): 2026-04-03 네이티브 카메라 오버레이 — 삼성 Galaxy A35 하단 버튼 해결
// WebView 위에 표시, 네이티브 TouchableOpacity로 버튼 렌더링 (WebView 이벤트 버그 우회)
import React, { useRef, useState, useCallback } from 'react';
import {
  View, StyleSheet, TouchableOpacity, Text, ActivityIndicator,
  Dimensions, Platform,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// ⚠️ 수정금지(승인필요): i18n 7개 언어 사전 주입
const I18N = {
  ko: { capture: '사진 촬영', voice: '음성으로 질문하기', upload: '갤러리에서 업로드', archive: '보관함', loading: '분석 중...' },
  en: { capture: 'Take Photo', voice: 'Ask by Voice', upload: 'Upload from Gallery', archive: 'Archive', loading: 'Analyzing...' },
  ja: { capture: '写真を撮る', voice: '音声で質問', upload: 'ギャラリーから', archive: '保管庫', loading: '分析中...' },
  'zh-CN': { capture: '拍照', voice: '语音提问', upload: '从相册上传', archive: '收藏夹', loading: '分析中...' },
  fr: { capture: 'Prendre une Photo', voice: 'Question Vocale', upload: 'Depuis la Galerie', archive: 'Archives', loading: 'Analyse...' },
  de: { capture: 'Foto aufnehmen', voice: 'Sprachfrage', upload: 'Aus Galerie', archive: 'Archiv', loading: 'Analyse...' },
  es: { capture: 'Tomar Foto', voice: 'Pregunta por Voz', upload: 'Desde Galería', archive: 'Archivo', loading: 'Analizando...' },
};

const { width: SCREEN_W } = Dimensions.get('window');

export default function CameraOverlay({ lang = 'ko', onCapture, onVoice, onUpload, onArchive, onClose }) {
  const t = I18N[lang] || I18N.ko;
  const insets = useSafeAreaInsets();
  const cameraRef = useRef(null);
  const [loading, setLoading] = useState(false);
  const [permission, requestPermission] = useCameraPermissions();
  // ⚠️ 수정금지(승인필요): 버튼별 개별 디바운스 (공유 시 간섭 방지)
  const lastTaps = useRef({});
  const debounce = useCallback((key, fn, delay = 300) => {
    const now = Date.now();
    if (now - (lastTaps.current[key] || 0) < delay) return;
    lastTaps.current[key] = now;
    fn();
  }, []);

  // ⚠️ 수정금지(승인필요): 이미지 최적화 — 1024px JPEG 0.85
  const optimizeImage = async (uri) => {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1024 } }],
      { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG, base64: true }
    );
    return result;
  };

  // ⚠️ 수정금지(승인필요): 위치 가져오기
  const getLocation = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return null;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      return { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
    } catch { return null; }
  };

  // ⚠️ 수정금지(승인필요): 촬영 버튼
  const handleCapture = () => debounce('capture', async () => {
    if (!cameraRef.current || loading) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setLoading(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.9 });
      const optimized = await optimizeImage(photo.uri);
      const location = await getLocation();
      onCapture({ base64: optimized.base64, uri: optimized.uri, location });
    } catch (err) {
      console.error('[CameraOverlay] capture error:', err);
    } finally {
      setLoading(false);
    }
  }, 300);

  // ⚠️ 수정금지(승인필요): 음성 버튼
  const handleVoice = () => debounce('voice', () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onVoice();
  }, 200);

  // ⚠️ 수정금지(승인필요): 갤러리 업로드 버튼
  const handleUpload = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        quality: 0.9,
      });
      if (result.canceled || !result.assets?.[0]) return;
      setLoading(true);
      const optimized = await optimizeImage(result.assets[0].uri);
      const location = await getLocation();
      onUpload({ base64: optimized.base64, uri: optimized.uri, location });
    } catch (err) {
      console.error('[CameraOverlay] upload error:', err);
    } finally {
      setLoading(false);
    }
  };

  // ⚠️ 수정금지(승인필요): 보관함 버튼
  const handleArchive = () => debounce('archive', () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onArchive();
  }, 300);

  // 카메라 권한 요청
  if (!permission?.granted) {
    return (
      <View style={[styles.container, styles.center]}>
        <Text style={styles.permText}>카메라 권한이 필요합니다</Text>
        <TouchableOpacity style={styles.permBtn} onPress={requestPermission}>
          <Text style={styles.permBtnText}>권한 허용</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* 카메라 뷰 */}
      <CameraView ref={cameraRef} style={styles.camera} facing="back" />

      {/* 로딩 오버레이 */}
      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color="#4285F4" />
          <Text style={styles.loadingText}>{t.loading}</Text>
        </View>
      )}

      {/* ⚠️ 수정금지(승인필요): 하단 4버튼 — 네이티브 TouchableOpacity (삼성 WebView 무관) */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 8 }]}>
        <TouchableOpacity style={styles.btn} onPress={handleCapture} activeOpacity={0.7}
          accessibilityLabel={t.capture}>
          <Ionicons name="camera" size={28} color="#4285F4" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.btn} onPress={handleVoice} activeOpacity={0.7}
          accessibilityLabel={t.voice}>
          <Ionicons name="mic" size={28} color="#4285F4" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.btn} onPress={handleUpload} activeOpacity={0.7}
          accessibilityLabel={t.upload}>
          <Ionicons name="image" size={28} color="#4285F4" />
        </TouchableOpacity>

        <TouchableOpacity style={styles.btn} onPress={handleArchive} activeOpacity={0.7}
          accessibilityLabel={t.archive}>
          <Ionicons name="archive" size={28} color="#4285F4" />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 100 },
  center: { justifyContent: 'center', alignItems: 'center', backgroundColor: '#000' },
  camera: { flex: 1 },
  footer: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: 100, backgroundColor: 'rgba(0,0,0,0.6)',
    flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center',
    paddingHorizontal: 16,
  },
  btn: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center', alignItems: 'center', zIndex: 10,
  },
  loadingText: { color: '#fff', marginTop: 12, fontSize: 16 },
  permText: { color: '#fff', fontSize: 16, marginBottom: 20 },
  permBtn: { backgroundColor: '#4285F4', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8 },
  permBtnText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
