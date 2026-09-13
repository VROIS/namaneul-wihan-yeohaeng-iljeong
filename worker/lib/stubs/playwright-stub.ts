// ⚠️ 수정금지(승인필요) 2026-09-13 사장님 결정 = Worker 번들에서는 Node 용 playwright 를 싣지 않는다(브라우저 = Browser Run 바인딩) = wrangler alias 로 이 빈 껍데기를 대신 넣는다. Node(필시티·CLI)는 진짜 playwright 를 쓴다 (정본 §)
export const chromium = {
  launch(): never {
    throw new Error(
      "[playwright] Worker 안에서는 쓰지 않는다(Browser Run 바인딩 사용)",
    );
  },
};
