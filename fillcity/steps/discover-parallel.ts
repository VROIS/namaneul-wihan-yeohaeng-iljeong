// ⚠️ 수정금지(승인필요) 2026-10-05 사장님 결정 = v3.2 최적화 (정본 §)
import fs from "fs";
import path from "path";
import { rawDirOf } from "../../worker/lib/services/shared/local-paths";
import {
  ROOT,
  loadEnv,
  parseArgs,
  retryFailed,
  runTsx,
  stamp,
  stampOf,
} from "./common";
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
  const rawDir = rawDirOf(cityId);
  // ⚠️ 수정금지(승인필요) 2026-10-07 사장님 결정 = 이어 돌기 = --since(이 판 시작 시각) 뒤 이미 받은 언어는 다시 부르지 않는다 · 이어 돌 때도 이중 호출 0 (정본 §)
  const st = argv["since"] ? stampOf(String(argv["since"])) : stamp();
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
  const have = langs.filter(saved);
  if (have.length)
    console.log(
      `↪ 이어 돌기 = 이미 받은 언어 ${have.join(",")} 는 다시 부르지 않는다(이중 호출 0)`,
    );
  const todo = langs.filter((l) => !have.includes(l));
  console.log(
    `🔴 제미니 발굴 ${todo.length}개 언어 동시 (${todo.join(",") || "없음"})`,
  );
  const codes = await Promise.all(todo.map(callLang));
  const stillFailed = await retryFailed(todo, codes, async (lang) => {
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
