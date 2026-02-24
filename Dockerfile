# Node.js 기반 NUBI 앱 빌드
FROM node:20-alpine AS builder

# 작업 디렉토리 설정
WORKDIR /app

# 패키지 파일 복사
COPY package*.json ./

# 의존성 설치
RUN npm ci

# 소스 코드 복사
COPY . .

# Git commit hash를 환경변수로 설정 (배포 버전 추적용)
ARG COMMIT_HASH=unknown
ENV COMMIT_HASH=${COMMIT_HASH}

# Koyeb 환경변수 → 빌드 시 클라이언트 번들에 포함 (OAuth)
ARG EXPO_PUBLIC_GOOGLE_CLIENT_ID
ENV EXPO_PUBLIC_GOOGLE_CLIENT_ID=${EXPO_PUBLIC_GOOGLE_CLIENT_ID}
ARG EXPO_PUBLIC_KAKAO_JAVASCRIPT_KEY
ENV EXPO_PUBLIC_KAKAO_JAVASCRIPT_KEY=${EXPO_PUBLIC_KAKAO_JAVASCRIPT_KEY}
ARG EXPO_PUBLIC_KAKAO_REST_API_KEY
ENV EXPO_PUBLIC_KAKAO_REST_API_KEY=${EXPO_PUBLIC_KAKAO_REST_API_KEY}

# 서버 빌드 (esbuild)
RUN npm run server:build

# Expo 웹 빌드
RUN npx expo export --platform web

# 프로덕션 이미지 — Python + MCP (noapi-google-search-mcp) 포함
# bookworm: Chromium/Playwright 의존성 호환
FROM node:20-bookworm-slim AS runner

WORKDIR /app

# Python 3 + noapi-google-search-mcp (Cursor MCP, API 비용 없음)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 \
    python3-pip \
    python3-venv \
    && pip3 install --break-system-packages --no-cache-dir noapi-google-search-mcp \
    && python3 -m playwright install --with-deps chromium \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# 프로덕션 의존성만 설치
COPY package*.json ./
RUN npm ci --omit=dev

# 빌드 결과물 복사
COPY --from=builder /app/server_dist ./server_dist
COPY --from=builder /app/dist ./dist

# 서버 템플릿 파일 복사 (관리자 대시보드 HTML 등)
COPY --from=builder /app/server/templates ./server_dist/templates
COPY --from=builder /app/server/templates ./server/templates

# 서버 데이터 파일 복사 (교통 요금 데이터 등)
COPY --from=builder /app/server/data ./server_dist/data
COPY --from=builder /app/server/data ./server/data

# 환경 변수 — MCP 활성화 (Gemini Search API 비용 제거)
ENV NODE_ENV=production
ENV PORT=8000
ENV USE_MCP_RAW=true
ENV MCP_GOOGLE_SEARCH_COMMAND=python3
ARG COMMIT_HASH=unknown
ENV COMMIT_HASH=${COMMIT_HASH}

# 포트 노출
EXPOSE 8000

# 서버 실행
CMD ["node", "server_dist/index.js"]
