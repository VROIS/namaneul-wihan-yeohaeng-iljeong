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

# 서버 빌드 (esbuild)
RUN npm run server:build

# Expo 웹 빌드
RUN npx expo export --platform web

# 프로덕션 이미지
FROM node:20-alpine AS runner

WORKDIR /app

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

# 환경 변수
ENV NODE_ENV=production
ENV PORT=8000

# 포트 노출
EXPOSE 8000

# 서버 실행
CMD ["node", "server_dist/index.js"]
