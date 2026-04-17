import "dotenv/config";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import { registerRoutes } from "./routes";
import * as fs from "fs";
import * as path from "path";
import { db, isDatabaseConnected } from "./db";
import { apiKeys } from "../shared/schema";

// 서버 크래시 방지: MCP/백그라운드 작업의 unhandled 에러가 프로세스를 죽이지 않도록
process.on("uncaughtException", (err) => {
  console.error("[FATAL] uncaughtException (서버 유지):", err?.message || err);
});
process.on("unhandledRejection", (reason) => {
  console.error("[FATAL] unhandledRejection (서버 유지):", (reason as Error)?.message || reason);
});

const app = express();
const log = console.log;

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

function setupCors(app: express.Application) {
  app.use((req, res, next) => {
    const origin = req.header("origin");
    res.header("Access-Control-Allow-Origin", origin || "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.header("Access-Control-Allow-Credentials", "true");

    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }

    next();
  });
}

// JSON 응답에 UTF-8 charset 설정
function setupCharset(app: express.Application) {
  app.use((req, res, next) => {
    // JSON 응답시 charset=utf-8 자동 추가
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return originalJson(body);
    };
    next();
  });
}

function setupBodyParsing(app: express.Application) {
  app.use(
    express.json({
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  app.use(express.urlencoded({ extended: false }));
}

// ⚠️ 수정금지(승인필요) — 앱 에러 리포트 엔드포인트 (AI가 에러 확인용)
function setupAppErrorReporter(app: express.Application) {
  const errorLogPath = path.resolve(process.cwd(), "app-errors.log");

  app.post("/api/app-errors", (req: Request, res: Response) => {
    const { errors } = req.body || {};
    if (!errors || !Array.isArray(errors)) {
      return res.status(400).json({ ok: false });
    }

    const lines = errors.map((e: any) =>
      `[${e.timestamp}] ${e.component || "?"} | ${e.message}${e.stack ? "\n  " + e.stack.split("\n").slice(0, 3).join("\n  ") : ""}`
    ).join("\n");

    fs.appendFileSync(errorLogPath, lines + "\n---\n", "utf-8");
    console.error(`[APP-ERROR] ${errors.length}건 수신:\n${lines}`);
    res.json({ ok: true, received: errors.length });
  });

  // 에러 로그 읽기 (AI가 확인용)
  app.get("/api/app-errors", (_req: Request, res: Response) => {
    try {
      const content = fs.existsSync(errorLogPath) ? fs.readFileSync(errorLogPath, "utf-8") : "(에러 없음)";
      res.type("text/plain").send(content);
    } catch {
      res.type("text/plain").send("(읽기 실패)");
    }
  });

  // 에러 로그 클리어
  app.delete("/api/app-errors", (_req: Request, res: Response) => {
    try {
      fs.writeFileSync(errorLogPath, "", "utf-8");
      res.json({ ok: true, cleared: true });
    } catch {
      res.json({ ok: false });
    }
  });
}

function setupRequestLogging(app: express.Application) {
  app.use((req, res, next) => {
    const start = Date.now();
    const path = req.path;
    let capturedJsonResponse: Record<string, unknown> | undefined = undefined;

    const originalResJson = res.json;
    res.json = function (bodyJson, ...args) {
      capturedJsonResponse = bodyJson;
      return originalResJson.apply(res, [bodyJson, ...args]);
    };

    res.on("finish", () => {
      if (!path.startsWith("/api")) return;

      const duration = Date.now() - start;

      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    });

    next();
  });
}

function getAppName(): string {
  try {
    const appJsonPath = path.resolve(process.cwd(), "app.json");
    const appJsonContent = fs.readFileSync(appJsonPath, "utf-8");
    const appJson = JSON.parse(appJsonContent);
    return appJson.expo?.name || "App Landing Page";
  } catch {
    return "App Landing Page";
  }
}

// ⚠️ 수정금지(승인필요) — Replit에서 expo.sisko.replit.dev 도메인이 port 5000(Express)으로 라우팅됨.
// Expo Go 요청(expo-platform 헤더, .bundle 경로, HMR WebSocket)을 Metro(port 8081)로 프록시.
const metroProxy = createProxyMiddleware({
  target: "http://localhost:8081",
  changeOrigin: false,
  ws: true,
  on: {
    error: (err, req, res) => {
      console.error("[Metro Proxy Error]", err.message);
      if (res && "status" in res) {
        (res as Response).status(502).json({ error: "Metro bundler not running" });
      }
    },
  },
});

function configureExpoAndLanding(app: express.Application) {
  // ⚠️ 수정금지(승인필요) — Expo Go 네이티브 요청을 Metro(8081)로 프록시
  // expo-platform 헤더가 있는 요청 = Expo Go 네이티브 앱
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith("/api")) return next();
    const platform = req.header("expo-platform");
    if (platform === "ios" || platform === "android") {
      return (metroProxy as any)(req, res, next);
    }
    next();
  });

  // ⚠️ 수정금지(승인필요) — JS 번들, 에셋, HMR 소켓 요청을 Metro(8081)로 프록시
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith("/api")) return next();
    if (
      req.path.endsWith(".bundle") ||
      req.path.startsWith("/node_modules/") ||
      req.path.startsWith("/@expo/") ||
      req.path.startsWith("/__metro") ||
      req.path.startsWith("/hot")
    ) {
      return (metroProxy as any)(req, res, next);
    }
    next();
  });

  // Expo 웹 빌드 서빙 (dist 폴더)
  // ⚠️ 수정금지(승인필요) — 웹 빌드 전용, 네이티브 앱과 무관
  const distPath = path.resolve(process.cwd(), "dist");
  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    // SPA 라우팅: 모든 경로에서 index.html 반환 (단, /admin, /api 제외)
    app.get("*", (req, res, next) => {
      if (req.path.startsWith("/api")) return next();
      if (req.path.startsWith("/admin")) return next();
      if (req.path === "/test-video") return next();
      const indexPath = path.join(distPath, "index.html");
      if (fs.existsSync(indexPath)) {
        return res.sendFile(indexPath);
      }
      next();
    });
    log("✅ Serving Expo web build from /dist");
  } else {
    // ⚠️ 수정금지(승인필요) — dev fallback: /dist 없으면 Metro(8081)로 프록시하여 dev bundle + 에셋 서빙
    // API(/api, /admin)만 제외. /assets 는 Metro가 ?unstable_path 쿼리로 처리하므로 프록시 포함. 2026-04-17 추가
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.path.startsWith("/api")) return next();
      if (req.path.startsWith("/admin")) return next();
      return (metroProxy as any)(req, res, next);
    });
    log("⚙️  Dev mode: proxying non-API requests (incl. /assets) to Metro at localhost:8081");
  }

  app.use("/assets", express.static(path.resolve(process.cwd(), "assets")));
}

