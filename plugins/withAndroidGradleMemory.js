// ⚠️ 수정금지(승인필요) — Android Gradle JVM 메모리 확장 플러그인 (2026-04-18)
// 목적: preview(release) 프로필 빌드 시 lintVitalAnalyzeRelease 의 Metaspace OOM 방지
// 원인: GitHub Actions 러너(2코어/7GB)에서 기본 Gradle Metaspace(256MB)가 대규모 RN 앱의 Kotlin UAST Lint 분석에 부족
// 해결: gradle.properties 의 org.gradle.jvmargs 를 확장 (Heap 6G + Metaspace 2G)
// 참조 실패 run: 24615060846 (react-native-async-storage_async-storage:lintVitalAnalyzeRelease FAILED → Metaspace)

const { withGradleProperties } = require("expo/config-plugins");

const JVM_ARGS =
  "-Xmx6g -XX:MaxMetaspaceSize=2g -XX:+HeapDumpOnOutOfMemoryError -XX:+UseParallelGC -Dfile.encoding=UTF-8";

module.exports = function withAndroidGradleMemory(config) {
  return withGradleProperties(config, (cfg) => {
    const props = cfg.modResults;
    const existing = props.find(
      (item) => item.type === "property" && item.key === "org.gradle.jvmargs",
    );
    if (existing) {
      existing.value = JVM_ARGS;
    } else {
      props.push({
        type: "property",
        key: "org.gradle.jvmargs",
        value: JVM_ARGS,
      });
    }
    return cfg;
  });
};
