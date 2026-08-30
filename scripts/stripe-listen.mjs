// ⚠️ 수정금지(승인필요) 2026-08-06 사장님 SSOT = **로컬 결제 테스트의 1단계.**
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
  {
    stdio: "inherit",
    shell: true,
    env: { ...process.env, STRIPE_API_KEY: key },
  },
);
child.on("exit", (code) => process.exit(code ?? 0));
