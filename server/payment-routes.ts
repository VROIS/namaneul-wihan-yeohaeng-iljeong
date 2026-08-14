// ⚠️ 수정금지(승인필요) 2026-07-29 사장님 SSOT = 결제(Stripe)·크레딧 API (CLAUDE.md §9).
//   정본 문서 = docs/2026-07-29 결제·크레딧 구현.md
//   '내손앱'(내손안에 가이드) 의 검증된 충전을 이식. 금액·크레딧 정본 = server/creditService.ts 의 CREDIT_CONFIG 1벌.
//
//   ⚠️⚠️ 충전 확정 경로는 **스트라이프 직접 통보(웹훅) 1개뿐**이다. 클라이언트가 부르는 충전 엔드포인트를 만들지 마라(§0).
//     내손앱(TWA)은 결제 후 복귀한 페이지의 JS+쿠키로 확정했지만, Tripis(RN)는 앱이 브라우저가 아니라
//     그 복귀 페이지를 받지 못한다 = 부를 주체가 아예 없다. 그래서 서버↔서버 통보 1벌로 간다.
//   결제 진입 2갈래(2026-08-12 사장님 승인) = 웹: Stripe 결제창(checkout) / 폰: 네이티브 결제 시트(sheet-intent).
//     둘 다 충전 확정은 웹훅 1곳(이벤트만 각각 checkout.session.completed / payment_intent.succeeded).
import type { Express, Request, Response } from "express";
import Stripe from "stripe";
import { creditService, CREDIT_CONFIG } from "./creditService";
import { CREDIT_COSTS } from "./credit-charge";
import { getUserIdFromReq } from "./auth-user";

// ⚠️ stripe 22.3.2 가 고정한 API 버전과 **같은 문자열**(node_modules/stripe/cjs/apiVersion.js 실측 2026-07-29).
//   `as any` 캐스트 금지 = 캐스트는 버전이 어긋난 것을 조용히 숨긴다. 타입이 거부하면 SDK 가 올라간 것이니 이 문자열을 고쳐라.
const STRIPE_API_VERSION = "2026-06-24.dahlia";

// ⚠️ 스트라이프 연결은 **요청이 올 때** 만든다. 키는 서버가 켜진 뒤 api_keys 표에서 process.env 로 올라오므로
//   (server/index.ts 의 listen 콜백) 파일을 읽는 시점에 만들면 반드시 키가 없다.
//   캐시 기준을 현재 키 값으로 두어, 사장님이 관리자 화면에서 키를 갈아끼우면 **서버 재시작 없이** 반영된다.
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

// 충전 1회로 들어가는 크레딧 = CREDIT_CONFIG 1벌에서만 읽는다(금액·크레딧을 여기 하드코딩하지 마라).
const PURCHASE_CREDITS = CREDIT_CONFIG.PURCHASE_CREDITS;
const PRICE_EUR = CREDIT_CONFIG.PRICE_EUR;

// ⚠️ 수정금지(승인필요) 2026-08-14 사장님 승인 = Stripe 결제창 다국어.
//   locale = Stripe 자체 UI(카드/이메일/결제방식 등)를 Stripe가 이미 7개 언어로 번역해서 자동 표시
//   (공식문서 확인, 우리 언어코드 ko/en/fr/es/de/ja/zh 와 1:1 일치 = 매핑표 불필요).
//   우리가 직접 쓰는 건 상품명·설명 2줄뿐. user.preferredLanguage = 이미 조회된 값 재사용(§16, 새 쿼리 없음).
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
//   결제창을 만들 때 붙이고, 통보를 받을 때 이 값이 맞는지 확인한다 = 두 앱의 결제가 섞이지 않는다.
const APP_TAG = "tripis";

