// ⚠️ 수정금지(승인필요): 다국어 버튼 라벨 — 기존 앱 7개 언어 지원
// Google Translate는 RN 네이티브에 적용 불가 → 자체 i18n 필수

// ⚠️ 수정금지(승인필요) 2026-08-08 사장님 확정 = hint = 라이브뷰 첫 화면에만 뜨는 사용법.
//   카메라라는 건 설명이 필요 없지만 "2~3초 뒤 음성 해설이 나온다"와 "듣고 저장한다"는 유추가 안 된다.
//   ⚠️ 줄바꿈(\n)은 **글이 직접 정한다** = 자동으로 맡기면 낱말이 쪼개진다(실측 2026-08-08 아이폰12).
//      글자를 한 자씩 그리는 HintWave 도 이 줄바꿈을 그대로 쓴다.
export const translations = {
  ko: { live: '라이브', capture: '촬영', upload: '업로드', assistant: '여행비서', archive: '보관함',
        hint: '촬영·업로드하면 2~3초 뒤\n음성 해설을 듣고 저장하세요' },
  // ⚠️ 수정금지(승인필요) 2026-08-08 판단3종 지적 = **한 줄은 짧게.**
  //   글자를 한 자씩 그려 줄바꿈이 안 되므로, 긴 줄은 카드 밖으로 넘치거나 글자가 잘게 줄어든다.
  //   기준 = 라틴 문자는 **한 줄 24자 이하**, 한글·가나·한자는 **한 줄 16자 이하**.
  //   옛 긴 문구(영 36자·독 39자) 폐기 = 2026-08-08 §19.
  en: { live: 'Live', capture: 'Capture', upload: 'Upload', assistant: 'Assistant', archive: 'Archive',
        hint: 'Capture or upload\nHear the guide in 2–3s' },
  ja: { live: 'ライブ', capture: '撮影', upload: 'アップロード', assistant: '旅行アシスト', archive: '保管箱',
        hint: '撮影・アップロードで\n2〜3秒後に音声解説' },
  'zh-CN': { live: '直播', capture: '拍照', upload: '上传', assistant: '旅行助手', archive: '收藏',
        hint: '拍照或上传后\n2~3 秒收听语音讲解' },
  fr: { live: 'Direct', capture: 'Photo', upload: 'Téléverser', assistant: 'Assistant', archive: 'Archives',
        hint: 'Photo ou import\nGuide audio en 2–3 s' },
  de: { live: 'Live', capture: 'Foto', upload: 'Hochladen', assistant: 'Assistent', archive: 'Archiv',
        hint: 'Foto oder Upload\nAudioguide in 2–3 s' },
  es: { live: 'En vivo', capture: 'Captura', upload: 'Subir', assistant: 'Asistente', archive: 'Archivo',
        hint: 'Foto o subida\nAudioguía en 2–3 s' },
};

// ⚠️ 수정금지(승인필요): 번역 함수
export function t(key, lang = 'ko') {
  return translations[lang]?.[key] || translations.ko[key] || key;
}
