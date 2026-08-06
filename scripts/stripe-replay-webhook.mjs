// ⚠️ 수정금지(승인필요) 2026-08-06 사장님 SSOT = **놓친 결제 통보를 다시 흘려보내는 상시 도구**(1회용 아님).
//
// 왜 필요한가 (2026-08-06 실제 사고):
//   로컬에서 결제 테스트를 할 때 `stripe listen` 을 안 켜 두면 통보가 우리 서버에 오지 않는다.
//   결제는 성공했는데 크레딧만 안 들어간 상태가 되고, 스트라이프의 재전송 기능은
//   우리 열쇠(rk_, 최소권한)에 **쓰기 권한이 없어** 쓸 수 없다.
//
// 무엇을 하나
//   스트라이프에서 그 통보의 **원본**을 그대로 받아와, 우리 서버의 통보 접수구로 다시 보낸다.
//   서명은 `.env` 의 `STRIPE_WEBHOOK_SECRET`(= `stripe listen` 이 쓰는 값)으로 만든다
//   = `stripe listen` 이 평소에 하는 일과 **똑같은 경로**다. 충전이 확정되는 곳은 여전히 웹훅 1곳뿐(§9).
//
// 안전
//   · 같은 결제를 여러 번 보내도 DB 규칙(credit_transactions_purchase_ref_uniq)이 중복 충전을 막는다.
//   · 우리가 만든 결제(표식 tripis)가 아니면 서버가 스스로 무시한다.
//
// 쓰는 법
//   node scripts/stripe-replay-webhook.mjs <이벤트번호> [<이벤트번호> ...]
//   node scripts/stripe-replay-webhook.mjs --missing        (= 장부에 없는 결제 통보를 스스로 찾아 전부)
//   옵션: --to=http://localhost:5000  (기본값. 운영으로 보내려면 그 주소 + 그쪽 서명값 필요)
import "dotenv/config";
import Stripe from "stripe";

const args = process.argv.slice(2);
const base =
  args.find((a) => a.startsWith("--to="))?.slice(5) || "http://localhost:5000";
const ids = args.filter((a) => a.startsWith("evt_"));
const findMissing = args.includes("--missing");

const key = process.env.STRIPE_SECRET_KEY;
const secret = process.env.STRIPE_WEBHOOK_SECRET;
if (!key || !secret) {
  console.error(
    "STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET 이 .env 에 있어야 합니다.",
  );
  process.exit(1);
}
const stripe = new Stripe(key);

// 장부에 아직 없는 결제 통보 찾기 = 우리 서버의 읽기 전용 조회를 그대로 씀(§16 재사용, DB 직접 안 봄).
async function pickMissing() {
  const list = await stripe.events.list({
    type: "checkout.session.completed",
    limit: 30,
  });
  const out = [];
  for (const e of list.data) {
    const s = e.data?.object;
    if (!s?.id || s.payment_status !== "paid") continue;
    const r = await fetch(`${base}/api/payments/session/${s.id}`, {
      headers: { Authorization: `Bearer ${process.env.REPLAY_TOKEN || ""}` },
    }).catch(() => null);
    const j = r && r.ok ? await r.json().catch(() => null) : null;
    if (j && j.paid && !j.fulfilled) out.push(e.id);
  }
  return out;
}

const targets = findMissing ? await pickMissing() : ids;
if (!targets.length) {
  console.log(
    "보낼 통보가 없습니다. 이벤트번호를 주거나 --missing 을 쓰세요(이 경우 REPLAY_TOKEN 필요).",
  );
  process.exit(0);
}

for (const id of targets) {
  const event = await stripe.events.retrieve(id);
  const payload = JSON.stringify(event, null, 2);
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret });
  const res = await fetch(`${base}/api/payments/webhook`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "stripe-signature": header },
    body: payload,
  });
  console.log(`${id} → HTTP ${res.status} ${await res.text()}`);
}
