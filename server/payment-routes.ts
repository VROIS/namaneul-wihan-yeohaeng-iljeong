// ⚠️ 수정금지(승인필요) 2026-07-29 사장님 SSOT = 결제(Stripe)·크레딧 API (CLAUDE.md §9).
//   결제 진입 2갈래(2026-08-12 사장님 승인) = 웹: Stripe 결제창(checkout) / 폰: 네이티브 결제 시트(sheet-intent).
import type { Express, Request, Response } from "express";
import Stripe from "stripe";
import { creditService, CREDIT_CONFIG } from "./creditService";
import { CREDIT_COSTS } from "./credit-charge";
import { getUserIdFromReq } from "./auth-user";

const STRIPE_API_VERSION = "2026-06-24.dahlia";

let cached: { key: string; client: Stripe } | null = null;
function stripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("stripe_key_missing");
  const hit = cached;
  if (hit && hit.key === key) return hit.client;
  const client = new Stripe(key, { apiVersion: STRIPE_API_VERSION });
  cached = { key, client };
  return client;
}

const PURCHASE_CREDITS = CREDIT_CONFIG.PURCHASE_CREDITS;
const PRICE_EUR = CREDIT_CONFIG.PRICE_EUR;

// ⚠️ 수정금지(승인필요) 2026-08-14 사장님 승인 = Stripe 결제창 다국어.
function checkoutText(lang: string) {
  const base = PURCHASE_CREDITS - CREDIT_CONFIG.PURCHASE_BONUS;
  const bonus = CREDIT_CONFIG.PURCHASE_BONUS;
  const texts: Record<string, { name: string; desc: string }> = {
    ko: {
      name: "Tripis 크레딧 충전",
      desc: `${PURCHASE_CREDITS} 크레딧 (기본 ${base} + 보너스 ${bonus})`,
    },
    en: {
      name: "Tripis Credit Top-up",
      desc: `${PURCHASE_CREDITS} credits (${base} base + ${bonus} bonus)`,
    },
    fr: {
      name: "Recharge de crédits Tripis",
      desc: `${PURCHASE_CREDITS} crédits (${base} de base + ${bonus} bonus)`,
    },
    es: {
      name: "Recarga de créditos Tripis",
      desc: `${PURCHASE_CREDITS} créditos (${base} base + ${bonus} de bono)`,
    },
    de: {
      name: "Tripis-Guthaben aufladen",
      desc: `${PURCHASE_CREDITS} Credits (${base} Basis + ${bonus} Bonus)`,
    },
    ja: {
      name: "Tripisクレジットチャージ",
      desc: `${PURCHASE_CREDITS}クレジット(基本${base}+ボーナス${bonus})`,
    },
    zh: {
      name: "Tripis 积分充值",
      desc: `${PURCHASE_CREDITS} 积分（基础 ${base} + 赠送 ${bonus}）`,
    },
  };
  return texts[lang] || texts.ko;
}

// ⚠️ 우리 앱이 만든 결제라는 표식. 내손앱과 같은 Stripe 계정을 쓰기 때문에 필요하다(사장님 결정 2026-07-29).
const APP_TAG = "tripis";

// ⚠️ 수정금지(승인필요) 2026-08-12 사장님 승인 = **충전 집행 1벌** = 어느 진입 신호(웹훅·앱 즉시확인·일일 원장대조)로 오든
async function fulfillFromStripeRecord(
  refId: string,
  meta: Stripe.Metadata | null | undefined,
): Promise<
  | { outcome: "credited"; balance: number }
  | { outcome: "duplicate" }
  | { outcome: "not_ours" }
  | { outcome: "no_user" }
> {
  if (meta?.app !== APP_TAG) return { outcome: "not_ours" };
  const userId = meta?.userId;
  if (!userId) return { outcome: "no_user" };
  try {
    const balance = await creditService.processPurchase(userId, refId);
    console.log(
      `[Payments] 충전 완료 user=${userId} ref=${refId} 잔액=${balance}`,
    );
    return { outcome: "credited", balance };
  } catch (e: any) {
    if (e?.code === "23505") return { outcome: "duplicate" };
    throw e;
  }
}

