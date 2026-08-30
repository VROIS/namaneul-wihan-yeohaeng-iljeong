// ⚠️ 수정금지(승인필요) — Android Gradle JVM 메모리 확장 플러그인 (2026-04-18)

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
