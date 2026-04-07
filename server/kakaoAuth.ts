// ═══════════════════════════════════════════════════════════════
// ⚠️ CRITICAL: DO NOT MODIFY WITHOUT USER APPROVAL
// 사용자 승인 없이 절대 수정 금지 - AI 및 모든 개발자 주의
// 
// 📱 모바일 OAuth 통합 인증 시스템 (2025-11-12)
// - PC/모바일 통일: window.open() 팝업 방식 (상태 보존)
// - 모바일: "인증 완료" 수동 닫기 버튼
// - PC: postMessage + 300ms 자동 닫기
// - 디자인: 공유페이지와 100% 통일 (Hero Icons + Gemini Blue)
// - 1번 닫기: fallback 리다이렉트 제거로 이중 닫기 해결
//
// Verified: 2025-11-12 | Status: Production-Ready ✅
// ═══════════════════════════════════════════════════════════════

import passport from "passport";
import { Strategy as KakaoStrategy } from "passport-kakao";
import type { Express } from "express";
import { storage } from "./storage";
import { creditService } from "./creditService";

export async function setupKakaoAuth(app: Express) {
  const kakaoClientId = process.env.KAKAO_CLIENT_ID?.trim();
  const kakaoClientSecret = process.env.KAKAO_CLIENT_SECRET?.trim();

  if (!kakaoClientId || !kakaoClientSecret) {
    console.warn('⚠️  카카오 OAuth 환경변수가 설정되지 않았습니다. 카카오 로그인을 사용하려면 KAKAO_CLIENT_ID와 KAKAO_CLIENT_SECRET을 설정하세요.');

    app.get("/api/auth/kakao", (req, res) => {
      res.status(503).json({
        error: "카카오 로그인이 아직 설정되지 않았습니다. 관리자에게 문의하세요."
      });
    });

    app.get("/api/auth/kakao/callback", (req, res) => {
      res.status(503).json({
        error: "카카오 로그인이 아직 설정되지 않았습니다."
      });
    });

    return;
  }

  const domains = process.env.REPLIT_DOMAINS?.split(",") || ['localhost:5000'];
  const domain = domains[0];
  const protocol = domain.includes('replit.dev') || domain.includes('replit.app') ? 'https' : 'http';
  const callbackURL = `${protocol}://${domain}/api/auth/kakao/callback`;

  console.log('🟡 Kakao OAuth 설정:');
  console.log('  - Client ID 길이:', kakaoClientId.length, '글자');
  console.log('  - Client ID 앞 10자:', kakaoClientId.substring(0, 10));
  console.log('  - Client Secret 길이:', kakaoClientSecret.length, '글자');
  console.log('  - Client Secret 앞 10자:', kakaoClientSecret.substring(0, 10));
  console.log('  - Callback URL:', callbackURL);

  passport.use(
    new KakaoStrategy(
      {
        clientID: kakaoClientId,
        clientSecret: kakaoClientSecret,
        callbackURL: callbackURL,
      },
      async (accessToken: string, refreshToken: string, profile: any, done: any) => {
        try {
          const email = profile._json?.kakao_account?.email;
          const nickname = profile.displayName || profile.username || '';
          const profileImageUrl = profile._json?.kakao_account?.profile?.profile_image_url || '';

          const userId = `kakao_${profile.id}`;

          await storage.upsertUser({
            id: userId,
            email: email,
            firstName: nickname,
            lastName: '',
            profileImageUrl: profileImageUrl,
            provider: 'kakao',
          });

          // 🎁 리워드 시스템: referral 처리는 콜백에서 수행 (쿠키 접근 필요)
          const existingUser = await storage.getUser(userId);
          const isNewUser = !existingUser?.referredBy;

          const user = {
            id: userId,
            email: email,
            firstName: nickname,
            lastName: '',
            profileImageUrl: profileImageUrl,
            provider: 'kakao',
            isNewUser: isNewUser,
          };

          done(null, user);
        } catch (error) {
          console.error('카카오 인증 오류:', error);
          done(error as Error, undefined);
        }
      }
    )
  );

  app.get(
    "/api/auth/kakao",
    passport.authenticate("kakao")
  );

  app.get(
    "/api/auth/kakao/callback",
    (req, res, next) => {
      passport.authenticate("kakao", (err: any, user: any) => {
        if (err) {
          console.error('카카오 인증 콜백 오류:', err);
          return res.redirect("/archive?auth=failed");
        }

        if (!user) {
          console.error('카카오 인증 실패: 사용자 없음');
          return res.redirect("/archive?auth=failed");
        }

        // 로그인 처리
        req.logIn(user, async (loginErr) => {
          if (loginErr) {
            console.error('카카오 로그인 오류:', loginErr);
            return res.redirect("/archive?auth=failed");
          }

          // 🎁 리워드 시스템: referralCode 쿠키 확인 및 처리 (2025-11-28)
          try {
            if (user.isNewUser) {
              const referralCode = req.cookies?.referralCode;
              if (referralCode) {
                console.log('🎁 Referral code found:', referralCode);
                await storage.processReferralReward(referralCode, user.id);
                // 쿠키 삭제 (사용 완료)
                res.clearCookie('referralCode');
              }
            }
          } catch (refError) {
            console.error('Referral 처리 오류:', refError);
          }

          // 🎁 신규 가입 보너스 지급 (이미 받은 경우 무시됨)
          try {
            await creditService.grantSignupBonus(user.id);
          } catch (bonusError) {
            console.error('가입 보너스 지급 오류:', bonusError);
          }

          // ⚠️ 2025.11.12: 공유페이지와 100% 동일한 디자인
          res.send(`
            <!DOCTYPE html>
            <html lang="ko">
            <head>
              <meta charset="UTF-8">
              <meta name="viewport" content="width=device-width, initial-scale=1.0">
              <title>로그인 완료</title>
              <link rel="stylesheet" href="https://hangeul.pstatic.net/maruburi/maruburi.css">
              <style>
                * { margin: 0; padding: 0; box-sizing: border-box; }
                body {
                  font-family: 'MaruBuri', -apple-system, BlinkMacSystemFont, sans-serif;
                  display: flex;
                  align-items: center;
                  justify-content: center;
                  min-height: 100vh;
                  background-color: #FFFEFA;
                }
                .spinner {
                  width: 2.5rem; height: 2.5rem;
                  border: 3px solid rgba(66,133,244,0.2);
                  border-top-color: #4285F4;
                  border-radius: 50%;
                  animation: spin 0.8s linear infinite;
                }
                @keyframes spin { to { transform: rotate(360deg); } }
              </style>
            </head>
            <body>
              <div class="spinner"></div>
              <script>
                // ═══════════════════════════════════════════════════════════════
                // 2026-03-06: Kakao OAuth 완료 처리
                // - 팝업 환경(웹 브라우저): postMessage → window.close()
                // - WebView 환경(앱): opener 없음 → 즉시 앱 루트로 이동
                // - 중간 대기 없음, 사용자 눈에 안 보임
                // ═══════════════════════════════════════════════════════════════
                (function() {
                  try {
                    if (window.opener && !window.opener.closed) {
                      // 웹 팝업: 부모 탭에 성공 알림 후 창 닫기
                      window.opener.postMessage({ type: 'oauth_success' }, window.location.origin);
                      window.close();
                    } else {
                      // ⚠️ 수정금지(승인필요): WebView 팝업 차단 대응
                      // Android WebView에서 opener 없음 → 인증 플래그 설정 후 앱 루트로 이동
                      // landingVisited: 랜딩 페이지 스킵 → auth_success: mainPage(카메라+입력) 직행
                      localStorage.setItem('auth_success', 'true');
                      localStorage.setItem('landingVisited', 'true');
                      window.location.replace('/');
                    }
                  } catch(e) {
                    // ⚠️ 수정금지(승인필요): 예외 시에도 인증 플래그 설정
                    localStorage.setItem('auth_success', 'true');
                    localStorage.setItem('landingVisited', 'true');
                    window.location.replace('/');
                  }
                })();
              </script>
            </body>
            </html>
          `);
        });
      })(req, res, next);
    }
  );
}
