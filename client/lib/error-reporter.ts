// ⚠️ 수정금지(승인필요) — 앱 에러 원격 리포터
// 앱에서 발생하는 에러를 서버로 전송 → 서버가 파일로 저장 → AI가 읽어서 확인
// 외부 서비스(Sentry 등) 없이 자체 구현

const ERROR_ENDPOINT = __DEV__
  ? "http://192.168.1.23:8082/api/app-errors"
  : "/api/app-errors";

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
export function reportError(error: Error | string, context?: { component?: string; screen?: string }) {
  const entry: AppError = {
    message: typeof error === "string" ? error : error.message,
    stack: typeof error === "string" ? undefined : error.stack,
    component: context?.component,
    screen: context?.screen,
    timestamp: new Date().toISOString(),
    platform: typeof navigator !== "undefined" ? navigator.userAgent?.slice(0, 50) : "unknown",
  };

  errorQueue.push(entry);

  // 콘솔에도 출력
  console.error(`[AppError] ${entry.message}`, entry.component || "");

  // 1초 디바운스 후 전송
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
    await fetch(ERROR_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ errors: batch }),
    });
  } catch {
    // 서버 연결 실패 시 무시 (로컬 콘솔에는 이미 출력됨)
  }
}

// ⚠️ 수정금지(승인필요) — 글로벌 에러 핸들러 설치
export function installGlobalErrorHandler() {
  // JS 에러
  const originalHandler = ErrorUtils?.getGlobalHandler?.();
  ErrorUtils?.setGlobalHandler?.((error: Error, isFatal?: boolean) => {
    reportError(error, { component: isFatal ? "FATAL" : "global" });
    originalHandler?.(error, isFatal);
  });

  // Promise rejection
  const originalRejection = (globalThis as any).__promiseRejectionTrackingOptions?.onUnhandled;
  if (typeof globalThis !== "undefined") {
    (globalThis as any).onunhandledrejection = (event: any) => {
      reportError(event?.reason?.message || "Unhandled promise rejection", { component: "promise" });
    };
  }
}