// ⚠️ 수정금지(승인필요) 2026-08-12 사장님 승인 = **원장 대조 회수** = 최근 N일의 성공 결제(tripis 표식)를
export async function reconcilePayments(days = 3): Promise<{
  scanned: number;
  credited: number;
}> {
  const since = Math.floor(Date.now() / 1000) - days * 86400;
  let scanned = 0;
  let credited = 0;
  const intents = await stripe().paymentIntents.list({
    created: { gte: since },
    limit: 100,
  });
  for (const pi of intents.data) {
    if (pi.status !== "succeeded" || pi.metadata?.app !== APP_TAG) continue;
    scanned++;
    const r = await fulfillFromStripeRecord(pi.id, pi.metadata);
    if (r.outcome === "credited") credited++;
  }
  const sessions = await stripe().checkout.sessions.list({
    created: { gte: since },
    limit: 100,
  });
  for (const s of sessions.data) {
    if (s.payment_status !== "paid" || s.metadata?.app !== APP_TAG) continue;
    scanned++;
    const r = await fulfillFromStripeRecord(s.id, s.metadata);
    if (r.outcome === "credited") credited++;
  }
  if (credited > 0)
    console.log(
      `[Payments] 원장 대조 회수: ${credited}건 충전(검사 ${scanned}건)`,
    );
  return { scanned, credited };
}

// ⚠️ 수정금지(승인필요) 2026-08-12 사장님 승인 = **웹훅 구독 자가 보증** = 대시보드 클릭 의존 제거.
const REQUIRED_WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "payment_intent.succeeded",
] as const;
export async function ensureWebhookSubscription(): Promise<void> {
  const eps = await stripe().webhookEndpoints.list({ limit: 16 });
  const ours = eps.data.find((e) => e.url.endsWith("/api/payments/webhook"));
  if (!ours) {
    console.warn("[Payments] 웹훅 엔드포인트를 찾지 못함 = 구독 보증 건너뜀");
    return;
  }
  const missing = REQUIRED_WEBHOOK_EVENTS.filter(
    (ev) => !ours.enabled_events.includes(ev),
  );
  if (missing.length === 0) return;
  await stripe().webhookEndpoints.update(ours.id, {
    enabled_events: [
      ...new Set([...ours.enabled_events, ...REQUIRED_WEBHOOK_EVENTS]),
    ] as any,
  });
  console.log(`[Payments] 웹훅 구독 자가 교정: ${missing.join(", ")} 추가`);
}

export async function initPaymentSelfHeal(): Promise<void> {
  try {
    await ensureWebhookSubscription();
  } catch (e: any) {
    console.warn(
      "[Payments] 구독 자가 보증 실패(무해, 다음 부팅 재시도):",
      e?.message,
    );
  }
  try {
    await reconcilePayments(3);
  } catch (e: any) {
    console.warn(
      "[Payments] 부팅 원장 대조 실패(스케줄러가 재시도):",
      e?.message,
    );
  }
}

// ⚠️ 수정금지(승인필요) 2026-08-05 = 결제 끝나고 **돌아올 주소**를 고르는 곳 1벌.
function pickReturnBase(origin: string, selfBase: string): string {
  try {
    const o = new URL(origin);
    if (o.protocol !== "http:" && o.protocol !== "https:") return selfBase;
    const ours =
      o.host === new URL(selfBase).host ||
      o.hostname === "localhost" ||
      o.hostname === "127.0.0.1";
    return ours ? o.origin : selfBase;
  } catch {
    return selfBase; // Origin 이 없거나(앱에서 직접 호출) 이상하면 요청받은 주소
  }
}

