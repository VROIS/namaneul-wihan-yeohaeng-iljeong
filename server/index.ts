import "dotenv/config";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import { createProxyMiddleware } from "http-proxy-middleware";
import { registerRoutes } from "./routes";
import * as fs from "fs";
import * as path from "path";
import { db, isDatabaseConnected } from "./db";
import { apiKeys } from "../shared/schema";
import { isR2Configured } from "./services/shared/r2-client"; // 2026-08-07 사장님 승인 = 부팅 시 창고 열쇠 검사

process.on("uncaughtException", (err) => {
  console.error("[FATAL] uncaughtException (서버 유지):", err?.message || err);
});
process.on("unhandledRejection", (reason) => {
  console.error(
    "[FATAL] unhandledRejection (서버 유지):",
    (reason as Error)?.message || reason,
  );
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
    res.header(
      "Access-Control-Allow-Methods",
      "GET, POST, PUT, PATCH, DELETE, OPTIONS",
    ); // PATCH = 전문가 답변/admin 상태변경(2026-07-13). 웹 preflight 필수.
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
    res.header("Access-Control-Allow-Credentials", "true");

    if (req.method === "OPTIONS") {
      return res.sendStatus(200);
    }

    next();
  });
}

function setupCharset(app: express.Application) {
  app.use((req, res, next) => {
    const originalJson = res.json.bind(res);
    res.json = (body) => {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      return originalJson(body);
    };
    next();
  });
}

