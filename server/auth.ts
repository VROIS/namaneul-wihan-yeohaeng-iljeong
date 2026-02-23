import type { Express } from "express";
import { storage } from "./storage";
import { users } from "@shared/schema";

export function registerAuthRoutes(app: Express) {
    // 소셜 로그인 / 회원가입 통합 엔드포인트
    app.post("/api/auth/social-login", async (req, res) => {
        try {
            const { provider, providerId, birthDate, language, deviceType, displayName } = req.body;

            if (!provider || !birthDate) {
                return res.status(400).json({ error: "Provider and birthDate are required" });
            }

            // 1. 기존 사용자 검색 (provider + providerId 조합)
            // providerId가 없으면 임시로 birthDate 등을 조합하거나 추후 OAuth 연동 시 사용
            const pid = providerId || `temp_${provider}_${birthDate.replace(/-/g, '')}`;

            let user = await storage.getUserByProvider(provider, pid);

            if (user) {
                // 2. 기존 사용자 정보 업데이트 (로그인 횟수 증가, 마지막 로그인 시간 등)
                user = await storage.updateUserLogin(user.id, {
                    lastLoginAt: new Date(),
                    loginCount: (user.loginCount || 0) + 1,
                    deviceType,
                    preferredLanguage: language || user.preferredLanguage,
                    birthDate: birthDate || user.birthDate,
                });
            } else {
                // 3. 신규 사용자 생성
                const username = `${provider}_${pid.substring(0, 8)}_${Math.random().toString(36).substring(2, 5)}`;
                user = await storage.createUser({
                    username,
                    password: "social_login_no_password", // 소셜 로그인은 비밀번호 불필요
                    displayName: displayName || `${provider} User`,
                    provider,
                    providerId: pid,
                    birthDate,
                    preferredLanguage: language || "ko",
                    deviceType,
                    loginCount: 1,
                    lastLoginAt: new Date(),
                    isPaid: false,
                    planType: "free",
                });
            }

            // 4. 응답 (실제 운영 환경에선 JWT 토큰 생성 후 반환)
            res.json({
                success: true,
                user: {
                    id: user.id,
                    username: user.username,
                    displayName: user.displayName,
                    provider: user.provider,
                    birthDate: user.birthDate,
                    language: user.preferredLanguage,
                    isPaid: user.isPaid,
                    planType: user.planType,
                },
                token: "simple_auth_token_v1_" + user.id, // 임시 토큰
            });
        } catch (error: any) {
            console.error("[Auth] Social Login Error:", error);
            res.status(500).json({ error: "Failed to process social login" });
        }
    });

    // 내 정보 조회
    app.get("/api/auth/me", async (req, res) => {
        try {
            const authHeader = req.headers.authorization;
            if (!authHeader || !authHeader.startsWith("Bearer ")) {
                return res.status(401).json({ error: "Unauthorized" });
            }

            const userId = authHeader.split(" ")[1].replace("simple_auth_token_v1_", "");
            const user = await storage.getUser(userId);

            if (!user) {
                return res.status(404).json({ error: "User not found" });
            }

            res.json(user);
        } catch (error) {
            res.status(500).json({ error: "Failed to fetch user data" });
        }
    });
}
