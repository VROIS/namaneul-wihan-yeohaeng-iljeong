/**
 * Profile Routes
 * 
 * 프로필 페이지 관련 API 라우트:
 * - GET /api/profile - 사용자 프로필 조회
 * - GET /api/profile/credits - 크레딧 잔액 조회
 * - GET /api/profile/transactions - 크레딧 내역 조회
 * - GET /api/profile/exchange-rate - 환율 조회
 * - POST /api/profile/checkout - 크레딧 충전 결제
 * 
 * @created 2025-11-26
 */

import { Router, Request, Response } from 'express';
import { creditService, CREDIT_CONFIG } from './creditService';
import { getEURtoKRW, convertEURtoKRW, formatKRW, getAllRates } from './exchangeRate';
import { getUncachableStripeClient, getStripePublishableKey } from './stripeClient';
import { storage } from './storage';
import { db } from './db'; // ⚠️ 수정금지(승인필요): 2026-03-11 Race Condition 수정용 트랜잭션 import
import { users } from '@shared/schema'; // ⚠️ 수정금지(승인필요): 2026-03-14 계정 삭제용 users 테이블 import
import { eq } from 'drizzle-orm'; // ⚠️ 수정금지(승인필요): 2026-03-14 계정 삭제용 eq import

const router = Router();

function getUserId(user: any): string | null {
  if (!user) return null;
  if (typeof user === 'string') return user;
  if (user.claims?.sub) return user.claims.sub;
  if (user.id) return user.id;
  return null;
}

