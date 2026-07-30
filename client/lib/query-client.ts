import { QueryClient, QueryFunction } from "@tanstack/react-query";

/**
 * Gets the base URL for the Express API server (e.g., "http://localhost:3000")
 * @returns {string} The API base URL
 */
export function getApiUrl(): string {
  // 웹 환경에서는 로컬 백엔드 Express 포트(:5000)로 자동 라우팅
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

  // EXPO_PUBLIC_DOMAIN: Replit Secrets에 설정된 공개 백엔드 URL
  // ⚠️ 수정금지(승인필요) — Metro 번들러가 빌드 시 인라인 주입
  const host = process.env.EXPO_PUBLIC_DOMAIN;
  if (host) {
    if (host.startsWith("http://") || host.startsWith("https://")) {
      return host;
    }
    return `http://${host}`;
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

// ⚠️ 수정금지(승인필요) 2026-07-29 §22 = 로그인 토큰을 **반드시** 붙인다.
//   왜 필요한가(실측): 이 함수는 쿠키(credentials)만 보냈고 앱은 쿠키 인증을 쓰지 않는다 = 서버가 보기에 **항상 비로그인**.
//   그래서 크레딧 차감이 걸린 라우트(AI 의견 5·일별 영상 60)가 "비로그인=무과금" 규칙을 타고 **영구 무료**로 새고 있었다.
//   ⚠️ import 는 동적으로 한다 = auth.ts 가 이 파일의 getApiUrl 을 import 하므로 정적 import 면 순환 참조가 된다.
//   토큰 형식 검사는 expertApi.ts:36 규약 1벌과 동일(진짜 형식일 때만 첨부).
async function authHeader(): Promise<Record<string, string>> {
  try {
    const { getUserData } = await import("./auth");
    const user = await getUserData();
    if (user?.token && user.token.startsWith("simple_auth_token_v1_")) {
      return { Authorization: `Bearer ${user.token}` };
    }
  } catch {
    // 저장소 읽기 실패 = 비로그인으로 취급(요청 자체를 막지 않는다)
  }
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

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const baseUrl = getApiUrl();
    const url = new URL(queryKey.join("/") as string, baseUrl);

    // ⚠️ 수정금지(승인필요) 2026-07-30 = 여기도 토큰을 붙인다. apiRequest 만 고치면 useQuery 경로가
    //   토큰 없이 나가 서버가 "비로그인" 으로 보고, 크레딧이 걸린 라우트가 무과금으로 새는 같은 결함이 남는다(§0 = 1벌).
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
