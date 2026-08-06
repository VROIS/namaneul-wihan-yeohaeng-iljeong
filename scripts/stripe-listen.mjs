// ⚠️ 수정금지(승인필요) 2026-08-06 사장님 SSOT = **로컬 결제 테스트의 1단계.**
//
// 왜 필요한가 (2026-08-06 사고):
//   스트라이프는 바깥에서 못 들어오는 주소(localhost)로 결제 성공 통보를 보낼 수 없다.
//   그래서 이걸 켜 두지 않으면 **결제는 되는데 크레딧만 안 들어간다**(운영은 정상).
//   사장님이 로컬에서 겪으신 그 증상이 전부 이것 때문이었다.
//
// 쓰는 법 = `npm run stripe:listen` (켜 두고 결제 테스트)
//   열쇠는 `.env` 에서 읽어 **환경변수로만** 넘긴다(명령줄에 적으면 작업목록에 그대로 보인다).
//   서명값은 `.env` 의 STRIPE_WEBHOOK_SECRET 과 이미 같으므로 서버를 다시 켤 필요가 없다.
//
// 통보를 놓친 결제가 있으면 = `node scripts/stripe-replay-webhook.mjs <이벤트번호>`
import "dotenv/config";
import { spawn } from "node:child_process";

const key = process.env.STRIPE_SECRET_KEY;
if (!key) {
  console.error(
    "STRIPE_SECRET_KEY 가 .env 에 없습니다. (docs/2026-07-29 결제·크레딧 구현.md §12-2 참고)",
  );
  process.exit(1);
}

const child = spawn(
  "stripe",
  ["listen", "--forward-to", "localhost:5000/api/payments/webhook"],
  { stdio: "inherit", shell: true, env: { ...process.env, STRIPE_API_KEY: key } },
);
child.on("exit", (code) => process.exit(code ?? 0));