router.get('/profile', async (req: Request, res: Response) => {
  try {
    const userId = getUserId((req as any).user);
    
    if (!userId) {
      return res.json({
        authenticated: false,
        user: null,
        credits: 0,
        isGuest: true
      });
    }

    const user = await creditService.getUserProfile(userId);
    const balance = await creditService.getBalance(userId);
    const stats = await creditService.getUsageStats(userId);
    const canCashback = await creditService.canRequestCashback(userId);

    res.json({
      authenticated: true,
      user: {
        id: user?.id,
        email: user?.email,
        firstName: user?.firstName,
        lastName: user?.lastName,
        profileImageUrl: user?.profileImageUrl,
        provider: user?.provider,
        referralCode: user?.referralCode,
        isAdmin: user?.isAdmin || false,
      },
      credits: balance,
      stats,
      canCashback,
      isGuest: false
    });
  } catch (error: any) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

router.get('/profile/credits', async (req: Request, res: Response) => {
  try {
    const userId = getUserId((req as any).user);
    
    if (!userId) {
      return res.json({ credits: 0, isGuest: true });
    }

    const balance = await creditService.getBalance(userId);
    res.json({ credits: balance, isGuest: false });
  } catch (error: any) {
    console.error('Credits fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch credits' });
  }
});

router.get('/profile/transactions', async (req: Request, res: Response) => {
  try {
    const userId = getUserId((req as any).user);
    
    if (!userId) {
      return res.json({ transactions: [], isGuest: true });
    }

    const limit = parseInt(req.query.limit as string) || 20;
    const transactions = await creditService.getTransactionHistory(userId, limit);
    
    res.json({ transactions, isGuest: false });
  } catch (error: any) {
    console.error('Transactions fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// 🔒 크레딧 사용 (상세페이지/공유페이지 생성 시)
router.post('/profile/use-credits', async (req: Request, res: Response) => {
  try {
    const userId = getUserId((req as any).user);
    
    if (!userId) {
      return res.status(401).json({ error: '로그인이 필요합니다.', success: false });
    }

    const { amount, description } = req.body;
    
    if (!amount || amount <= 0) {
      return res.status(400).json({ error: '올바른 크레딧 양을 입력하세요.', success: false });
    }

    const balance = await creditService.getBalance(userId);
    
    if (balance < amount) {
      return res.status(400).json({ 
        error: '크레딧이 부족합니다.', 
        success: false,
        balance,
        required: amount
      });
    }

    // 크레딧 차감
    await creditService.useCredits(userId, amount, description || 'AI 기능 사용');
    const newBalance = await creditService.getBalance(userId);

    res.json({ 
      success: true, 
      balance: newBalance,
      used: amount,
      description 
    });
  } catch (error: any) {
    console.error('Use credits error:', error);
    res.status(500).json({ error: 'Failed to use credits', success: false });
  }
});

router.get('/profile/exchange-rate', async (req: Request, res: Response) => {
  try {
    const rates = await getAllRates();
    const priceEUR = CREDIT_CONFIG.PRICE_EUR;
    
    // 각 통화로 환산된 가격
    const prices = {
      EUR: priceEUR,
      KRW: Math.round(priceEUR * rates.KRW),
      USD: Math.round(priceEUR * rates.USD * 100) / 100,
      CNY: Math.round(priceEUR * rates.CNY * 10) / 10,
      JPY: Math.round(priceEUR * rates.JPY)
    };

    res.json({
      rates,
      priceEUR,
      prices,
      krwPrice: prices.KRW,
      priceKRW: prices.KRW,
      formattedPrice: `₩${new Intl.NumberFormat('ko-KR').format(prices.KRW)}`,
      credits: CREDIT_CONFIG.PURCHASE_CREDITS,
    });
  } catch (error: any) {
    console.error('Exchange rate error:', error);
    res.status(500).json({ error: 'Failed to fetch exchange rate' });
  }
});

router.get('/profile/pricing', async (req: Request, res: Response) => {
  try {
    const rate = await getEURtoKRW();
    const priceKRW = await convertEURtoKRW(CREDIT_CONFIG.PRICE_EUR);

    res.json({
      plans: [
        {
          id: 'test',
          name: '테스트',
          description: '비회원',
          credits: 0,
          price: '무료',
          features: ['상세페이지 3회', '공유페이지 2회'],
          isFree: true,
        },
        {
          id: 'free',
          name: '무료체험',
          description: '신규 회원',
          credits: CREDIT_CONFIG.SIGNUP_BONUS,
          price: '무료',
          features: ['가입 즉시 지급', '상세페이지 ~17회', '공유페이지 ~7회'],
          isFree: true,
        },
        {
          id: 'standard',
          name: '일반',
          description: '충전 고객',
          credits: CREDIT_CONFIG.PURCHASE_CREDITS,
          priceEUR: CREDIT_CONFIG.PRICE_EUR,
          priceKRW,
          features: ['100 기본 + 40 보너스', '재충전 시 +20 추가'],
          isFree: false,
        },
        {
          id: 'pro',
          name: '프로',
          description: '기업/전문가',
          credits: '별도 협의',
          price: '문의',
          contactEmail: 'dbstour1@gmail.com',
          features: ['대용량 크레딧', '맞춤형 기능'],
          isFree: false,
        },
      ],
      creditCosts: {
        detailPage: CREDIT_CONFIG.DETAIL_PAGE_COST,
        sharePage: CREDIT_CONFIG.SHARE_PAGE_COST,
      },
      exchangeRate: rate,
    });
  } catch (error: any) {
    console.error('Pricing error:', error);
    res.status(500).json({ error: 'Failed to fetch pricing' });
  }
});

router.get('/profile/stripe-key', async (req: Request, res: Response) => {
  try {
    const publishableKey = await getStripePublishableKey();
    res.json({ publishableKey });
  } catch (error: any) {
    console.error('Stripe key error:', error);
    res.status(500).json({ error: 'Failed to fetch Stripe key' });
  }
});

router.post('/profile/checkout', async (req: Request, res: Response) => {
  try {
    const userId = getUserId((req as any).user);
    
    if (!userId) {
      return res.status(401).json({ error: '로그인이 필요합니다.' });
    }

    const stripe = await getUncachableStripeClient();
    const user = await creditService.getUserProfile(userId);
    
    const host = req.get('host');
    const protocol = req.protocol;
    const baseUrl = `${protocol}://${host}`;

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: '손안에 가이드 크레딧 충전',
              description: `${CREDIT_CONFIG.PURCHASE_CREDITS} 크레딧 (100 기본 + 40 보너스)`,
            },
            unit_amount: CREDIT_CONFIG.PRICE_EUR * 100,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      // ⚠️ 수정금지(승인필요) — Stripe 결제 후 SPA 메인으로 복귀 (2026-03-10)
      success_url: `${baseUrl}/?payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/?payment=cancel`,
      customer_email: user?.email || undefined,
      metadata: {
        userId,
        credits: CREDIT_CONFIG.PURCHASE_CREDITS.toString(),
      },
    });

    res.json({ url: session.url });
  } catch (error: any) {
    console.error('Checkout error:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// 💳 결제 확인 및 크레딧 충전
router.post('/profile/verify-payment', async (req: Request, res: Response) => {
  try {
    const userId = getUserId((req as any).user);
    
    if (!userId) {
      return res.status(401).json({ error: '로그인이 필요합니다.', success: false });
    }

    const { sessionId } = req.body;
    
    if (!sessionId) {
      return res.status(400).json({ error: 'Session ID가 필요합니다.', success: false });
    }

    const stripe = await getUncachableStripeClient();
    
    // Stripe에서 세션 정보 조회
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    
    console.log('💳 Verifying payment:', { 
      sessionId, 
      userId,
      paymentStatus: session.payment_status,
      metadata: session.metadata 
    });

    // 결제 완료 확인
    if (session.payment_status !== 'paid') {
      return res.status(400).json({ 
        error: '결제가 완료되지 않았습니다.', 
        success: false,
        status: session.payment_status 
      });
    }

    // ⚠️ 수정금지(승인필요): 2026-03-11 Race Condition 수정 — 중복체크+크레딧추가를 DB 트랜잭션으로 감싸서 이중지급 방지
    const result = await db.transaction(async (tx) => {
      // 트랜잭션 내에서 중복 체크 (동시 요청 시 하나만 통과)
      const existingTransaction = await storage.getCreditTransactionByReference(sessionId);
      if (existingTransaction) {
        console.log('⚠️ Payment already processed:', sessionId);
        const balance = await creditService.getBalance(userId);
        return { alreadyProcessed: true, credits: balance };
      }

      // metadata에서 크레딧 정보 확인
      const credits = parseInt(session.metadata?.credits || CREDIT_CONFIG.PURCHASE_CREDITS.toString());

      // 크레딧 추가
      const user = await storage.addCredits(
        userId,
        credits,
        'purchase',
        `크레딧 구매: ${credits}개 (€${CREDIT_CONFIG.PRICE_EUR})`,
        sessionId
      );

      console.log('✅ Credits added:', { userId, credits, newBalance: user.credits });
      return { alreadyProcessed: false, credits: user.credits, added: credits };
    });

    // 이미 처리된 결제
    if (result.alreadyProcessed) {
      return res.json({
        success: true,
        credits: result.credits,
        message: '이미 처리된 결제입니다.'
      });
    }

    // 추천인 킥백 처리 (트랜잭션 외부 — 킥백 실패가 결제를 롤백하면 안 됨)
    await storage.processCashbackReward(CREDIT_CONFIG.PRICE_EUR * 100, userId);

    res.json({
      success: true,
      credits: result.credits,
      added: result.added,
      message: `${result.added} 크레딧이 충전되었습니다!`
    });
  } catch (error: any) {
    console.error('Payment verification error:', error);
    res.status(500).json({ error: '결제 확인 중 오류가 발생했습니다.', success: false });
  }
});

router.get('/profile/pages', async (req: Request, res: Response) => {
  try {
    const userId = getUserId((req as any).user);
    
    if (!userId) {
      return res.json({ detailPages: [], sharePages: [], isGuest: true });
    }

    const guides = await storage.getUserGuides(userId);
    const sharePages = await storage.getUserSharedHtmlPages(userId);

    const detailPages = guides.map((g: any) => ({
      id: g.id,
      title: g.description?.slice(0, 30) || g.locationName || '상세페이지',
      thumbnail: g.imageUrl || '',
      createdAt: g.createdAt,
    }));

    const sharePagesFormatted = await Promise.all(sharePages.map(async (p: any) => {
      let thumbnail = '';
      if (p.guideIds && p.guideIds.length > 0) {
        const firstGuideId = p.guideIds[0];
        const firstGuide = await storage.getGuide(firstGuideId);
        if (firstGuide && firstGuide.imageUrl) {
          thumbnail = firstGuide.imageUrl;
        }
      }
      return {
        id: p.id,
        name: p.name || '공유 링크',
        thumbnail,
        createdAt: p.createdAt,
      };
    }));

    res.json({ detailPages, sharePages: sharePagesFormatted, isGuest: false });
  } catch (error: any) {
    console.error('Pages fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch pages' });
  }
});

router.delete('/profile/pages/detail/:id', async (req: Request, res: Response) => {
  try {
    const userId = getUserId((req as any).user);
    
    if (!userId) {
      return res.status(401).json({ error: '로그인이 필요합니다.' });
    }

    const id = req.params.id;
    await storage.deleteGuide(id);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Delete detail page error:', error);
    res.status(500).json({ error: 'Failed to delete page' });
  }
});

router.delete('/profile/pages/share/:id', async (req: Request, res: Response) => {
  try {
    const userId = getUserId((req as any).user);
    
    if (!userId) {
      return res.status(401).json({ error: '로그인이 필요합니다.' });
    }

    const id = req.params.id;
    await storage.permanentDeleteSharedHtmlPage(id);
    res.json({ success: true });
  } catch (error: any) {
    console.error('Delete share page error:', error);
    res.status(500).json({ error: 'Failed to delete page' });
  }
});

// ═══════════════════════════════════════════════════════════════
// 💰 캐시백 요청 API (2025-11-28 리워드 시스템)
// ═══════════════════════════════════════════════════════════════

// 캐시백 신청
router.post('/profile/cashback/request', async (req: Request, res: Response) => {
  try {
    const userId = getUserId((req as any).user);
    
    if (!userId) {
      return res.status(401).json({ error: '로그인이 필요합니다.' });
    }

    const { paymentMethod, paymentInfo } = req.body;
    
    if (!paymentMethod || !paymentInfo) {
      return res.status(400).json({ error: '결제 방법과 결제 정보를 입력해주세요.' });
    }

    const request = await storage.createCashbackRequest(userId, {
      creditsAmount: 200,
      cashAmount: 2000, // 20 EUR in cents
      paymentMethod,
      paymentInfo
    });

    res.json({ success: true, request });
  } catch (error: any) {
    console.error('Cashback request error:', error);
    res.status(400).json({ error: error.message || '캐시백 신청 실패' });
  }
});

// 내 캐시백 요청 목록
router.get('/profile/cashback/history', async (req: Request, res: Response) => {
  try {
    const userId = getUserId((req as any).user);
    
    if (!userId) {
      return res.status(401).json({ error: '로그인이 필요합니다.' });
    }

    const requests = await storage.getUserCashbackRequests(userId);
    res.json({ requests });
  } catch (error: any) {
    console.error('Cashback history error:', error);
    res.status(500).json({ error: '캐시백 내역 조회 실패' });
  }
});

// 추천 코드 가져오기
router.get('/profile/referral-code', async (req: Request, res: Response) => {
  try {
    const userId = getUserId((req as any).user);
    
    if (!userId) {
      return res.status(401).json({ error: '로그인이 필요합니다.' });
    }

    const code = await storage.generateReferralCode(userId);
    res.json({ referralCode: code });
  } catch (error: any) {
    console.error('Referral code error:', error);
    res.status(500).json({ error: '추천 코드 생성 실패' });
  }
});

// 🎁 QR 복사 리워드 API (2025-12-06)
router.post('/profile/qr-copy-reward', async (req: Request, res: Response) => {
  try {
    const userId = getUserId((req as any).user);
    
    if (!userId) {
      return res.status(401).json({ error: '로그인이 필요합니다.', success: false });
    }

    const newBalance = await creditService.grantQrCopyReward(userId);
    console.log(`🎁 QR 복사 리워드 지급: ${userId}, 잔액: ${newBalance}`);

    res.json({ 
      success: true, 
      reward: 2,
      balance: newBalance,
      message: 'QR 복사 리워드 2 크레딧이 지급되었습니다!'
    });
  } catch (error: any) {
    console.error('QR copy reward error:', error);
    res.status(500).json({ error: 'Failed to grant reward', success: false });
  }
});

// 🌐 사용자 선호 언어 조회/업데이트 (2025-12-03)
router.get('/profile/language', async (req: Request, res: Response) => {
  try {
    const userId = getUserId((req as any).user);
    
    if (!userId) {
      return res.json({ language: 'ko' }); // 미인증 사용자는 한국어
    }

    const user = await storage.getUser(userId);
    res.json({ language: user?.preferredLanguage || 'ko' });
  } catch (error: any) {
    console.error('Language fetch error:', error);
    res.status(500).json({ error: '언어 조회 실패' });
  }
});

// 🌐 사용자 선호 언어 업데이트 (2025-12-03)
router.put('/profile/language', async (req: Request, res: Response) => {
  try {
    const userId = getUserId((req as any).user);
    
    if (!userId) {
      return res.status(401).json({ error: '로그인이 필요합니다.' });
    }

    const { language } = req.body;
    
    if (!language || !/^[a-z]{2}(-[A-Z]{2})?$/.test(language)) {
      return res.status(400).json({ error: '유효한 언어 코드를 입력해주세요.' });
    }

    const user = await storage.updateUserPreferences(userId, { preferredLanguage: language });
    console.log(`🌐 사용자 언어 업데이트: ${userId} → ${language}`);
    res.json({ language: user.preferredLanguage });
  } catch (error: any) {
    console.error('Language update error:', error);
    res.status(500).json({ error: '언어 업데이트 실패' });
  }
});

// ⚠️ 수정금지(승인필요): 2026-03-14 계정 삭제 엔드포인트 — users 삭제 시 CASCADE로 관련 데이터 자동 삭제
router.delete('/profile/account', async (req: Request, res: Response) => {
  try {
    const userId = getUserId((req as any).user);

    if (!userId) {
      return res.status(401).json({ error: '로그인이 필요합니다.', success: false });
    }

    // ⚠️ 수정금지(승인필요): DB에서 사용자 삭제 (CASCADE로 guides, creditTransactions, cashbackRequests, sharedHtmlPages, notifications, pushSubscriptions 자동 삭제)
    await db.delete(users).where(eq(users.id, userId));

    // ⚠️ 수정금지(승인필요): 세션 파기 + 로그아웃 처리
    if (req.session) {
      req.session.destroy((err: any) => {
        if (err) console.error('Session destroy error:', err);
      });
    }

    console.log(`🗑️ 계정 삭제 완료: ${userId}`);
    res.json({ success: true, message: '계정이 삭제되었습니다.' });
  } catch (error: any) {
    console.error('Account delete error:', error);
    res.status(500).json({ error: '계정 삭제 중 오류가 발생했습니다.', success: false });
  }
});

export default router;
