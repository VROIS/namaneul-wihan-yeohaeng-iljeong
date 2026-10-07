// ⚠️ 수정금지(승인필요) 2026-10-07 사장님 결정 = 글자 비교 전 발음기호 떼기(NFD → 결합 기호 제거) 1벌 = 알아보는 문·PID 관문·목록 정제 검사가 같이 쓴다. 아무것도 import 하지 않는다 (정본 §)
export const foldAccents = (s: string): string =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "");
/** 이름 비교용 = 소문자 + 발음기호 제거 + 글자·숫자 아닌 것은 공백 1개 (PID 관문·목록 정제 검사가 같이 쓴다). */
export const foldName = (s: string): string =>
  foldAccents(s.toLowerCase())
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
