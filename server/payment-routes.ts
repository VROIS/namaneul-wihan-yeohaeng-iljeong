// ⚠️ 수정금지(승인필요) 2026-07-29 사장님 SSOT = 결제(Stripe)·크레딧 API (CLAUDE.md §9).
//   정본 문서 = docs/2026-07-29 결제·크레딧 구현.md
//   '내손앱'(내손안에 가이드) 의 검증된 충전을 이식. 금액·크레딧 정본 = server/creditService.ts 의 CREDIT_CONFIG 1벌.
//
//   ⚠️⚠️ 충전 확정 경로는 **스트라이프 직접 통보(웹훅) 1개뿐**이다. 클라이언트가 부르는 충전 엔드포인트를 만들지 마라(§0).
//     내손앱(TWA)은 결제 후 복귀한 페이지의 JS+쿠키로 확정했지만, Tripis(RN)는 앱이 브라우저가 아니라
//     그 복귀 페이지를 받지 못한다 = 부를 주체가 아예 없다. 그래서 서버↔서버 통보 1벌로 간다.
//   /api/payments/session/:id 는 **읽기 전용**(결제됐나·크레딧 들어갔나 조회) = 화면의 "처리 중" 안내용. 쓰기 금지.
import type { Express, Request, Response } from "express";
import Stripe from "stripe";
import { db as _db } from "./db";
import { creditTransactions } from "@shared/schema";
import { and, eq } from "drizzle-orm";
import { creditService, CREDIT_CONFIG } from "./creditService";
import { CREDIT_COSTS } from "./credit-charge";
import { getUserIdFromReq } from "./auth-user";

// db 널 가드 = expert-routes.ts 와 같은 규약 1벌(각 핸들러 try/catch 가 500 처리)
function db() {
  if (!_db) throw new Error("db_unavailable");
  return _db;
}

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

// ⚠️ 우리 앱이 만든 결제라는 표식. 내손앱과 같은 Stripe 계정을 쓰기 때문에 필요하다(사장님 결정 2026-07-29).
//   결제창을 만들 때 붙이고, 통보를 받을 때 이 값이 맞는지 확인한다 = 두 앱의 결제가 섞이지 않는다.
const APP_TAG = "tripis";