function setupBodyParsing(app: express.Application) {
  app.use(
    express.json({
      limit: "10mb",
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  app.use(express.urlencoded({ extended: false, limit: "10mb" }));
}

// ⚠️ 수정금지(승인필요) — 앱 에러 리포트 엔드포인트 (AI가 에러 확인용)
function setupAppErrorReporter(app: express.Application) {
  const errorLogPath = path.resolve(process.cwd(), "app-errors.log");

  app.post("/api/app-errors", (req: Request, res: Response) => {
    const { errors } = req.body || {};
    if (!errors || !Array.isArray(errors)) {
      return res.status(400).json({ ok: false });
    }

    const lines = errors
      .map(
        (e: any) =>
          `[${e.timestamp}] ${e.component || "?"} | ${e.message}${e.stack ? "\n  " + e.stack.split("\n").slice(0, 3).join("\n  ") : ""}`,
      )
      .join("\n");

    fs.appendFileSync(errorLogPath, lines + "\n---\n", "utf-8");
    console.error(`[APP-ERROR] ${errors.length}건 수신:\n${lines}`);
    res.json({ ok: true, received: errors.length });
  });

  app.get("/api/app-errors", (_req: Request, res: Response) => {
    try {
      const content = fs.existsSync(errorLogPath)
        ? fs.readFileSync(errorLogPath, "utf-8")
        : "(에러 없음)";
      res.type("text/plain").send(content);
    } catch {
      res.type("text/plain").send("(읽기 실패)");
    }
  });

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
const metroProxy = createProxyMiddleware({
  target: "http://localhost:8081",
  changeOrigin: false,
  ws: true,
  on: {
    error: (err, req, res) => {
      console.error("[Metro Proxy Error]", err.message);
      if (res && "status" in res) {
        (res as Response)
          .status(502)
          .json({ error: "Metro bundler not running" });
      }
    },
  },
});

function configureExpoAndLanding(app: express.Application) {
  // ⚠️ 수정금지(승인필요) — Expo Go 네이티브 요청을 Metro(8081)로 프록시
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

  const publicPath = path.resolve(process.cwd(), "public");
  if (fs.existsSync(publicPath)) {
    app.use(express.static(publicPath));
  }

  // ⚠️ 수정금지(승인필요) 2026-09-05 사장님 결정 = 웹 빌드 서빙 경로를 정규식으로 = Express 4·5 양쪽 동작 (검사표 §5 E4)
  const distPath = path.resolve(process.cwd(), "dist");
  if (fs.existsSync(distPath)) {
    app.use(express.static(distPath));
    app.get(/.*/, (req, res, next) => {
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
    app.use((req: Request, res: Response, next: NextFunction) => {
      if (req.path.startsWith("/api")) return next();
      if (req.path.startsWith("/admin")) return next();
      return (metroProxy as any)(req, res, next);
    });
    log(
      "⚙️  Dev mode: proxying non-API requests (incl. /assets) to Metro at localhost:8081",
    );
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
    if (
      req.path.endsWith(".html") ||
      req.path === "/" ||
      !req.path.includes(".")
    ) {
      res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    }
    next();
  });

  configureExpoAndLanding(app);
  const server = await registerRoutes(app);

  setupErrorHandler(app);

  const port = parseInt(process.env.PORT || "5000", 10);

  server.on("error", (err: NodeJS.ErrnoException) => {
    if (err.code === "EADDRINUSE") {
      console.error(
        `❌ Port ${port} is already in use. Please stop the other process or use a different port.`,
      );
      console.error(
        `   Try: netstat -ano | findstr :${port} to find the process`,
      );
      process.exit(1);
    } else {
      console.error("❌ Server error:", err);
      process.exit(1);
    }
  });

  server.listen(port, "0.0.0.0", async () => {
    log(`express server serving on port ${port}`);

    // ⚠️ 2026-08-07 사장님 승인 = R2 창고 열쇠 부팅 검사 = 미등록 배포가 조용히 지나가는 것 원천 차단
    if (isR2Configured()) {
      log("✅ R2 창고 연결 확인 (열쇠 5종 등록됨)");
    } else {
      console.error(
        "\n" +
          "🔴🔴🔴 R2 창고 열쇠 미등록 = 영상·사진·raw 저장이 전부 실패합니다! 🔴🔴🔴\n" +
          "🔴 Replit Secrets(또는 .env)에 R2_ACCOUNT_ID / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY / R2_BUCKET_NAME / R2_PUBLIC_URL 5종을 등록 후 재배포하세요.\n",
      );
    }

    try {
      const { runStartupMigrations } = await import("./run-startup-migrations");
      await runStartupMigrations();
    } catch (e) {
      log("[Server] Startup migration skip:", (e as Error).message);
    }

    // ⚠️ 수정금지(승인필요) 2026-08-31 사장님 확정 = 관제탑 지표 기록 = 대시보드를 안 열어도 30초마다 R2 에 남긴다 (정본 B4)
    try {
      const { startMetricsHeartbeat } = await import(
        "./services/shared/metrics-heartbeat"
      );
      startMetricsHeartbeat();
    } catch (e) {
      log("[Server] metrics heartbeat skip:", (e as Error).message);
    }

    try {
      if (isDatabaseConnected() && db) {
        const keys = await db.select().from(apiKeys);
        let loadedCount = 0;
        for (const key of keys) {
          if (key.keyValue && key.keyValue.trim() !== "" && key.isActive) {
            const value = key.keyValue.trim();
            process.env[key.keyName] = value;
            if (key.keyName === "GEMINI_API_KEY") {
              process.env.AI_INTEGRATIONS_GEMINI_API_KEY = value;
            }
            if (key.keyName === "GOOGLE_MAPS_API_KEY") {
              process.env.Google_maps_api_key = value;
            }
            if (
              key.keyName === "GOOGLE_OAUTH_CLIENT_ID" ||
              key.keyName === "EXPO_PUBLIC_GOOGLE_CLIENT_ID"
            ) {
              process.env.GOOGLE_CLIENT_ID = value;
              process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID = value;
            }
            loadedCount++;
          }
        }
        log(`[Server] ✅ Loaded ${loadedCount} API keys from database`);
      }
    } catch (error) {
      log("[Server] Failed to load API keys from database:", error);
    }

    // ⚠️ 수정금지(승인필요) 2026-05-20 = 사용자 SSOT = DB-only 도시 ready 검증 로그 (= 메인앱 분기 확실화)
    try {
      const { isCityReady } = await import(
        "./services/agents/ag2-gemini-recommender"
      );
      const DB_ONLY_CITIES = ["Paris"]; // = 추후 list 확장 = Tokyo / Madrid 등
      for (const cityName of DB_ONLY_CITIES) {
        const check = await isCityReady(cityName);
        if (check.ready) {
          log(
            `[Server] ✅ DB-only city '${cityName}' (id=${check.cityId}) ready=true / ${check.count} rows`,
          );
        } else {
          log(
            `[Server] ⚠️  DB-only city '${cityName}' ready=false / ${check.count} rows < threshold = MIX path 진입 시 = 차단됨`,
          );
        }
      }
    } catch (e) {
      log("[Server] DB-only city ready check skip:", (e as Error).message);
    }

    try {
      const { dataScheduler } = await import("./services/data-scheduler");
      await dataScheduler.initialize();
      log("[Server] ✅ Data scheduler initialized");

      // 💳 2026-08-12 사장님 승인 = 결제 자가치유(웹훅 구독 보증 + 원장 대조 회수) = 부팅마다 1회.
      const { initPaymentSelfHeal } = await import("./payment-routes");
      void initPaymentSelfHeal();
    } catch (error) {
      log("[Server] Failed to initialize scheduler:", error);
    }
  });
})();
