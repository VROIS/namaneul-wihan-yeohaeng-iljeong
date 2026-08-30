import { QueryClient, QueryFunction } from "@tanstack/react-query";

export function getApiUrl(): string {
  if (typeof window !== "undefined" && window.location) {
    const origin = window.location.origin;
    if (
      origin.includes(":19006") ||
      origin.includes(":8081") ||
      origin.includes(":8082")
    ) {
      return origin.replace(/:(19006|8081|8082)/, ":5000");
    }
    return origin;
  }

  // ⚠️ 수정금지(승인필요) — Metro 번들러가 빌드 시 인라인 주입
  const host = process.env.EXPO_PUBLIC_DOMAIN;
  if (host) {
    if (host.startsWith("http://") || host.startsWith("https://")) {
      return host;
    }
    return `http://${host}`;
  }

  return "http://192.168.1.23:8082";
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

// ⚠️ 수정금지(승인필요) 2026-07-29 §22 = 로그인 토큰을 **반드시** 붙인다.
async function authHeader(): Promise<Record<string, string>> {
  try {
    const { getUserData } = await import("./auth");
    const user = await getUserData();
    if (user?.token && user.token.startsWith("simple_auth_token_v1_")) {
      return { Authorization: `Bearer ${user.token}` };
    }
  } catch {}
  return {};
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
    headers: {
      ...(data ? { "Content-Type": "application/json" } : {}),
      ...(await authHeader()),
    },
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  });

  await throwIfResNotOk(res);
  return res;
}

// ⚠️ 수정금지(승인필요) 2026-08-28 사장님 승인 = 여정 상세 조회 URL 생성 1벌(§16) = TripisModal.tsx·
export function itineraryUrl(id: number | string, language: string): string {
  return `/api/itineraries/${id}?lang=${encodeURIComponent(language)}`;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const baseUrl = getApiUrl();
    const url = new URL(queryKey.join("/") as string, baseUrl);

    // ⚠️ 수정금지(승인필요) 2026-07-30 = 여기도 토큰을 붙인다. apiRequest 만 고치면 useQuery 경로가
    const res = await fetch(url, {
      credentials: "include",
      headers: await authHeader(),
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
