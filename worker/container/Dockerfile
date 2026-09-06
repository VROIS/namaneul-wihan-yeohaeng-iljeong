# Cloudflare Containers = 영상 합성(ffmpeg) 이미지 (2026-09-06)
#
# 근거: developers.cloudflare.com/containers/ = wrangler.jsonc 의 containers[].image 가
#       이 Dockerfile 을 가리킨다. 빌드·푸시는 `wrangler deploy` 가 한다.

# node:22-alpine = Node 22 + Alpine(작다). 여기에 OS 패키지 ffmpeg 만 얹는다.
#
# ⚠️ ffmpeg 는 **OS 패키지(apk)** 로 깐다. npm 의 ffmpeg-static 을 쓰지 않는다.
#    이유 ① 이미지 크기: apk 판은 시스템 공유 라이브러리를 쓴다.
#         ② 아키텍처 안정성: ffmpeg-static 은 설치하는 머신의 플랫폼에 맞는 바이너리를
#            내려받으므로, 윈도우/맥에서 빌드하면 linux 컨테이너에서 실행이 안 된다.
#            apk 는 이미지 안에서 깔리므로 항상 컨테이너 아키텍처와 일치한다.
FROM node:22-alpine

# --no-cache = 패키지 색인을 이미지에 남기지 않는다(용량).
RUN apk add --no-cache ffmpeg

WORKDIR /app

# 의존성 0개(Node 내장 http·fs·child_process + 런타임 fetch 만 쓴다) = package.json·npm install 이 없다.
# 그래서 소스 한 벌만 넣으면 끝난다 = 이미지가 가장 작고 빌드가 가장 빠르다.
COPY server.mjs ./server.mjs

# 컨테이너 안에서 열 포트.
# 🔴 이 값은 worker/routes-video-generate.ts 의 `defaultPort` 와 **반드시 같아야 한다**.
#    Container 클래스가 이 포트가 열릴 때까지 요청을 붙들었다가 흘려보내기 때문이다.
ENV PORT=8080
EXPOSE 8080

CMD ["node", "server.mjs"]
