// ⚠️ 수정금지(승인필요) 2026-10-29 사장님 결정 = 홍보 산출물 보관 1벌 = R2 system/marketing + 바탕화면 Tripis_mk/<도시 또는 공통 폴더> 같은 이름 · 가장 최근 산출물 찾기 1벌 (정본 큰 일 4)
import fs from "fs";
import os from "os";
import path from "path";
import { marketingKey } from "../shared/r2-paths";
import { uploadToR2 } from "../worker/lib/services/shared/r2-client";

const DESKTOP_DIR = path.join(os.homedir(), "Desktop", "Tripis_mk");
export const CHARACTER_FOLDER = "공통/캐릭터";

export async function keep(
  folder: string,
  name: string,
  body: Buffer,
  contentType: string,
): Promise<{ key: string; local: string }> {
  const key = marketingKey(name);
  await uploadToR2(key, body, contentType);
  const dir = path.join(DESKTOP_DIR, folder);
  fs.mkdirSync(dir, { recursive: true });
  const local = path.join(dir, path.basename(key));
  fs.writeFileSync(local, body);
  return { key, local };
}

export function latestIn(folder: string, suffix: string): string {
  const dir = path.join(DESKTOP_DIR, folder);
  const f = fs
    .readdirSync(dir)
    .filter((n) => n.endsWith(suffix))
    .sort()
    .pop();
  if (!f) throw new Error(`[store] 산출물 없음: ${folder}/*${suffix}`);
  return path.join(dir, f);
}

export const readScenario = (city: string): any =>
  JSON.parse(fs.readFileSync(`marketing/scenarios/${city}.json`, "utf-8"));
