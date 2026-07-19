// ⚠️ 수정금지(승인필요): zustand 전역 상태 — AI 상태, 대화 기록, 모델 다운로드 상태
import { create } from 'zustand';

// AI 엔진 상태: 'idle' | 'loading' | 'ready' | 'error'
// 라이브 모드: 'off' | 'listening' | 'thinking' | 'speaking'
// 모델 상태: 'not_downloaded' | 'downloading' | 'ready' | 'error'

export const useStore = create((set, get) => ({
  // === AI 엔진 상태 ===
  aiEngine: 'idle',       // Gemma 4 엔진 상태
  setAiEngine: (state) => set({ aiEngine: state }),

  // === 모델 다운로드 ===
  modelStatus: 'not_downloaded', // 모델 다운로드 상태
  downloadProgress: 0,           // 0~1
  setModelStatus: (status) => set({ modelStatus: status }),
  setDownloadProgress: (progress) => set({ downloadProgress: progress }),

  // === 라이브 모드 (Always-Listening) ===
  liveMode: 'off',        // off → listening → thinking → speaking → listening ...
  setLiveMode: (mode) => set({ liveMode: mode }),
  isLiveActive: () => get().liveMode !== 'off',

  // === 대화 기록 ===
  // { role: 'user'|'ai', text: string, timestamp: number, image?: string }
  messages: [],
  addMessage: (msg) => set((s) => ({
    messages: [...s.messages, { ...msg, timestamp: Date.now() }],
  })),
  clearMessages: () => set({ messages: [] }),

  // === 현재 활성 기능 ===
  activeFeature: null,     // 'live' | 'capture' | 'upload' | 'assistant' | 'archive' | null
  setActiveFeature: (feature) => set({ activeFeature: feature }),

  // === 온라인/오프라인 ===
  isOnline: true,
  useOnlineFallback: false, // Gemma 실패 → Gemini API 사용 중
  setOnline: (online) => set({ isOnline: online }),
  setOnlineFallback: (fallback) => set({ useOnlineFallback: fallback }),

  // === 촬영 결과 ===
  photoUri: null,
  setPhotoUri: (uri) => set({ photoUri: uri }),

  // === 여행비서 상태 ===
  assistantMode: null,     // 'translate' | 'exchange' | 'sos' | 'menu' | null
  setAssistantMode: (mode) => set({ assistantMode: mode }),

  // === 위치 ===
  location: null,          // { latitude, longitude, accuracy }
  setLocation: (loc) => set({ location: loc }),

  // ⚠️ 수정금지(승인필요): 언어 설정 (i18n — Google Translate 미적용 영역)
  language: 'ko',          // ko | en | ja | zh-CN | fr | de | es
  setLanguage: (lang) => set({ language: lang }),
}));
