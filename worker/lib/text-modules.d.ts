// ⚠️ 수정금지(승인필요) 2026-11-09 사장님 결정 = .html 파일 = 글자로 가져오기(wrangler 기본 Text 모듈) (정본 2026-11-09)
declare module "*.html" {
  const text: string;
  export default text;
}