function setupErrorHandler(app: express.Application) {
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const error = err as {
      status?: number;
      statusCode?: number;
      message?: string;
    };

    const status = error.status || error.statusCode || 500;
    const message = error.message || "Internal Server Error";

    res.status(status).json({ message });

    throw err;
  });
}

(async () => {
  setupCors(app);
  setupCharset(app);
  setupBodyParsing(app);
  setupAppErrorReporter(app); // ⚠️ 수정금지(승인필요) — 앱 에러 원격 수집
  setupRequestLogging(app);

  app.use((req, res, next) => {
    if (req.path.endsWith('.html') || req.path === '/' || !req.path.includes('.')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
    next();
  });

  configureExpoAndLanding(app);
  const server = await registerRoutes(app);

  setupErrorHandler(app);

  const port = parseInt(process.env.PORT || "5000", 10);

  server.on('error', (err: NodeJS.ErrnoException) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`❌ Port ${port} is already in use. Please stop the other process or use a different port.`);
      console.error(`   Try: netstat -ano | findstr :${port} to find the process`);
      process.exit(1);
    } else {
      console.error('❌ Server error:', err);
      process.exit(1);
    }
  });

  server.listen(
    port,
    "0.0.0.0",
    async () => {
      log(`express server serving on port ${port}`);

      // DB 마이그레이션 (mcp_phases 등 누락 컬럼 자동 추가)
      try {
        const { runStartupMigrations } = await import("./run-startup-migrations");
        await runStartupMigrations();
      } catch (e) {
        log("[Server] Startup migration skip:", (e as Error).message);
      }

      // DB에서 API 키 로드
      try {
        if (isDatabaseConnected() && db) {
          const keys = await db.select().from(apiKeys);
          let loadedCount = 0;
          for (const key of keys) {
            if (key.keyValue && key.keyValue.trim() !== '' && key.isActive) {
              process.env[key.keyName] = key.keyValue;
              // 추가 매핑 (서비스별 env 변수명)
              if (key.keyName === 'GEMINI_API_KEY') {
                process.env.AI_INTEGRATIONS_GEMINI_API_KEY = key.keyValue;
              }
              if (key.keyName === 'GOOGLE_MAPS_API_KEY') {
                process.env.Google_maps_api_key = key.keyValue;
              }
              if (key.keyName === 'GOOGLE_OAUTH_CLIENT_ID' || key.keyName === 'EXPO_PUBLIC_GOOGLE_CLIENT_ID') {
                process.env.GOOGLE_CLIENT_ID = key.keyValue;
                process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID = key.keyValue;
              }
              loadedCount++;
            }
          }
          log(`[Server] ✅ Loaded ${loadedCount} API keys from database`);
        }
      } catch (error) {
        log("[Server] Failed to load API keys from database:", error);
      }

      try {
        // ✅ [2026-02-08] 스케줄러 복구 - 비용 보호 적용 완료:
        // - place_seed_sync만 차단 (Google Places API 폭탄 주범)
        // - Gemini Google Search 일일 160건 제한 (무료 범위 유지)
        // - 나머지 13개 크롤러는 안전하게 운영
        const { dataScheduler } = await import("./services/data-scheduler");
        await dataScheduler.initialize();
        log("[Server] ✅ Data scheduler initialized");
      } catch (error) {
        log("[Server] Failed to initialize scheduler:", error);
      }
    },
  );
})();
