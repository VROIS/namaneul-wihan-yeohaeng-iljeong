// ⚠️ 수정금지(승인필요) 2026-10-05 사장님 결정 = v3.2 최적화 (정본 §)
import fs from "fs";
import path from "path";
import { ROOT, loadEnv, parseArgs, retryFailed, runTsx, stamp } from "./common";
import { LANGS } from "../../worker/lib/services/shared/language-instruction";

loadEnv();
const argv = parseArgs();
const cityId = Number(argv["city-id"] || 0);
const langs: string[] = argv["langs"]
  ? String(argv["langs"])
      .split(",")
      .map((s) => s.trim())
  : [...LANGS];
const RUN = path.join(
  ROOT,
  "fillcity/prompts/02-discover-best20-perlang/run.ts",
);

(async () => {
  if (!cityId) {
    console.error("Usage: --city-id=<N> [--langs=ko,en,...]");
    process.exit(1);
  }
  const rawDir = path.join(ROOT, "docs", "raw", String(cityId));
  const st = stamp();
  // ⚠️ 수정금지(승인필요) 2026-10-07 사장님 결정 = 언어별 발굴 실행 = 공용 runTsx 1벌(출력 줄마다 언어 꼬리표) (정본 §)
  const callLang = (lang: string) =>
    runTsx(RUN, [`--city-id=${cityId}`, `--lang=${lang}`], (l) =>
      console.log(`[${lang}] ${l}`),
    );
  const saved = (lang: string) =>
    fs.existsSync(rawDir) &&
    fs
      .readdirSync(rawDir)
      .some((x) => x.endsWith(`_gemini-best20perlang-${lang}.json`) && x >= st);
  const t0 = Date.now();
  console.log(
    `🔴 제미니 발굴 ${langs.length}개 언어 동시 (${langs.join(",")})`,
  );
  const codes = await Promise.all(langs.map(callLang));
  // 실패한 언어 = 저장된 응답이 있으면 그대로(돈을 다시 쓰지 않는다), 없을 때만 그 언어만 다시 호출
  const stillFailed = await retryFailed(langs, codes, async (lang) => {
    if (saved(lang)) return true;
    console.error(`⚠️ ${lang} 실패 + 저장된 응답 없음 = 그 언어만 다시 호출`);
    return (await callLang(lang)) === 0 || saved(lang);
  });
  console.log(
    `═══ 제미니 발굴 끝 = ${langs.length - stillFailed.length}/${langs.length}개 언어 저장 · ${Math.round((Date.now() - t0) / 1000)}초 ═══`,
  );
  if (stillFailed.length) {
    console.error(`✗ 끝내 실패한 언어 = ${stillFailed.join(",")}`);
    process.exit(1);
  }
  process.exit(0);
})().catch((e) => {
  console.error("✗ 제미니 발굴 실패:", e?.message || e);
  process.exit(1);
});
