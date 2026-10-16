// ⚠️ 수정금지(승인필요) — Kakao Maven 저장소 자동 등록 플러그인

const { withProjectBuildGradle } = require("expo/config-plugins");

const KAKAO_MAVEN_URL =
  "https://devrepo.kakao.com/nexus/content/groups/public/";

module.exports = function withKakaoMavenRepo(config) {
  return withProjectBuildGradle(config, (cfg) => {
    const contents = cfg.modResults.contents;
    if (contents.includes("devrepo.kakao.com")) {
      return cfg;
    }
    const injection = `        maven { url '${KAKAO_MAVEN_URL}' }`;
    if (/allprojects\s*\{\s*repositories\s*\{/.test(contents)) {
      cfg.modResults.contents = contents.replace(
        /allprojects\s*\{\s*repositories\s*\{/m,
        (m) => `${m}\n${injection}`,
      );
    } else {
      cfg.modResults.contents = `${contents}\n\nallprojects {\n    repositories {\n${injection}\n    }\n}\n`;
    }
    return cfg;
  });
};
