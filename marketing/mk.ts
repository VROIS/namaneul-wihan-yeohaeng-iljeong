// ⚠️ 수정금지(승인필요) 2026-10-28 사장님 결정 = 홍보물 도구 입구 1벌 = npx tsx marketing/mk.ts <일> (키 = DB api_keys, 산출물 = store.ts) (정본 큰 일 4)
import postgres from "postgres";
import { loadEnv, parseArgs } from "../fillcity/steps/common";
import { ensureKeys } from "../worker/keys";
import { pool } from "../worker/lib/db";
import { drawAppCards, drawCharacters, installAppCards } from "./characters";
import { drawScenes } from "./scenes";

async function main(): Promise<void> {
  loadEnv();
  const args = parseArgs();
  const job = process.argv[2];

  const sql = postgres(
    String(process.env.SUPA_URL || process.env.DATABASE_URL),
    { ssl: { rejectUnauthorized: false }, max: 1 },
  );
  await ensureKeys(sql);
  await sql.end();

  if (job === "characters") await drawCharacters(args.only);
  else if (job === "appcards") await drawAppCards(args.only);
  else if (job === "install") await installAppCards();
  else if (job === "scenes") await drawScenes(args.city, args.only);
  else if (job === "clips")
    await (
      await import("./clips")
    ).makeClips(args.city, args.only, args.res === "720p" ? "720p" : "360p");
  else if (job === "cards")
    await (await import("./assemble")).keepCards(args.city, args.from);
  else if (job === "assemble")
    await (await import("./assemble")).assemble(args.city);
  else
    throw new Error(
      `[mk] 모르는 일: ${job} (characters · appcards · install · scenes --city=<도시> · clips --city=<도시> --res=360p|720p · cards --city=<도시> --from=<폴더> · assemble --city=<도시>)`,
    );
  await pool?.end();
}

void main();