// ⚠️ 수정금지(승인필요) 2026-08-12 사장님 승인 = **충전 집행 1벌** = 어느 진입 신호(웹훅·앱 즉시확인·일일 원장대조)로 오든
//   판정 재료는 Stripe 원장 기록(refId·metadata)이고 집행은 이 함수 하나다(§0). 이중충전 = DB 규칙(23505)이 차단.
//   §9 개정(2026-08-12): "진실 = Stripe 원장 / 진입 신호 3종 / 집행 = 이 1벌". 클라이언트의 주장으로 충전하는 경로는 여전히 0개.
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
//   Stripe 에서 읽어 장부에 없는 건을 충전 집행 1벌로 채운다. 웹훅 유실·구독 누락·서버 잠듦 = 전부 자동 회수.
//   호출처 = 서버 부팅 1회 + 스케줄러 매일 + 관리자 수동 라우트(3곳 모두 이 1벌).
export async function reconcilePayments(days = 3): Promise<{
  scanned: number;
  credited: number;
}> {
  const since = Math.floor(Date.now() / 1000) - days * 86400;
  let scanned = 0;
  let credited = 0;
  // 시트 결제(PaymentIntent) + 웹 결제창(Checkout Session) 양쪽 원장을 같은 규칙으로 훑는다.
  const intents = await stripe().paymentIntents.list({
    created: { gte: since },
    limit: 100,
  });
  for (const pi of intents.data) {
    if (pi.status !== "succeeded" || pi.metadata?.app !== APP_TAG) continue;
    scanned++;
    // 사전 조회 없이 집행 1벌에 바로 = 이미 충전된 건은 DB 규칙(23505)이 duplicate 로 돌려줌(같은 물리 차단).
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
//   서버가 켜질 때 우리 엔드포인트의 구독 이벤트 2종을 검사하고, 빠져 있으면 직접 등록한다(설정을 코드가 보증).
//   (2026-08-12 사고 실측 = 대시보드에서 payment_intent.succeeded 추가가 저장되지 않아 시트 충전이 전면 유실됐었다)
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

// 부팅 자가치유 1벌 = 구독 보증 + 원장 대조(놓친 충전 회수). 실패해도 서버는 뜬다(로그만).
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
//   브라우저가 알려 준 화면 주소(Origin)가 **우리 것이면** 그리로, 아니면 요청받은 주소로.
//   (아무 주소나 받으면 결제 후 낯선 사이트로 보내는 통로가 된다.)
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
  // ── 1) 잔액 = GET /api/credits/balance ──
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

  // ── 2) 거래내역 = GET /api/credits/transactions?limit=20 ──
  //   응답의 balance = 그 거래 직후 잔액(creditService 가 현재 잔액에서 역산). 상한 100(과도한 조회 방지).
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

  // ── 3) 요금·단가표 = GET /api/credits/pricing (공개) ──
  //   ⚠️ 화면은 단가를 하드코딩하지 말고 **이 응답을 읽어** 표시한다 = 단가가 서버·화면 두 벌로 갈라지지 않게(§0).
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
  //   내손앱과 같은 방식 = 스트라이프에 상품을 미리 만들지 않고 그때그때 금액 지정(price_data).
  app.post("/api/payments/checkout", async (req: Request, res: Response) => {
    try {
      const userId = getUserIdFromReq(req);
      if (!userId) return res.status(401).json({ error: "login_required" });

      const user = await creditService.getUserProfile(userId);

      // ⚠️ 수정금지(승인필요) 2026-08-08 사장님 확정 = **크레딧 0 고정 계정은 충전을 막는다.**
      //   왜: 이 계정은 잔액부족(402) 화면을 언제든 재현하려고 두는 것이라, 충전되면 그 용도가 사라진다.
      //   규칙 = 주소가 `c0@` 로 시작하고 테스트 도메인(@t.test) 이면 크레딧 0 고정 계정(= c5@ 처럼 늘릴 수 있는 규칙).
      if (user?.email && /^c0@.+\.test$/i.test(user.email)) {
        return res.status(403).json({ error: "test_account_no_topup" });
      }

      // ⚠️ 수정금지(승인필요) 2026-08-05 사장님 실조작 SSOT = **결제 끝나고 돌아올 주소**.
      //   사장님이 로컬에서 직접 결제해 보시고 잡아낸 것: 돌아온 주소가 `https://localhost:5000` 이라
      //   화면이 안 뜨고 `ERR_SSL_PROTOCOL_ERROR` 가 났다. 이유 두 가지였다.
      //     ① 프로토콜을 https 로 **고정**했는데 로컬은 http 다 → 접속 자체가 실패.
      //     ② 화면이 사는 곳(로컬 8082)과 서버(5000)가 **다른 주소**인데 서버 주소로 돌아오게 했다.
      //   그래서 이렇게 정한다:
      //     · 브라우저가 알려 준 **화면 주소(Origin)** 가 있으면 그리로 돌아온다 = 화면이 있는 곳이 정답.
      //     · 없으면(폰 앱에서 직접 호출) 요청받은 호스트로 돌아오되 **https 로 붙인다.**
      //       ⚠️ 여기서 `req.protocol` 을 쓰면 안 된다 — 프록시(Replit) 뒤에서는 그 값이 항상 'http' 라
      //       폰 결제 복귀 주소가 http 로 떨어진다(옛 코드가 https 를 고정해 둔 이유가 이것이다).
      //       프록시가 진짜 값을 알려주면(`x-forwarded-proto`) 그걸 우선 쓴다.
      //   ⚠️ 아무 주소나 받으면 결제 후 낯선 사이트로 보내는 통로가 된다 → **우리 것일 때만** 쓴다.
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
        // ⚠️ card 고정 = 의도적. 빼면 대시보드 설정에 따라 지연결제 수단(SEPA 등)이 켜지고
        //   async_payment_succeeded 라는 **두 번째 충전 경로**가 필요해진다(§0 위반). 애플·구글페이는 card 에 포함된다.
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
                // 기본/보너스 숫자를 글로 박지 않고 CREDIT_CONFIG 에서 계산 = 상수가 바뀌면 문구도 따라감(2026-07-29 §0).
                description: lang.desc,
              },
              unit_amount: PRICE_EUR * 100,
            },
            quantity: 1,
          },
        ],
        // ⚠️ 수정금지(승인필요) 2026-08-06 = 이 `?payment=` 를 화면이 읽어 **첫 화면을 프로필(충전소)로** 연다.
        //   읽는 곳 = client/lib/paymentReturn.ts(판별 1벌) → client/navigation/MainTabNavigator.tsx(첫 화면 결정).
        //   그 처리가 없으면 복귀 화면이 홈(여정플래너)이라 사용자가 충전됐는지 알 수 없다
        //   (사장님 TestFlight·로컬 실증으로 발견 2026-08-05~06).
        //   ⚠️ 이 파라미터 이름을 바꾸면 그 두 파일도 같이 바꿔야 한다(한 쌍).
        success_url: `${baseUrl}/?payment=success&session_id={CHECKOUT_SESSION_ID}`,
        // ⚠️ 수정금지(승인필요) 2026-08-08 사장님 APK 실증 = 옛 cancel_url 완전삭제 §19.
        //   증상: 결제창 안의 `←` 를 누르면 **다른 사람 프로필**(안드로이드) 또는 **비로그인 홈**(아이폰)이 떴다.
        //   원인: 결제창은 앱과 별개 브라우저(Chrome Custom Tab / SFSafariViewController) 라,
        //        cancel_url(= 우리 웹앱 전체 주소) 로 가면 **그 브라우저에 로그인돼 있던 계정**으로 앱이 통째로 다시 뜬다.
        //   근거: Stripe 공식 문서 = "**If set**, Checkout displays a back button" = 이 값을 주면 back 버튼이 생긴다.
        //   → 값을 주지 않으면 버튼 자체가 안 그려진다. 그냥 돌아오려면 창을 닫으면 된다(X·∨ = 이미 정상 동작).
        customer_email: user?.email || undefined,
        // 통보가 왔을 때 누구에게 넣을지 = userId 1개로만 판단(크레딧 수는 CREDIT_CONFIG 가 정본이라 metadata 에 안 넣음).
        // ⚠️ app 표식 = 내손앱과 **같은 Stripe 계정**을 쓰므로 필요하다(2026-07-30).
        //   표식이 없으면 내손앱 손님의 결제 통보까지 이 서버가 받아 Tripis 크레딧을 만들어 버린다
        //   (내손앱 계정 형식이 Tripis DB 에도 실존하므로 실제로 들어간다) = 장부가 틀어짐.
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
  //   ⚠️ 사장님 SSOT = 사용자 화면·클릭 최소: 시트는 앱 위 오버레이라 브라우저·복귀 주소·안내 화면이 아예 없다.
  //   금액·크레딧·차단·표식 = 위 checkout 과 같은 정본 1벌(CREDIT_CONFIG·APP_TAG·c0@ 규칙).
  //   충전 확정은 여기가 아니라 웹훅(payment_intent.succeeded) 1경로(§9).
  app.post(
    "/api/payments/sheet-intent",
    async (req: Request, res: Response) => {
      try {
        const userId = getUserIdFromReq(req);
        if (!userId) return res.status(401).json({ error: "login_required" });

        const user = await creditService.getUserProfile(userId);
        // 크레딧 0 고정 테스트 계정 = 충전 차단(checkout 과 같은 규칙 = 402 재현용 계정 보호)
        if (user?.email && /^c0@.+\.test$/i.test(user.email)) {
          return res.status(403).json({ error: "test_account_no_topup" });
        }

        const intent = await stripe().paymentIntents.create({
          amount: PRICE_EUR * 100,
          currency: "eur",
          // ⚠️ card 고정 = checkout 과 같은 이유 = 지연결제 수단이 켜지면 두 번째 충전 경로가 필요해진다(§0).
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

  // ── 5) 스트라이프 직접 통보 = POST /api/payments/webhook = ⚠️ 충전이 확정되는 유일한 곳 ──
  //   서명 원본 바이트는 server/index.ts:63-75 의 express.json({verify}) 가 이미 req.rawBody 에 담아둔다 = 별도 raw 마운트 불필요.
  app.post("/api/payments/webhook", async (req: Request, res: Response) => {
    const secret = process.env.STRIPE_WEBHOOK_SECRET;
    const signature = req.headers["stripe-signature"];

    // 키가 아직 안 올라온 부팅 직후 구간 = 503 으로 답한다(200 금지). 스트라이프가 자동 재전송해 스스로 복구된다.
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
      // 서명 불일치 = 위조 또는 키 불일치. 재전송해도 같으므로 400(재시도 유도 안 함).
      console.error("[Payments] 웹훅 서명 검증 실패:", e?.message);
      return res.status(400).json({ error: "invalid_signature" });
    }

    // 처리하는 통보 2종 = 웹 결제창(checkout.session.completed) + 폰 결제 시트(payment_intent.succeeded).
    //   경로가 2종이어도 충전 확정은 이 웹훅 1곳 + processPurchase 1벌(§9) = 이중충전 차단 DB규칙도 공유.
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
      // succeeded 이벤트 = 결제 완료일 때만 발생 = 별도 상태 검사 불필요.
      const intent = event.data.object as Stripe.PaymentIntent;
      refId = intent.id;
      meta = intent.metadata;
    } else {
      return res.json({ received: true });
    }

    // 판정·집행 = 충전 집행 1벌(fulfillFromStripeRecord §0). 표식(app=tripis) 검사도 그 안 =
    //   내손앱과 같은 Stripe 계정이라 남의 결제 통보가 섞여 와도 장부가 안 틀어진다(2026-07-30 원칙 유지).
    try {
      const r = await fulfillFromStripeRecord(refId, meta);
      if (r.outcome === "not_ours")
        console.log("[Payments] 우리 앱 결제가 아님 = 충전 안 함:", refId);
      else if (r.outcome === "no_user")
        console.warn("[Payments] 통보에 userId 없음 = 충전 대상 불명:", refId);
      else if (r.outcome === "duplicate")
        console.log("[Payments] 중복 통보 무시(이미 충전됨):", refId);
    } catch (e: any) {
      // 집행 오류 = 500 으로 답해 스트라이프의 자동 재전송을 복구 수단으로 쓴다(+일일 원장 대조가 최후망).
      console.error("[Payments] 충전 실패:", e?.message);
      return res.status(500).json({ error: "fulfillment_failed" });
    }

    res.json({ received: true });
  });

  // ── 6) 앱 즉시 확인 = POST /api/payments/confirm = 시트가 닫히는 순간 충전 반영(내손앱과 같은 즉시성) ──
  //   ⚠️ 클라이언트의 "주장"으로 충전하지 않는다(§9) = 앱은 결제 번호(신호)만 주고,
  //     서버가 Stripe 원장에서 그 결제를 **직접 조회**해 성공·표식·소유자를 확인한 뒤 집행 1벌로 충전한다.
  //     가짜 번호 = Stripe 조회에서 실패 / 남의 결제 번호 = 소유자 불일치 403 / 재호출 = DB 규칙이 이중충전 차단.
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

  // ── 7) 관리자 수동 원장 대조 = POST /api/admin/payments/reconcile (스케줄러·부팅과 같은 함수 1벌) ──
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

  // (옛 6번 결제 상태 조회 라우트 = 폰이 결제 시트로 전환되며 호출자 0 = 완전삭제 2026-08-12 §19)
}
