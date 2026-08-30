// ⚠️ 수정금지(승인필요) 2026-08-06 사장님 SSOT = **놓친 결제 통보를 다시 흘려보내는 상시 도구**(1회용 아님).
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
