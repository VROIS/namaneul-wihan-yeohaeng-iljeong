// ⚠️ 수정금지(승인필요): 백엔드 자율검증 화면
// 앱 실행 시 자동으로 Gemma 4 백엔드 전체 검증
// 검증 완료 후 제거 예정
import React, { useState, useEffect } from 'react';
import { View, Text, ScrollView, StyleSheet, ActivityIndicator } from 'react-native';
import * as Speech from 'expo-speech';
import { runSelfTest, initEngine, sendMessage, isEngineReady } from '../services/GemmaEngine';
import { isModelDownloaded, downloadModel, getModelPath } from '../services/ModelDownloader';
import { CONFIG } from '../config/constants';

// ⚠️ 수정금지(승인필요): 검증 항목 상태
const STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  PASS: 'pass',
  FAIL: 'fail',
};

const ICON = {
  [STATUS.PENDING]: '⏳',
  [STATUS.RUNNING]: '🔄',
  [STATUS.PASS]: '✅',
  [STATUS.FAIL]: '❌',
};

export default function BackendTestScreen() {
  const [tests, setTests] = useState([
    { id: 'url', label: 'HuggingFace 모델 URL 접근', status: STATUS.PENDING, detail: '' },
    { id: 'download', label: '모델 다운로드 상태', status: STATUS.PENDING, detail: '' },
    { id: 'native', label: 'LiteRT-LM 네이티브 모듈', status: STATUS.PENDING, detail: '' },
    { id: 'engine', label: 'Gemma 4 엔진 초기화', status: STATUS.PENDING, detail: '' },
    { id: 'inference', label: '텍스트 추론 응답', status: STATUS.PENDING, detail: '' },
    { id: 'tts', label: 'TTS 음성 출력', status: STATUS.PENDING, detail: '' },
  ]);

  const updateTest = (id, status, detail) => {
    setTests(prev => prev.map(t => t.id === id ? { ...t, status, detail } : t));
  };

  // ⚠️ 수정금지(승인필요): 자동 검증 실행
  useEffect(() => {
    runAllTests();
  }, []);

  async function runAllTests() {
    // 1. 모델 URL 접근 확인
    updateTest('url', STATUS.RUNNING, '');
    try {
      const response = await fetch(CONFIG.MODEL.DOWNLOAD_URL, { method: 'HEAD' });
      if (response.ok || response.status === 302 || response.status === 301) {
        updateTest('url', STATUS.PASS, `HTTP ${response.status}`);
      } else {
        updateTest('url', STATUS.FAIL, `HTTP ${response.status}`);
      }
    } catch (e) {
      updateTest('url', STATUS.FAIL, e.message);
    }

    // 2. 모델 다운로드 상태
    updateTest('download', STATUS.RUNNING, '');
    try {
      const downloaded = await isModelDownloaded();
      if (downloaded) {
        const path = getModelPath();
        updateTest('download', STATUS.PASS, `모델 있음: ${path}`);
      } else {
        updateTest('download', STATUS.FAIL, '모델 미다운로드 (1회 다운로드 필요 ~2.4GB)');
      }
    } catch (e) {
      updateTest('download', STATUS.FAIL, e.message);
    }

    // 3. 네이티브 모듈 로딩
    updateTest('native', STATUS.RUNNING, '');
    try {
      const selfTest = await runSelfTest();
      if (selfTest.litertlm_available) {
        updateTest('native', STATUS.PASS,
          `프로세서: ${selfTest.available_processors}코어, 메모리: ${selfTest.free_memory_mb}MB free / ${selfTest.max_memory_mb}MB max`
        );
      } else {
        updateTest('native', STATUS.FAIL, selfTest.litertlm_error || '모듈 미로딩');
      }
    } catch (e) {
      updateTest('native', STATUS.FAIL, e.message);
    }

    // 4. 엔진 초기화
    updateTest('engine', STATUS.RUNNING, '');
    try {
      const result = await initEngine(CONFIG.PROMPTS.GUIDE);
      if (result.ready) {
        updateTest('engine', STATUS.PASS, `모델 크기: ${Math.round(result.modelSize / 1024 / 1024)}MB`);
      } else {
        updateTest('engine', STATUS.FAIL, result.reason);
      }
    } catch (e) {
      updateTest('engine', STATUS.FAIL, e.message);
    }

    // 5. 텍스트 추론
    updateTest('inference', STATUS.RUNNING, '');
    try {
      if (isEngineReady()) {
        let response = '';
        await new Promise((resolve, reject) => {
          sendMessage({
            text: '안녕하세요',
            onToken: (token) => { response += token; },
            onComplete: (fullText) => { response = fullText; resolve(); },
            onError: (error) => { reject(new Error(error)); },
          });
          // 타임아웃 10초
          setTimeout(() => resolve(), 10000);
        });
        if (response) {
          updateTest('inference', STATUS.PASS, `응답: "${response.slice(0, 80)}..."`);
        } else {
          updateTest('inference', STATUS.FAIL, '응답 없음');
        }
      } else {
        updateTest('inference', STATUS.FAIL, '엔진 미초기화');
      }
    } catch (e) {
      updateTest('inference', STATUS.FAIL, e.message);
    }

    // 6. TTS 음성 출력
    updateTest('tts', STATUS.RUNNING, '');
    try {
      await Speech.speak('자율 검증 완료', {
        language: CONFIG.VOICE.LANGUAGE,
        rate: CONFIG.VOICE.TTS_RATE,
      });
      updateTest('tts', STATUS.PASS, '음성 출력 성공');
    } catch (e) {
      updateTest('tts', STATUS.FAIL, e.message);
    }
  }

  const passCount = tests.filter(t => t.status === STATUS.PASS).length;
  const totalCount = tests.length;

  return (
    <View style={styles.container}>
      <Text style={styles.title}>백엔드 자율검증</Text>
      <Text style={styles.subtitle}>Gemma 4 E2B 온디바이스 AI</Text>

      <ScrollView style={styles.list}>
        {tests.map(test => (
          <View key={test.id} style={styles.testRow}>
            <Text style={styles.icon}>
              {test.status === STATUS.RUNNING ? '' : ICON[test.status]}
            </Text>
            {test.status === STATUS.RUNNING && (
              <ActivityIndicator size="small" color="#4285F4" style={{ marginRight: 8 }} />
            )}
            <View style={styles.testInfo}>
              <Text style={styles.testLabel}>{test.label}</Text>
              {test.detail ? <Text style={styles.testDetail}>{test.detail}</Text> : null}
            </View>
          </View>
        ))}
      </ScrollView>

      <View style={styles.summary}>
        <Text style={styles.summaryText}>
          결과: {passCount}/{totalCount} 통과
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', padding: 20, paddingTop: 60 },
  title: { color: '#fff', fontSize: 24, fontWeight: '700', textAlign: 'center' },
  subtitle: { color: '#4285F4', fontSize: 14, textAlign: 'center', marginTop: 4, marginBottom: 20 },
  list: { flex: 1 },
  testRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 16, paddingHorizontal: 8 },
  icon: { fontSize: 18, marginRight: 8, width: 28 },
  testInfo: { flex: 1 },
  testLabel: { color: '#fff', fontSize: 16, fontWeight: '500' },
  testDetail: { color: 'rgba(255,255,255,0.5)', fontSize: 12, marginTop: 2 },
  summary: { borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.2)', paddingTop: 16, alignItems: 'center' },
  summaryText: { color: '#fff', fontSize: 18, fontWeight: '600' },
});
