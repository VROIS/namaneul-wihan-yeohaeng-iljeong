import "dotenv/config";
import express from "express";
import type { Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import * as fs from "fs";
import * as path from "path";
import { db, isDatabaseConnected } from "./db";
import { apiKeys } from "../shared/schema";

const app = express();
const log = console.log;

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

function setupCors(app: express.Application) {
  app.use((req, res, next) => {
    const origins = new Set<string>();

    // 로컬 개발 환경
    origins.add("http://localhost:8081");
    origins.add("http://localhost:8082");
    origins.add("http://localhost:19006");
    origins.add("http://localhost:19000");
    origins.add("http://127.0.0.1:8081");
    origins.add("http://127.0.0.1:8082");
    origins.add("http://127.0.0.1:19006");
    origins.add("http://127.0.0.1:19000");
    origins.add("http://192.168.1.23:8082");

    // Koyeb 배포 환경
    origins.add("https://legal-dannye-dbstour-4e6b86d5.koyeb.app");

    const origin = req.header("origin");

    if (origin && origins.has(origin)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, DELETE, OPTIONS",
      );
      res.header("Access-Control-Allow-Headers", "Content-Type");
      res.header("Access-Control-Allow-Credentials", "true");
    }

    // 프로덕션: 같은 도메인 요청 허용 (origin이 없는 경우)
    if (process.env.NODE_ENV === "production" && !origin) {
      res.header("Access-Control-Allow-Origin", "*");
      res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
      res.header("Access-Control-Allow-Headers", "Content-Type");
    }

    // 로컬 개발 환경에서는 모든 origin 허용 (개발 편의)
    // 모바일 기기에서 접속할 때 origin이 없을 수 있음
    if (process.env.NODE_ENV === "development") {
      if (!origin) {
        res.header("Access-Control-Allow-Origin", "*");
      } else if (!origins.has(origin)) {
        // 개발 환경에서는 알 수 없는 origin도 허용 (모바일 기기 대응)
        res.header("Access-Control-Allow-Origin", origin);
        res.header(
          "Access-Control-Allow-Methods",
          "GET, POST, PUT, DELETE, OPTIONS",
        );
        res.header("Access-Control-Allow-Headers", "Content-Type");
        res.header("Access-Control-Allow-Credentials", "true");
      }
    }

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

function serveExpoManifest(platform: string, res: Response) {
  const manifestPath = path.resolve(
    process.cwd(),
    "static-build",
    platform,
    "manifest.json",
  );

  if (!fs.existsSync(manifestPath)) {
    return res
      .status(404)
      .json({ error: `Manifest not found for platform: ${platform}` });
  }

  res.setHeader("expo-protocol-version", "1");
  res.setHeader("expo-sfv-version", "0");
  res.setHeader("content-type", "application/json");

  const manifest = fs.readFileSync(manifestPath, "utf-8");
  res.send(manifest);
}


function configureExpoAndLanding(app: express.Application) {
  const appName = getAppName();

  log("Serving static Expo files with dynamic manifest routing");

  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.path.startsWith("/api")) {
      return next();
    }

    if (req.path !== "/" && req.path !== "/manifest") {
      return next();
    }

    const platform = req.header("expo-platform");
    if (platform && (platform === "ios" || platform === "android")) {
      return serveExpoManifest(platform, res);
    }

    next();
  });

  // Expo 웹 빌드 서빙 (dist 폴더)
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
  }

  app.use("/assets", express.static(path.resolve(process.cwd(), "assets")));
  app.use(express.static(path.resolve(process.cwd(), "static-build")));

  log("Expo routing: Checking expo-platform header on / and /manifest");
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
  setupRequestLogging(app);

  configureExpoAndLanding(app);
  const server = await registerRoutes(app);

  setupErrorHandler(app);

  const port = parseInt(process.env.PORT || "8082", 10);

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

      // DB에서 API 키 로드
      try {
        if (isDatabaseConnected() && db) {
          const keys = await db.select().from(apiKeys);
          let loadedCount = 0;
          for (const key of keys) {
            if (key.keyValue && key.keyValue.trim() !== '' && key.isActive) {
              process.env[key.keyName] = key.keyValue;
              // Gemini 키 추가 매핑
              if (key.keyName === 'GEMINI_API_KEY') {
                process.env.AI_INTEGRATIONS_GEMINI_API_KEY = key.keyValue;
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
        const { dataScheduler } = await import("./services/data-scheduler");
        await dataScheduler.initialize();
        log("[Server] Data collection scheduler initialized");
      } catch (error) {
        log("[Server] Failed to initialize scheduler:", error);
      }
    },
  );
})();
