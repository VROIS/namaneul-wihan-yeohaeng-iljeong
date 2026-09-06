// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");
const eslintPluginPrettierRecommended = require("eslint-plugin-prettier/recommended");

module.exports = defineConfig([
  expoConfig,
  eslintPluginPrettierRecommended,
  {
    // ⚠️ 2026-07-19 §22 = 프로젝트 전역 규칙 조정 = 오탐·비버그 스타일 규칙 완화(진짜 버그만 error).
    // JSX 텍스트 안 따옴표(') = 웹 HTML 엔티티 규칙 = React Native 엔 무의미(네이티브 렌더) = off.
    // (unused-vars 는 expo config 기본이 이미 warn = 커밋 차단 안 함 = 별도 조정 불필요.)
    rules: {
      "react/no-unescaped-entities": "off",
    },
  },
  {
    // ⚠️ 2026-07-19 §22 = scripts·서버측 = Node 실행환경 = __dirname·Buffer·process·require 전역 인정(no-undef 오탐 제거).
    files: [
      "scripts/**/*.{ts,js,mjs,cjs}",
      "server/**/*.{ts,js}",
      // ⚠️ 2026-09-06 = worker/container = 컨테이너(Linux VM) 안에서 도는 **진짜 Node** 파일
      //   = Workers 런타임이 아니므로 Buffer·process·require 전역이 정상(no-undef 오탐 제거).
      "worker/container/**/*.{js,mjs}",
      "fillcity/**/*.ts",
      "plugins/**/*.js",
      "*.js",
      "*.ts",
      "*.mjs",
    ],
    languageOptions: {
      globals: {
        __dirname: "readonly",
        __filename: "readonly",
        Buffer: "readonly",
        process: "readonly",
        require: "readonly",
        module: "writable",
        exports: "writable",
        global: "readonly",
        console: "readonly",
      },
    },
  },
  {
    // ⚠️ 수정금지(승인필요) 2026-07-19 사장님 SSOT (§22) = lint 대상 = 진짜 코드(client·server·shared)만.
    // = .claude/skills·.agents/memory = 프롬프트·메모리 문서(§18/§20 보호=코드 아님) / migrations = SQL / docs·백업 = 문서.
    //   이들을 lint 대상에서 제외 = 프롬프트 자동재포맷으로 인한 §18/§20 위반 방지 + 진짜 코드 오류만 검출.
    ignores: [
      // 빌드산출물·의존성·백업 = lint 대상 아님 (expo lint 가 이들을 검사해 prettier 오류 수천개 나온 근원)
      "dist/**",
      "dist-server/**",
      "server_dist/**",
      "node_modules/**",
      // ⚠️ 수정금지(승인필요) 2026-09-06 사장님 결정 = Worker 빌드산출물·자동생성 타입은 lint 대상 아님
      //   .wrangler/tmp = wrangler 가 만드는 임시 번들(우리가 쓴 코드 아님)
      //   worker-configuration.d.ts = `wrangler types` 자동생성(5만 줄) = 손으로 고치는 파일 아님
      "worker/.wrangler/**",
      "worker/worker-configuration.d.ts",
      ".history/**", // VS Code Local History 자동백업(gitignore됨=커밋X) = 옛 스냅샷 오류 근원
      "dev/**", // 개발용 임시
      "web/**", // 빌드 웹 산출물
      "bts-app/**", // 독립 별도 앱(자체 package.json·node_modules) = 메인 Tripis 코드 아님 = 자기 앱에서 lint
      // ⚠️ 2026-07-19 §12 = 레거시 카메라 모듈 이식본(내손안에가이드 main-input-screen-rn-v1.0) = 기종불문 검증완료 = 내부 0수정 원칙(§12) = lint 규칙 적용 안 함(우리 스타일로 재포맷 = 검증파괴 위험). GuideStackNavigator·GuidePlaceholder(우리 배선 tsx)는 상위 폴더라 정상 lint.
      "client/screens/guide/**",
      "scripts/db_cleanup.js", // 한글깨짐 파싱에러 죽은 1회용 스크립트
      "scripts/fix-db-issues.js", // 동일
      "scripts/verify-workflow.mjs", // Workflow 전역함수(agent·parallel) = 런타임 주입 = eslint 파싱 대상 아님
      "scripts/dev-pipeline.mjs", // 동일 = Workflow 스크립트(top-level await/return = 특수 실행 컨텍스트)
      // 코드 아님(§18/§20 프롬프트·문서 보호) = 자동재포맷 금지
      ".claude/**",
      ".agents/**",
      "migrations/**",
      "docs/**",
      "backups/**",
      "reference/**",
      "legacy-guide/**",
      // 2026-07-22 지브리영상 = 외부작업(Antigravity) 산출물 보존폴더·1회용 스크립트 = 코드 아님 = lint·커밋 대상 제외
      "deliverables_ghibli_video/**",
      "scratch_*.ts",
    ],
  },
  {
    // ⚠️ 2026-07-19 §22 = scripts = 1회용 Node 정리·실험 스크립트(require·상대경로·죽은import 정상) = 앱코드 아님 = import 규칙 오탐 완화.
    files: ["scripts/**/*.{js,ts,mjs,cjs}"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "import/no-unresolved": "off",
    },
  },
  {
    // ⚠️ 2026-07-19 §22 = server = Node 서버 전용(@google-cloud/storage 등 서버패키지) = 클라 resolver 가 못 찾는 오탐 완화.
    files: ["server/**/*.ts"],
    rules: {
      "import/no-unresolved": "off",
    },
  },
  {
    // ⚠️ 수정금지(승인필요) 2026-09-06 사장님 결정 = worker = Cloudflare 런타임 전용 모듈(cloudflare:node·cloudflare:workers) = resolver 오탐 완화
    files: ["worker/**/*.ts"],
    rules: {
      "import/no-unresolved": "off",
    },
  },
]);
