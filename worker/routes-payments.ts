// Cloudflare Worker 이관 = 결제(Stripe) 5벌 (2026-09-06)
// Worker 필수 2가지 = ① Stripe 클라이언트 httpClient = Stripe.createFetchHttpClient(Workers 에는 Node http 모듈이 없다) ② 웹훅 서명검증 = constructEventAsync + createSubtleCryptoProvider(동기 constructEvent 불가)
// 근거 = https://blog.cloudflare.com/announcing-stripe-support-in-workers/
import express, { type Express, type Request, type Response } from "express";
import type { drizzle } from "drizzle-orm/postgres-js";
import Stripe from "stripe";
import { waitUntil } from "cloudflare:workers";
import type { Sql } from "postgres";
import * as schema from "../shared/schema";
import { getRoleFromDb, getUserIdFromReq } from "./auth-user";
import { getUser } from "../shared/users";
import {
  PRICE_EUR,
  PURCHASE_BONUS,
  PURCHASE_CREDITS,
  addCredits,
  getBalance,
} from "../shared/credits";
import { ensureKeys } from "./keys";

// src.ts 의 openDb() 를 그대로 받는다(연결 1벌 = 반드시 close).
type Db = ReturnType<typeof drizzle<typeof schema>>;
type OpenDb = () => { db: Db; close: () => void };
// 열쇠(STRIPE_SECRET_KEY)는 DB api_keys 에 있다(keys.ts). src.ts 의 withKeys() 는 export 되지
// 않으므로 같은 방식(연결 1벌 → ensureKeys → 반드시 닫기)을 여기서 쓴다.
type OpenSql = () => Sql;

const STRIPE_API_VERSION = "2026-06-24.dahlia";

// ⚠️ 우리 앱이 만든 결제라는 표식. 내손앱과 같은 Stripe 계정을 쓰기 때문에 필요하다(사장님 결정 2026-07-29).
const APP_TAG = "tripis";

/** Stripe 클라이언트 1벌 = 요청마다 만든다(워커 isolate 는 여러 요청이 재사용 = 요청 데이터를 전역에 두지 않는다. 생성은 네트워크 없는 계산이라 싸다).
 *  httpClient = Stripe.createFetchHttpClient() 가 Worker 필수(파일 머리말 근거). */
function makeStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("stripe_key_missing");
  return new Stripe(key, {
    apiVersion: STRIPE_API_VERSION,
    httpClient: Stripe.createFetchHttpClient(),
  });
}

/**
 * 열쇠를 채운 뒤 Stripe 클라이언트를 만든다.
 * Worker 는 요청 밖 I/O 가 금지되므로 첫 요청에서 DB api_keys → process.env 를 채운다(keys.ts).
 * src.ts:105 withKeys() 와 같은 형태 = 연결 1벌 → ensureKeys → finally 로 반드시 닫기.
 */
async function stripeWithKeys(openSql: OpenSql): Promise<Stripe> {
  const client = openSql();
  try {
    await ensureKeys(client);
  } finally {
    // ⚠️ 수정금지(승인필요) 2026-09-13 사장님 결정 = 응답 뒤 끊기는 약속을 waitUntil 로 살려 실제로 닫는다(src.ts·generate-db 와 같은 수리 = 풀러 칸 누수)
    waitUntil(client.end({ timeout: 5 }));
  }
  return makeStripe();
}

