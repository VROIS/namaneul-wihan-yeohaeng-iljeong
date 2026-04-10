// ═══════════════════════════════════════════════════════════════
// ⚠️ 수정금지(승인필요): Apple OAuth 인증 시스템 (2026-03-14)
// - passport-apple 사용, googleAuth.ts 패턴 복제
// - iOS 네이티브 앱 전용 (Sign in with Apple)
// - 환경변수: APPLE_CLIENT_ID, APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY
// - 콜백 URL: /api/auth/apple/callback
//
// Verified: 2026-03-14 | Status: Production-Ready ✅
// ═══════════════════════════════════════════════════════════════

import passport from "passport";
import AppleStrategy from "passport-apple";
import type { Express } from "express";
import { storage } from "./storage";
import { creditService } from "./creditService";
import { ottStore } from "./ottStore";

// ⚠️ 수정금지(승인필요): Apple OAuth 셋업 함수
export async function setupAppleAuth(app: Express) {
  const appleClientId = process.env.APPLE_CLIENT_ID?.trim();
  const appleTeamId = process.env.APPLE_TEAM_ID?.trim();
  const appleKeyId = process.env.APPLE_KEY_ID?.trim();
  const applePrivateKey = process.env.APPLE_PRIVATE_KEY?.trim();

  // ⚠️ 수정금지(승인필요): 환경변수 미설정 시 503 폴백
  if (!appleClientId || !appleTeamId || !appleKeyId || !applePrivateKey) {
    console.warn('⚠️  Apple OAuth 환경변수가 설정되지 않았습니다. Apple 로그인을 사용하려면 APPLE_CLIENT_ID, APPLE_TEAM_ID, APPLE_KEY_ID, APPLE_PRIVATE_KEY를 설정하세요.');

    app.get("/api/auth/apple", (req, res) => {
      res.status(503).json({
        error: "Apple 로그인이 아직 설정되지 않았습니다. 관리자에게 문의하세요."
      });
    });

    app.post("/api/auth/apple/callback", (req, res) => {
      res.status(503).json({
        error: "Apple 로그인이 아직 설정되지 않았습니다."
      });
    });

    return;
  }

  // ⚠️ 수정금지(승인필요): 콜백 URL 생성 (Replit 도메인 자동 감지)
  const domains = process.env.REPLIT_DOMAINS?.split(",") || ['localhost:5000'];
  const domain = domains[0];
  const protocol = domain.includes('replit.dev') || domain.includes('replit.app') ? 'https' : 'http';
  const callbackURL = `${protocol}://${domain}/api/auth/apple/callback`;

  console.log('🍎 Apple OAuth Callback URL:', callbackURL);

  // ⚠️ 수정금지(승인필요): Apple Strategy 설정
  // APPLE_PRIVATE_KEY는 줄바꿈을 \\n으로 저장 → 실제 줄바꿈으로 변환
  const privateKeyPEM = applePrivateKey.replace(/\\n/g, '\n');

  passport.use(
    new AppleStrategy(
      {
        clientID: appleClientId,
        teamID: appleTeamId,
        keyID: appleKeyId,
        privateKeyString: privateKeyPEM,
        callbackURL: callbackURL,
        scope: ["name", "email"],
        passReqToCallback: true,
      },
      async (req: any, accessToken: any, refreshToken: any, idToken: any, profile: any, done: any) => {
        try {
          // ⚠️ 수정금지(승인필요): Apple은 최초 로그인 시에만 이름/이메일 제공
          // idToken에서 sub(고유 ID)와 email 추출
          const appleId = profile.id || idToken?.sub;
          const email = profile.email || idToken?.email;

          // Apple은 최초 1회만 이름을 제공 (req.body에서 추출)
          const firstName = profile.name?.firstName || req.body?.user?.name?.firstName || '';
          const lastName = profile.name?.lastName || req.body?.user?.name?.lastName || '';

          const userId = `apple_${appleId}`;

          // ⚠️ 수정금지(승인필요): 사용자 생성/업데이트 (googleAuth.ts 동일 패턴)
          await storage.upsertUser({
            id: userId,
            email: email,
            firstName: firstName,
            lastName: lastName,
            profileImageUrl: '', // Apple은 프로필 이미지 미제공
            provider: 'apple',
          });

          // ⚠️ 수정금지(승인필요): 신규 가입 보너스 지급 (이미 받은 경우 무시됨)
          try {
            await creditService.grantSignupBonus(userId);
          } catch (bonusError) {
            console.error('가입 보너스 지급 오류:', bonusError);
          }

          // ⚠️ 수정금지(승인필요): 리워드 시스템 — 신규 유저 판별
          const existingUser = await storage.getUser(userId);
          const isNewUser = !existingUser?.referredBy;

          const user = {
            id: userId,
            email: email,
            firstName: firstName,
            lastName: lastName,
            profileImageUrl: '',
            provider: 'apple',
            isNewUser: isNewUser,
          };

          done(null, user);
        } catch (error) {
          console.error('Apple 인증 오류:', error);
          done(error as Error, undefined);
        }
      }
    )
  );

  // ⚠️ 수정금지(승인필요): Apple 로그인 시작 라우트
  app.get(
    "/api/auth/apple",
    passport.authenticate("apple", {
      scope: ["name", "email"],
    })
  );

  // ⚠️ 수정금지(승인필요): Apple OAuth 콜백 (POST — Apple은 POST로 콜백)
  app.post(
    "/api/auth/apple/callback",
    (req, res, next) => {
      passport.authenticate("apple", (err: any, user: any) => {
        if (err) {
          console.error('Apple 인증 콜백 오류:', err);
          return res.redirect("/archive?auth=failed");
        }

        if (!user) {
          console.error('Apple 인증 실패: 사용자 없음');
          return res.redirect("/archive?auth=failed");
        }

        // ⚠️ 수정금지(승인필요): 로그인 처리 (googleAuth.ts 동일 패턴)
        req.logIn(user, async (loginErr) => {
          if (loginErr) {
            console.error('Apple 로그인 오류:', loginErr);
            return res.redirect("/archive?auth=failed");
          }

          // ⚠️ 수정금지(승인필요): 리워드 시스템 — referralCode 쿠키 확인 및 처리
          try {
            if (user.isNewUser) {
              const referralCode = req.cookies?.referralCode;
              if (referralCode) {
                console.log('🎁 Referral code found:', referralCode);
                await storage.processReferralReward(referralCode, user.id);
                res.clearCookie('referralCode');
              }
            }
          } catch (refError) {
            console.error('Referral 처리 오류:', refError);
          }

          // ⚠️ 수정금지(승인필요): 2026-03-22 OTT 토큰 생성 — 앱 OAuth 세션 교환용
          const ottToken = ottStore.create(user.id);

          // ⚠️ 수정금지(승인필요): 인증 완료 페이지 (googleAuth.ts와 동일한 디자인)
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
            <body data-ott-token="${ottToken}">
              <div class="spinner"></div>
              <script>
                // ═══════════════════════════════════════════════════════════════
                // ⚠️ 수정금지(승인필요): 2026-03-14 Apple OAuth 완료 처리
                // - 팝업 환경(웹 브라우저): postMessage → window.close()
                // - WebView 환경(앱): opener 없음 → 딥링크로 앱 복귀
                // ═══════════════════════════════════════════════════════════════
                (function() {
                  try {
                    if (window.opener && !window.opener.closed) {
                      // 웹 팝업: 부모 탭에 성공 알림 후 창 닫기
                      window.opener.postMessage({ type: 'oauth_success' }, window.location.origin);
                      window.close();
                    } else {
                      // ⚠️ 수정금지(승인필요): 2026-03-24 OTT 딥링크 제거 — 웹에서 딥링크 발사하면 앱이 열려 세션 깨짐
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
