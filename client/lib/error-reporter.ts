// ⚠️ 수정금지(승인필요) 2026-09-27 사장님 결정 = 앱 에러 원격 리포터 = 서버 주소 1벌(getApiUrl)로 보낸다 (정본 9-27)
import { getApiUrl } from "./query-client";

const ERROR_ENDPOINT = "/api/app-errors";

interface AppError {
  message: string;
  stack?: string;
  component?: string;
  screen?: string;
  timestamp: string;
  platform: string;
}

const errorQueue: AppError[] = [];
let flushTimer: NodeJS.Timeout | null = null;

// ⚠️ 수정금지(승인필요) — 에러 리포트 (큐에 쌓고 1초마다 전송)
export function reportError(
  error: Error | string,
  context?: { component?: string; screen?: string },
) {
  const entry: AppError = {
    message: typeof error === "string" ? error : error.message,
    stack: typeof error === "string" ? undefined : error.stack,
    component: context?.component,
    screen: context?.screen,
    timestamp: new Date().toISOString(),
    platform:
      typeof navigator !== "undefined"
        ? navigator.userAgent?.slice(0, 50)
        : "unknown",
  };

  errorQueue.push(entry);

  console.error(`[AppError] ${entry.message}`, entry.component || "");

  if (!flushTimer) {
    flushTimer = setTimeout(flushErrors, 1000);
  }
}

async function flushErrors() {
  flushTimer = null;
  if (errorQueue.length === 0) return;

  const batch = [...errorQueue];
  errorQueue.length = 0;

  try {
    await fetch(new URL(ERROR_ENDPOINT, getApiUrl()).toString(), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ errors: batch }),
    });
  } catch {}
}

// ⚠️ 수정금지(승인필요) 2026-08-30 재확인 = 글로벌 에러 핸들러 설치
export function installGlobalErrorHandler() {
  const originalHandler = ErrorUtils?.getGlobalHandler?.();
  ErrorUtils?.setGlobalHandler?.((error: Error, isFatal?: boolean) => {
    reportError(error, { component: isFatal ? "FATAL" : "global" });
    originalHandler?.(error, isFatal);
  });

  const originalRejection = (globalThis as any)
    .__promiseRejectionTrackingOptions?.onUnhandled;
  if (typeof globalThis !== "undefined") {
    (globalThis as any).onunhandledrejection = (event: any) => {
      reportError(event?.reason?.message || "Unhandled promise rejection", {
        component: "promise",
      });
    };
  }
}