export function registerPaymentRoutes(app: Express): void {
  app.get("/api/credits/balance", async (req: Request, res: Response) => {
    try {
      const userId = getUserIdFromReq(req);
      if (!userId) return res.status(401).json({ error: "login_required" });
      res.json({ balance: await creditService.getBalance(userId) });
    } catch (e: any) {
      console.error("[Credits] 잔액 조회 실패:", e?.message);
      res.status(500).json({ error: "balance_failed" });
    }
  });

  app.get("/api/credits/transactions", async (req: Request, res: Response) => {
    try {
      const userId = getUserIdFromReq(req);
      if (!userId) return res.status(401).json({ error: "login_required" });
      const raw = parseInt(String(req.query.limit ?? "20"), 10);
      const limit = Number.isFinite(raw) ? Math.min(Math.max(raw, 1), 100) : 20;
      res.json({
        transactions: await creditService.getTransactionHistory(userId, limit),
      });
    } catch (e: any) {
      console.error("[Credits] 내역 조회 실패:", e?.message);
      res.status(500).json({ error: "transactions_failed" });
    }
  });

  app.get("/api/credits/pricing", (_req: Request, res: Response) => {
    res.json({
      currency: "EUR",
      priceEur: PRICE_EUR,
      purchaseCredits: PURCHASE_CREDITS,
      signupBonus: CREDIT_CONFIG.SIGNUP_BONUS,
      costs: CREDIT_COSTS,
      // 폰 결제 시트용 공개 키(pk_ = 비밀 아님) = 관리자 화면 api_keys 등록 1벌 → 재빌드 없이 교체 가능(2026-08-12 사장님 승인).
      stripePublishableKey: process.env.STRIPE_PUBLISHABLE_KEY || null,
    });
  });

  // ── 4) 결제창 만들기 = POST /api/payments/checkout = ⚠️ 웹 전용 (2026-08-12 사장님 승인 = 폰은 아래 결제 시트로 전환)
  app.post("/api/payments/checkout", async (req: Request, res: Response) => {
    try {
      const userId = getUserIdFromReq(req);
      if (!userId) return res.status(401).json({ error: "login_required" });

      const user = await creditService.getUserProfile(userId);

      // ⚠️ 수정금지(승인필요) 2026-08-08 사장님 확정 = **크레딧 0 고정 계정은 충전을 막는다.**
      if (user?.email && /^c0@.+\.test$/i.test(user.email)) {
        return res.status(403).json({ error: "test_account_no_topup" });
      }

      // ⚠️ 수정금지(승인필요) 2026-08-05 사장님 실조작 SSOT = **결제 끝나고 돌아올 주소**.
      const fwdProto = String(req.headers["x-forwarded-proto"] || "").split(
        ",",
      )[0];
      const selfBase = `${fwdProto || "https"}://${req.headers.host}`;
      const baseUrl = pickReturnBase(
        String(req.headers.origin || ""),
        selfBase,
      );

      const lang = checkoutText(user?.preferredLanguage || "ko");

      const session = await stripe().checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        // ⚠️ 수정금지(승인필요) 2026-08-14 = Stripe 자체 UI(카드/이메일/결제방식 등) 다국어 전환 1벌.
        locale: (user?.preferredLanguage ||
          "ko") as Stripe.Checkout.SessionCreateParams.Locale,
        line_items: [
          {
            price_data: {
              currency: "eur",
              product_data: {
                name: lang.name,
                description: lang.desc,
              },
              unit_amount: PRICE_EUR * 100,
            },
            quantity: 1,
          },
        ],
        // ⚠️ 수정금지(승인필요) 2026-08-06 = 이 `?payment=` 를 화면이 읽어 **첫 화면을 프로필(충전소)로** 연다.
        success_url: `${baseUrl}/?payment=success&session_id={CHECKOUT_SESSION_ID}`,
        // ⚠️ 수정금지(승인필요) 2026-08-08 사장님 APK 실증 = 옛 cancel_url 완전삭제 §19.
        customer_email: user?.email || undefined,
        metadata: { userId, app: APP_TAG },
      });

      res.json({ url: session.url, sessionId: session.id });
    } catch (e: any) {
      if (e?.message === "stripe_key_missing") {
        console.error(
          "[Payments] STRIPE_SECRET_KEY 미등록(관리자 화면에서 등록 필요)",
        );
        return res.status(503).json({ error: "stripe_key_missing" });
      }
      console.error("[Payments] 결제창 생성 실패:", e?.message);
      res.status(502).json({ error: "checkout_failed" });
    }
  });

  // ── 4.5) 폰 결제 시트용 결제 생성 = POST /api/payments/sheet-intent (2026-08-12 사장님 승인) ──
  app.post(
    "/api/payments/sheet-intent",
    async (req: Request, res: Response) => {
      try {
        const userId = getUserIdFromReq(req);
        if (!userId) return res.status(401).json({ error: "login_required" });

        const user = await creditService.getUserProfile(userId);
        if (user?.email && /^c0@.+\.test$/i.test(user.email)) {
          return res.status(403).json({ error: "test_account_no_topup" });
        }

        const intent = await stripe().paymentIntents.create({
          amount: PRICE_EUR * 100,
          currency: "eur",
          payment_method_types: ["card"],
          description: `Tripis 크레딧 충전 (${PURCHASE_CREDITS})`,
          metadata: { userId, app: APP_TAG },
        });
        res.json({ clientSecret: intent.client_secret, intentId: intent.id });
      } catch (e: any) {
        if (e?.message === "stripe_key_missing") {
          return res.status(503).json({ error: "stripe_key_missing" });
        }
        console.error("[Payments] 시트 결제 생성 실패:", e?.message);
        res.status(502).json({ error: "sheet_intent_failed" });
      }
    },
  );

  app.post("/api/payments/webhook", async (req: Request, res: Response) => {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    const signature = req.headers["stripe-signature"];

    if (!secret || !signature || !req.rawBody) {
      console.error(
        "[Payments] 웹훅 준비 안 됨(키·서명·본문 누락) → 재전송 유도",
      );
      return res.status(503).json({ error: "webhook_not_ready" });
    }

    let event: Stripe.Event;
    try {
      event = stripe().webhooks.constructEvent(
        req.rawBody as Buffer,
        signature as string,
        secret,
      );
    } catch (e: any) {
      console.error("[Payments] 웹훅 서명 검증 실패:", e?.message);
      return res.status(400).json({ error: "invalid_signature" });
    }

    let refId: string;
    let meta: Stripe.Metadata | null;
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      if (session.payment_status !== "paid") {
        console.log(
          `[Payments] 결제 미완료 상태(${session.payment_status}) = 충전 안 함:`,
          session.id,
        );
        return res.json({ received: true });
      }
      refId = session.id;
      meta = session.metadata;
    } else if (event.type === "payment_intent.succeeded") {
      const intent = event.data.object as Stripe.PaymentIntent;
      refId = intent.id;
      meta = intent.metadata;
    } else {
      return res.json({ received: true });
    }

    try {
      const r = await fulfillFromStripeRecord(refId, meta);
      if (r.outcome === "not_ours")
        console.log("[Payments] 우리 앱 결제가 아님 = 충전 안 함:", refId);
      else if (r.outcome === "no_user")
        console.warn("[Payments] 통보에 userId 없음 = 충전 대상 불명:", refId);
      else if (r.outcome === "duplicate")
        console.log("[Payments] 중복 통보 무시(이미 충전됨):", refId);
    } catch (e: any) {
      console.error("[Payments] 충전 실패:", e?.message);
      return res.status(500).json({ error: "fulfillment_failed" });
    }

    res.json({ received: true });
  });

  app.post("/api/payments/confirm", async (req: Request, res: Response) => {
    try {
      const userId = getUserIdFromReq(req);
      if (!userId) return res.status(401).json({ error: "login_required" });
      const intentId = String(req.body?.intentId || "");
      if (!/^pi_[A-Za-z0-9]+$/.test(intentId))
        return res.status(400).json({ error: "bad_intent_id" });

      const pi = await stripe().paymentIntents.retrieve(intentId);
      if (pi.metadata?.userId !== userId)
        return res.status(403).json({ error: "not_your_payment" });
      if (pi.status !== "succeeded")
        return res
          .status(409)
          .json({ error: "not_succeeded", status: pi.status });

      const r = await fulfillFromStripeRecord(pi.id, pi.metadata);
      if (r.outcome === "credited")
        return res.json({ ok: true, balance: r.balance });
      if (r.outcome === "duplicate")
        return res.json({
          ok: true,
          balance: await creditService.getBalance(userId),
        });
      return res.status(409).json({ error: r.outcome });
    } catch (e: any) {
      console.error("[Payments] 즉시 확인 실패:", e?.message);
      res.status(502).json({ error: "confirm_failed" });
    }
  });

  app.post(
    "/api/admin/payments/reconcile",
    async (req: Request, res: Response) => {
      try {
        const { getUserIdFromReq: getUid, getRoleFromDb } = await import(
          "./auth-user"
        );
        const uid = getUid(req);
        if (!uid) return res.status(401).json({ error: "login_required" });
        if ((await getRoleFromDb(uid)) !== "admin")
          return res.status(403).json({ error: "admin_only" });
        res.json({ success: true, ...(await reconcilePayments(3)) });
      } catch (e: any) {
        console.error("[Payments] 수동 원장 대조 실패:", e?.message);
        res.status(500).json({ error: "reconcile_failed" });
      }
    },
  );
}