// 이미 충전 처리된 결제인지 = 장부의 결제 줄 1건 조회(읽기 전용).
async function findPurchaseRow(sessionId: string) {
  const [row] = await db()
    .select()
    .from(creditTransactions)
    .where(
      and(
        eq(creditTransactions.type, "purchase"),
        eq(creditTransactions.referenceId, sessionId),
      ),
    )
    .limit(1);
  return row ?? null;
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
    });
  });

  // ── 4) 결제창 만들기 = POST /api/payments/checkout ──
  //   내손앱과 같은 방식 = 스트라이프에 상품을 미리 만들지 않고 그때그때 금액 지정(price_data).
  app.post("/api/payments/checkout", async (req: Request, res: Response) => {
    try {
      const userId = getUserIdFromReq(req);
      if (!userId) return res.status(401).json({ error: "login_required" });

      const user = await creditService.getUserProfile(userId);

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

      const session = await stripe().checkout.sessions.create({
        mode: "payment",
        // ⚠️ card 고정 = 의도적. 빼면 대시보드 설정에 따라 지연결제 수단(SEPA 등)이 켜지고
        //   async_payment_succeeded 라는 **두 번째 충전 경로**가 필요해진다(§0 위반). 애플·구글페이는 card 에 포함된다.
        payment_method_types: ["card"],
        line_items: [
          {
            price_data: {
              currency: "eur",
              product_data: {
                name: "Tripis 크레딧 충전",
                // 기본/보너스 숫자를 글로 박지 않고 CREDIT_CONFIG 에서 계산 = 상수가 바뀌면 문구도 따라감(2026-07-29 §0).
                description: `${PURCHASE_CREDITS} 크레딧 (기본 ${PURCHASE_CREDITS - CREDIT_CONFIG.PURCHASE_BONUS} + 보너스 ${CREDIT_CONFIG.PURCHASE_BONUS})`,
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
        cancel_url: `${baseUrl}/?payment=cancel`,
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

    // 처리하는 통보는 이 1종뿐. 나머지는 받았다고만 답한다.
    if (event.type !== "checkout.session.completed") {
      return res.json({ received: true });
    }

    const session = event.data.object as Stripe.Checkout.Session;

    if (session.payment_status !== "paid") {
      console.log(
        `[Payments] 결제 미완료 상태(${session.payment_status}) = 충전 안 함:`,
        session.id,
      );
      return res.json({ received: true });
    }

    // ⚠️ 수정금지(승인필요) 2026-07-30 = **우리가 만든 결제인지** 먼저 확인한다.
    //   내손앱과 같은 Stripe 계정이라 이 끝점은 내손앱 결제 통보도 받는다. 표식을 안 보면
    //   내손앱 손님의 €10 이 Tripis 크레딧까지 만들어 장부가 틀어진다(우리가 만든 세션에만 이 표식이 붙는다).
    if (session.metadata?.app !== APP_TAG) {
      console.log(
        "[Payments] 우리 앱 결제가 아님 = 충전 안 함:",
        session.id,
        session.metadata?.app ?? "(표식 없음)",
      );
      return res.json({ received: true });
    }

    const userId = session.metadata?.userId;
    if (!userId) {
      // stripe trigger 로 만든 가짜 통보 등 = 넣을 대상이 없음. 재전송은 무의미하므로 200.
      console.warn(
        "[Payments] 통보에 userId 없음 = 충전 대상 불명:",
        session.id,
      );
      return res.json({ received: true });
    }

    try {
      const balance = await creditService.processPurchase(userId, session.id);
      console.log(
        `[Payments] 충전 완료 user=${userId} session=${session.id} 잔액=${balance}`,
      );
    } catch (e: any) {
      // 23505 = DB 규칙(credit_transactions_purchase_ref_uniq) 위반 = 같은 결제를 이미 충전함(통보 재전송).
      //   장부 줄 INSERT 가 거부되면 잔액 UPDATE 는 실행조차 안 되므로 이중지급이 물리적으로 불가능하다.
      if (e?.code === "23505") {
        console.log("[Payments] 중복 통보 무시(이미 충전됨):", session.id);
        return res.json({ received: true });
      }
      // 그 외 오류 = 500 으로 답해 스트라이프의 자동 재전송을 복구 수단으로 쓴다.
      console.error("[Payments] 충전 실패:", e?.message);
      return res.status(500).json({ error: "fulfillment_failed" });
    }

    res.json({ received: true });
  });

  // ── 6) 결제 상태 조회 = GET /api/payments/session/:sessionId = ⚠️ 읽기 전용(쓰기 금지) ──
  //   화면이 결제창에서 돌아온 뒤 "처리 중"인지 "완료"인지 판단하는 용도. 크레딧을 넣지 않는다(그건 웹훅 1벌).
  app.get(
    "/api/payments/session/:sessionId",
    async (req: Request, res: Response) => {
      try {
        const userId = getUserIdFromReq(req);
        if (!userId) return res.status(401).json({ error: "login_required" });

        const session = await stripe().checkout.sessions.retrieve(
          req.params.sessionId,
        );
        // 남의 결제 상태를 훔쳐보지 못하게 = 그 결제를 시작한 사람만 조회 가능.
        if (session.metadata?.userId !== userId) {
          return res.status(403).json({ error: "not_owner" });
        }

        // 이 두 가지만 답한다. 잔액은 화면이 /api/credits/balance 로 따로 읽으므로 여기 넣으면 조회 1건이 헛돈다.
        res.json({
          paid: session.payment_status === "paid",
          fulfilled: !!(await findPurchaseRow(session.id)),
        });
      } catch (e: any) {
        if (e?.message === "stripe_key_missing") {
          return res.status(503).json({ error: "stripe_key_missing" });
        }
        console.error("[Payments] 결제 상태 조회 실패:", e?.message);
        res.status(404).json({ error: "session_not_found" });
      }
    },
  );
}
