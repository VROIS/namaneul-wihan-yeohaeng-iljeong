// ⚠️ 수정금지(승인필요): 다국어 버튼 라벨 — 기존 앱 7개 언어 지원
// Google Translate는 RN 네이티브에 적용 불가 → 자체 i18n 필수

export const translations = {
  ko: { live: '라이브', capture: '촬영', upload: '업로드', assistant: '여행비서', archive: '보관함' },
  en: { live: 'Live', capture: 'Capture', upload: 'Upload', assistant: 'Assistant', archive: 'Archive' },
  ja: { live: 'ライブ', capture: '撮影', upload: 'アップロード', assistant: '旅行アシスト', archive: '保管箱' },
  'zh-CN': { live: '直播', capture: '拍照', upload: '上传', assistant: '旅行助手', archive: '收藏' },
  fr: { live: 'Direct', capture: 'Photo', upload: 'Téléverser', assistant: 'Assistant', archive: 'Archives' },
  de: { live: 'Live', capture: 'Foto', upload: 'Hochladen', assistant: 'Assistent', archive: 'Archiv' },
  es: { live: 'En vivo', capture: 'Captura', upload: 'Subir', assistant: 'Asistente', archive: 'Archivo' },
};

// ⚠️ 수정금지(승인필요): 번역 함수
export function t(key, lang = 'ko') {
  return translations[lang]?.[key] || translations.ko[key] || key;
}
