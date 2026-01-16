import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { Platform } from "react-native";

/**
 * Gets the base URL for the Express API server (e.g., "http://localhost:3000")
 * @returns {string} The API base URL
 */
export function getApiUrl(): string {
  let host = process.env.EXPO_PUBLIC_DOMAIN;

  // 환경변수가 설정되어 있으면 사용
  if (host) {
    // http:// 또는 https://가 포함되어 있으면 그대로 사용
    if (host.startsWith("http://") || host.startsWith("https://")) {
      return host;
    }

    // Replit 환경 (https://)
    if (host.includes("replit") || host.includes("repl.co")) {
      return `https://${host}`;
    }

    // 로컬 환경 (http://)
    return `http://${host}`;
  }

  // 환경변수가 없으면 플랫폼에 따라 자동 설정
  // 웹 브라우저: localhost 사용
  // 모바일 기기: 네트워크 IP 사용 (같은 WiFi 필요)
  if (Platform.OS === "web") {
    return "http://localhost:8082";
  } else {
    // 모바일 기기에서는 네트워크 IP 사용
    // 기본값: 192.168.1.23 (개발 환경에서 수정 필요)
    // 또는 환경변수로 설정: EXPO_PUBLIC_DOMAIN=192.168.1.23:8082
    return "http://192.168.1.23:8082";
  }
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  route: string,
  data?: unknown | undefined,
): Promise<Response> {
  const baseUrl = getApiUrl();
  const url = new URL(route, baseUrl);

  const res = await fetch(url, {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const baseUrl = getApiUrl();
    const url = new URL(queryKey.join("/") as string, baseUrl);

    const res = await fetch(url, {
      credentials: "include",
    });

    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
