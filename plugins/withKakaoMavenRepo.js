// ⚠️ 수정금지(승인필요) — Kakao Maven 저장소 자동 등록 플러그인
// 목적: @react-native-kakao/* 네이티브 모듈 빌드 시 `com.kakao.sdk:v2-common`, `com.kakao.sdk:v2-user` 의존성 해결
// 원인: Expo 관리형 프로젝트의 android/build.gradle 기본 repositories에 Kakao Maven 미포함
// 참조: https://github.com/react-native-kakao/react-native-kakao (README > Android > Maven repository)

const { withProjectBuildGradle } = require('expo/config-plugins');

const KAKAO_MAVEN_URL = 'https://devrepo.kakao.com/nexus/content/groups/public/';

module.exports = function withKakaoMavenRepo(config) {
  return withProjectBuildGradle(config, (cfg) => {
    const contents = cfg.modResults.contents;
    if (contents.includes('devrepo.kakao.com')) {
      return cfg;
    }
    const injection = `        maven { url '${KAKAO_MAVEN_URL}' }`;
    if (/allprojects\s*\{\s*repositories\s*\{/.test(contents)) {
      cfg.modResults.contents = contents.replace(
        /allprojects\s*\{\s*repositories\s*\{/m,
        (m) => `${m}\n${injection}`
      );
    } else {
      // allprojects 블록이 없을 경우 파일 끝에 추가
      cfg.modResults.contents = `${contents}\n\nallprojects {\n    repositories {\n${injection}\n    }\n}\n`;
    }
    return cfg;
  });
};
