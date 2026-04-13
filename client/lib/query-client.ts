import { QueryClient, QueryFunction } from "@tanstack/react-query";
import Constants from "expo-constants";

/**
 * Gets the base URL for the Express API server (e.g., "http://localhost:3000")
 * @returns {string} The API base URL
 */
export function getApiUrl(): string {
  // 웹 환경에서는 같은 도메인 origin 사용
  if (typeof window !== "undefined" && window.location) {
    return window.location.origin;
  }

  let host = process.env.EXPO_PUBLIC_DOMAIN;

  // 환경변수가 설정되어 있으면 사용
  if (host) {
    // http:// 또는 https://가 포함되어 있으면 그대로 사용
    if (host.startsWith("http://") || host.startsWith("https://")) {
      return host;
    }

    // 로컬 환경 (http://)
    return `http://${host}`;
  }

  // app.config.js에서 주입된 Replit 공개 URL 사용
  const apiDomain = Constants.expoConfig?.extra?.apiDomain as string | undefined;
  if (apiDomain) {
    return apiDomain;
  }

  // 로컬 개발 서버 폴백
  return "http://192.168.1.23:8082";
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