// ⚠️ 수정금지(승인필요) 2026-08-14 사장님 승인 = Stripe 결제창 다국어.
// checkoutText — 문구 그대로.
function checkoutText(lang: string): { name: string; desc: string } {
  const base = PURCHASE_CREDITS - PURCHASE_BONUS;
  const bonus = PURCHASE_BONUS;
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

/** 충전 = 장부 1벌(addCredits)에 type 'purchase' 로 쓴다. ⚠️ 이중충전 차단은 코드가 아니라 **DB 규칙**(§9) = 부분 유니크 인덱스 credit_transactions_purchase_ref_uniq
 *  (shared/schema/credits.ts, WHERE type='purchase' AND reference_id IS NOT NULL) = 같은 refId 가 두 번 오면 INSERT 가 23505 로 튕기고 트랜잭션이 통째로 롤백된다.
 *  충전 알림(web-push)은 워커에 없다 = 충전(돈) 자체에는 영향 없음. */
async function processPurchase(
  db: Db,
  userId: string,
  stripePaymentId: string,
): Promise<number> {
  return await addCredits(
    db,
    userId,
    PURCHASE_CREDITS,
    "purchase",
    `크레딧 충전 ${PURCHASE_CREDITS} (100 기본 + 40 보너스)`,
    stripePaymentId,
  );
}

type FulfillResult =
  | { outcome: "credited"; balance: number }
  | { outcome: "duplicate" }
  | { outcome: "not_ours" }
  | { outcome: "no_user" };

// ⚠️ 수정금지(승인필요) 2026-08-12 사장님 승인 = **충전 집행 1벌** = 어느 진입 신호로 오든
// fulfillFromStripeRecord — 분기·판정 그대로.
async function fulfillFromStripeRecord(
  db: Db,
  refId: string,
  meta: Stripe.Metadata | null | undefined,
): Promise<FulfillResult> {
  if (meta?.app !== APP_TAG) return { outcome: "not_ours" };
  const userId = meta?.userId;
  if (!userId) return { outcome: "no_user" };
  try {
    const balance = await processPurchase(db, userId, refId);
    console.log(
      `[Payments] 충전 완료 user=${userId} ref=${refId} 잔액=${balance}`,
    );
    return { outcome: "credited", balance };
  } catch (e) {
    // 23505 = 부분 유니크 인덱스 위반 = 이미 충전된 결제(§9 이중충전 차단).
    if ((e as { code?: string })?.code === "23505")
      return { outcome: "duplicate" };
    throw e;
  }
}

// ⚠️ 수정금지(승인필요) 2026-08-12 사장님 승인 = **원장 대조 회수** = 최근 N일의 성공 결제(tripis 표식)를
// reconcilePayments — 조회 범위·판정 그대로.
async function reconcilePayments(
  db: Db,
  stripe: Stripe,
  days = 3,
): Promise<{ scanned: number; credited: number }> {
  const since = Math.floor(Date.now() / 1000) - days * 86400;
  let scanned = 0;
  let credited = 0;

  const intents = await stripe.paymentIntents.list({
    created: { gte: since },
    limit: 100,
  });
  for (const pi of intents.data) {
    if (pi.status !== "succeeded" || pi.metadata?.app !== APP_TAG) continue;
    scanned++;
    const r = await fulfillFromStripeRecord(db, pi.id, pi.metadata);
    if (r.outcome === "credited") credited++;
  }

  const sessions = await stripe.checkout.sessions.list({
    created: { gte: since },
    limit: 100,
  });
  for (const s of sessions.data) {
    if (s.payment_status !== "paid" || s.metadata?.app !== APP_TAG) continue;
    scanned++;
    const r = await fulfillFromStripeRecord(db, s.id, s.metadata);
    if (r.outcome === "credited") credited++;
  }

  if (credited > 0)
    console.log(
      `[Payments] 원장 대조 회수: ${credited}건 충전(검사 ${scanned}건)`,
    );
  return { scanned, credited };
}

// ⚠️ 수정금지(승인필요) 2026-08-05 = 결제 끝나고 **돌아올 주소**를 고르는 곳 1벌.
// pickReturnBase — 판정 그대로.
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

/** 크레딧 0 고정 테스트 계정 판별. */
function isNoTopupTestAccount(email: string | null | undefined): boolean {
  return !!email && /^c0@.+\.test$/i.test(email);
}

/**
 * ⚠️ 수정금지(승인필요) 2026-09-06 사장님 결정 = 충전 유일 경로(§9) = **express.json() 보다 먼저** 등록한다.
 *
 * 왜 따로 떼어 놨나:
 *   Stripe 서명검증은 **가공 안 된 원본 바이트**로만 된다.
 *   공식 docs.stripe.com/webhooks/signature = "Si vous utilisez la bibliothèque stripe-node avec
 *   Express, assurez-vous que `app.use(express.json())` est placée *après* l'acheminement du webhook.
 *   Dans Express, l'ordre de configuration du middleware est important." + 그 예시
 *     app.post('/webhook', ...);   // Webhook route in its original request form
 *     app.use(express.json());     // Parse the request body in JSON for other routes
 *   전역 express.json() 이 먼저 걸리면 본문 스트림이 이미 소비되어(gotchas.md:15 "Body has already
 *   been used") 원본 바이트가 사라진다. req.body 를 JSON.stringify 로 되돌리면 공백·키순서가
 *   달라져 서명이 반드시 어긋난다 = 모든 충전이 조용히 실패.
 *   그래서 이 1개 라우트만 express.raw({type:"application/json"}) 로 Buffer 를 받는다.
 */
export function registerPaymentWebhookRoute(
  app: Express,
  openDb: OpenDb,
  openSql: OpenSql,
): void {
  app.post(
    "/api/payments/webhook",
    express.raw({ type: "application/json", limit: "10mb" }),
    async (req: Request, res: Response) => {
      const signature = req.headers["stripe-signature"];
      const rawBody: unknown = req.body;

      // 열쇠(STRIPE_WEBHOOK_SECRET·STRIPE_SECRET_KEY)는 DB api_keys 에 있다(keys.ts).
      // Worker 는 요청 밖 I/O 가 금지되므로 여기서 채운 **뒤에** process.env 를 읽는다.
      let stripe: Stripe;
      let secret: string | undefined;
      try {
        stripe = await stripeWithKeys(openSql);
        secret = process.env.STRIPE_WEBHOOK_SECRET;
      } catch (e) {
        console.error(
          "[Payments] 웹훅 준비 안 됨(키·서명·본문 누락) → 재전송 유도",
          (e as Error)?.message,
        );
        return res.status(503).json({ error: "webhook_not_ready" });
      }

      if (!secret || !signature || !Buffer.isBuffer(rawBody)) {
        console.error(
          "[Payments] 웹훅 준비 안 됨(키·서명·본문 누락) → 재전송 유도",
        );
        return res.status(503).json({ error: "webhook_not_ready" });
      }

      let event: Stripe.Event;
      try {
        // Worker 는 동기 constructEvent 불가(Node crypto 없음) = 비동기 + SubtleCrypto (파일 머리말 근거).
        event = await stripe.webhooks.constructEventAsync(
          rawBody,
          signature as string,
          secret,
          undefined,
          Stripe.createSubtleCryptoProvider(),
        );
      } catch (e) {
        console.error("[Payments] 웹훅 서명 검증 실패:", (e as Error)?.message);
        return res.status(400).json({ error: "invalid_signature" });
      }

      let refId: string;
      let meta: Stripe.Metadata | null;
      if (event.type === "checkout.session.completed") {
        const session = event.data.object;
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
        const intent = event.data.object;
        refId = intent.id;
        meta = intent.metadata;
      } else {
        return res.json({ received: true });
      }

      const { db, close } = openDb();
      try {
        const r = await fulfillFromStripeRecord(db, refId, meta);
        if (r.outcome === "not_ours")
          console.log("[Payments] 우리 앱 결제가 아님 = 충전 안 함:", refId);
        else if (r.outcome === "no_user")
          console.warn(
            "[Payments] 통보에 userId 없음 = 충전 대상 불명:",
            refId,
          );
        else if (r.outcome === "duplicate")
          console.log("[Payments] 중복 통보 무시(이미 충전됨):", refId);
      } catch (e) {
        console.error("[Payments] 충전 실패:", (e as Error)?.message);
        return res.status(500).json({ error: "fulfillment_failed" });
      } finally {
        close();
      }

      res.json({ received: true });
    },
  );
}

// ── 라우트 ─────────────────────────────────

export function registerPaymentRoutes(
  app: Express,
  openDb: OpenDb,
  openSql: OpenSql,
): void {
  // ── 결제창 만들기 = POST /api/payments/checkout = ⚠️ 웹 전용
  //    (2026-08-12 사장님 승인 = 폰은 아래 결제 시트로 전환).
  app.post("/api/payments/checkout", async (req: Request, res: Response) => {
    const { db, close } = openDb();
    try {
      const userId = getUserIdFromReq(req);
      if (!userId) return res.status(401).json({ error: "login_required" });

      const user = await getUser(db, userId);

      // ⚠️ 수정금지(승인필요) 2026-08-08 사장님 확정 = **크레딧 0 고정 계정은 충전을 막는다.**
      if (isNoTopupTestAccount(user?.email)) {
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
      const stripe = await stripeWithKeys(openSql);

      const session = await stripe.checkout.sessions.create({
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
    } catch (e) {
      const message = (e as Error)?.message;
      if (message === "stripe_key_missing") {
        console.error(
          "[Payments] STRIPE_SECRET_KEY 미등록(관리자 화면에서 등록 필요)",
        );
        return res.status(503).json({ error: "stripe_key_missing" });
      }
      console.error("[Payments] 결제창 생성 실패:", message);
      res.status(502).json({ error: "checkout_failed" });
    } finally {
      close();
    }
  });

  // ── 폰 결제 시트용 결제 생성 = POST /api/payments/sheet-intent (2026-08-12 사장님 승인)
  app.post(
    "/api/payments/sheet-intent",
    async (req: Request, res: Response) => {
      const { db, close } = openDb();
      try {
        const userId = getUserIdFromReq(req);
        if (!userId) return res.status(401).json({ error: "login_required" });

        const user = await getUser(db, userId);
        if (isNoTopupTestAccount(user?.email)) {
          return res.status(403).json({ error: "test_account_no_topup" });
        }

        const stripe = await stripeWithKeys(openSql);
        const intent = await stripe.paymentIntents.create({
          amount: PRICE_EUR * 100,
          currency: "eur",
          payment_method_types: ["card"],
          description: `Tripis 크레딧 충전 (${PURCHASE_CREDITS})`,
          metadata: { userId, app: APP_TAG },
        });
        res.json({ clientSecret: intent.client_secret, intentId: intent.id });
      } catch (e) {
        const message = (e as Error)?.message;
        if (message === "stripe_key_missing") {
          return res.status(503).json({ error: "stripe_key_missing" });
        }
        console.error("[Payments] 시트 결제 생성 실패:", message);
        res.status(502).json({ error: "sheet_intent_failed" });
      } finally {
        close();
      }
    },
  );

  // ⚠️ POST /api/payments/confirm = §9 가 금지하는 "클라이언트가 부르는 충전"이 아니다: 금액·대상은 클라이언트가 못 정하고,
  //    Stripe 에 실제로 결제됐는지 다시 물어(paymentIntents.retrieve) 성공한 결제만 집행한다. 소유자 확인(metadata.userId)도 한다.
  //    중복은 DB 규칙(credit_transactions_purchase_ref_uniq)이 막는다.
  app.post("/api/payments/confirm", async (req: Request, res: Response) => {
    const { db, close } = openDb();
    try {
      const userId = getUserIdFromReq(req);
      if (!userId) return res.status(401).json({ error: "login_required" });
      const intentId = String(req.body?.intentId || "");
      if (!/^pi_[A-Za-z0-9]+$/.test(intentId))
        return res.status(400).json({ error: "bad_intent_id" });

      const stripe = await stripeWithKeys(openSql);
      const pi = await stripe.paymentIntents.retrieve(intentId);
      if (pi.metadata?.userId !== userId)
        return res.status(403).json({ error: "not_your_payment" });
      if (pi.status !== "succeeded")
        return res
          .status(409)
          .json({ error: "not_succeeded", status: pi.status });

      const r = await fulfillFromStripeRecord(db, pi.id, pi.metadata);
      if (r.outcome === "credited")
        return res.json({ ok: true, balance: r.balance });
      if (r.outcome === "duplicate")
        return res.json({
          ok: true,
          balance: await getBalance(db, userId),
        });
      return res.status(409).json({ error: r.outcome });
    } catch (e) {
      console.error("[Payments] 즉시 확인 실패:", (e as Error)?.message);
      res.status(502).json({ error: "confirm_failed" });
    } finally {
      close();
    }
  });

  // ── 수동 원장 대조 = POST /api/admin/payments/reconcile.
  app.post(
    "/api/admin/payments/reconcile",
    async (req: Request, res: Response) => {
      const { db, close } = openDb();
      try {
        const uid = getUserIdFromReq(req);
        if (!uid) return res.status(401).json({ error: "login_required" });
        if ((await getRoleFromDb(db, uid)) !== "admin")
          return res.status(403).json({ error: "admin_only" });
        const stripe = await stripeWithKeys(openSql);
        res.json({
          success: true,
          ...(await reconcilePayments(db, stripe, 3)),
        });
      } catch (e) {
        console.error("[Payments] 수동 원장 대조 실패:", (e as Error)?.message);
        res.status(500).json({ error: "reconcile_failed" });
      } finally {
        close();
      }
    },
  );
}
