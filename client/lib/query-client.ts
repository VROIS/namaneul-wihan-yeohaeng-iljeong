import { QueryClient, QueryFunction } from "@tanstack/react-query";

export function getApiUrl(): string {
  if (typeof window !== "undefined" && window.location) {
    return window.location.origin;
  }

  // ⚠️ 수정금지(승인필요) 2026-09-27 사장님 결정 = 서버 주소 = 빌드 때 넣은 EXPO_PUBLIC_DOMAIN 1벌, 비면 옛 PC 주소로 가지 않고 바로 오류 (정본 9-27)
  const host = process.env.EXPO_PUBLIC_DOMAIN;
  if (host) {
    if (host.startsWith("http://") || host.startsWith("https://")) {
      return host;
    }
    return `http://${host}`;
  }

  throw new Error("EXPO_PUBLIC_DOMAIN 이 비어 있다");
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

// ⚠️ 수정금지(승인필요) 2026-09-27 사장님 결정 = 로그인 토큰을 반드시 붙인다 = 요청 머리말 1벌(앱 전체가 이것만 쓴다) (정본 9-27)
export async function getAuthHeader(): Promise<Record<string, string>> {
  try {
    const { getUserData, hasSessionToken } = await import("./auth");
    const user = await getUserData();
    if (hasSessionToken(user)) {
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
      ...(await getAuthHeader()),
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
      headers: await getAuthHeader(),
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
