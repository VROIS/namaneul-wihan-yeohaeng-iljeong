// 시험판(임시 폴더 전용) = 거점 병합의 저장소 쪽 = 옛 도시 폴더의 모든 것(R2 사진·원본·보고서·영상 + 이 PC 원본·보고서)을 거점 폴더로 붙이고, DB 안의 옛 주소(여정·가이드)와 외부 호출 기록의 도시 번호를 거점으로 바꾼다 · --delete-old = 옛 주소가 0 인 것을 확인한 뒤 옛 R2 폴더를 지운다
import fs from "fs";
import path from "path";
import { connectDb, loadEnv, parseArgs } from "./common";
import {
  deleteFromR2,
  getFromR2,
  listR2,
  uploadToR2,
} from "../../worker/lib/services/shared/r2-client";

loadEnv();
const argv = parseArgs();
const from = Number(argv["from"] || 0);
const to = Number(argv["to"] || 0);
const apply = argv["apply"] === "true";
const deleteOld = argv["delete-old"] === "true";
const REPO = String(argv["repo"] || "C:/Users/hzino/Desktop/my-handy-guide2");
const PUB = String(process.env.R2_PUBLIC_URL || "").replace(/\/+$/, "");
const TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".json": "application/json",
  ".jsonl": "application/x-ndjson",
  ".txt": "text/plain; charset=utf-8",
  ".mp4": "video/mp4",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
};
const typeOf = (k: string) =>
  TYPES[path.extname(k).toLowerCase()] ?? "application/octet-stream";
const suffixed = (k: string) => {
  const e = path.extname(k);
  return `${k.slice(0, k.length - e.length)}_from${from}${e}`;
};
const isLedger = (k: string) => /(^|\/)insert-ledger\.json$/.test(k);

async function refCounts(c: any) {
  const re = `(media\\.tripis\\.app/|^|")${from}/(images|raw|videos|reports)/`;
  const q = async (t: string, col: string) =>
    (
      await c.query(
        `SELECT count(*)::int n FROM ${t} WHERE ${col}::text ~ $1`,
        [re],
      )
    ).rows[0].n as number;
  return {
    "place_seed_raw.image_url": await q("place_seed_raw", "image_url"),
    "itineraries.raw_data": await q("itineraries", "raw_data"),
    "itineraries.video_by_day": await q("itineraries", "video_by_day"),
    "itineraries.video_url": await q("itineraries", "video_url"),
    "guides.image_url": await q("guides", "image_url"),
    "external_calls.city_id": (
      await c.query(
        "SELECT count(*)::int n FROM external_calls WHERE city_id=$1",
        [from],
      )
    ).rows[0].n as number,
  };
}

(async () => {
  if (!from || !to || from === to) {
    console.error(
      "Usage: --from=<옛 도시 번호> --to=<거점 번호> [--apply] [--delete-old]",
    );
    process.exit(1);
  }
  const c = await connectDb();
  const left = (
    await c.query(
      "SELECT (SELECT count(*) FROM place_seed_raw WHERE city_id=$1)::int rows, (SELECT count(*) FROM cities WHERE id=$1)::int city, (SELECT count(*) FROM cities WHERE id=$2)::int hub",
      [from, to],
    )
  ).rows[0];
  if (left.rows !== 0 || left.hub !== 1)
    throw new Error(
      `먼저 행을 거점으로 옮겨야 한다(옛 폴더 행 ${left.rows} · 거점 도시 행 ${left.hub})`,
    );
  const src: any[] = await listR2(`${from}/`);
  const dstKeys = new Map<string, number>(
    ((await listR2(`${to}/`)) as any[]).map((o) => [
      String(o.key),
      Number(o.size || 0),
    ]),
  );
  const kinds: Record<string, number> = {};
  for (const o of src) {
    const k = String(o.key).split("/")[1] || "(루트)";
    kinds[k] = (kinds[k] || 0) + 1;
  }
  console.log(
    `═══ 저장소 병합 ${from} → ${to} · R2 옛 폴더 ${src.length}개 ${JSON.stringify(kinds)} · ${apply ? "APPLY" : "DRY"}${deleteOld ? " · 옛 폴더 삭제" : ""} ═══`,
  );
  console.log(
    "  DB 에서 옛 폴더를 가리키는 곳(전) =",
    JSON.stringify(await refCounts(c)),
  );

  // 1) R2 복사
  const renamed = new Map<string, string>();
  let copied = 0,
    same = 0,
    merged = 0;
  for (const o of src) {
    const oldKey = String(o.key);
    let newKey = `${to}/${oldKey.slice(String(from).length + 1)}`;
    if (dstKeys.has(newKey)) {
      if (isLedger(newKey)) {
        if (apply) {
          const a = JSON.parse((await getFromR2(newKey))!.toString("utf8"));
          const b = JSON.parse((await getFromR2(oldKey))!.toString("utf8"));
          await uploadToR2(
            newKey,
            Buffer.from(JSON.stringify({ ...b, ...a }, null, 2)),
            "application/json",
          );
        }
        merged++;
        continue;
      }
      if (dstKeys.get(newKey) === Number(o.size || 0)) {
        same++;
        continue;
      }
      newKey = suffixed(newKey);
      renamed.set(oldKey, newKey);
      console.log(`  ↪ 이름 겹침 = ${oldKey} → ${newKey}`);
    }
    if (apply) {
      const body = await getFromR2(oldKey);
      if (!body) throw new Error(`옛 파일을 못 읽음 = ${oldKey}`);
      await uploadToR2(newKey, body, typeOf(newKey));
    }
    copied++;
  }
  console.log(
    `  R2 = 복사 ${copied} · 이미 같은 파일 ${same} · 장부 합침 ${merged} · 이름 바꿔 복사 ${renamed.size}`,
  );

  // 2) DB 안의 주소·도시 번호
  const oldP = `${PUB}/${from}/`;
  const newP = `${PUB}/${to}/`;
  if (apply) {
    await c.query("BEGIN");
    try {
      for (const [ok, nk] of renamed)
        for (const col of ["raw_data", "video_by_day"])
          await c.query(
            `UPDATE itineraries SET ${col} = replace(${col}::text, $1, $2)::jsonb WHERE ${col}::text LIKE '%' || $1 || '%'`,
            [`${PUB}/${ok}`, `${PUB}/${nk}`],
          );
      const a = await c.query(
        `UPDATE itineraries SET raw_data = replace(raw_data::text, $1, $2)::jsonb WHERE raw_data::text LIKE '%' || $1 || '%'`,
        [oldP, newP],
      );
      const b = await c.query(
        `UPDATE itineraries SET video_by_day = replace(video_by_day::text, $1, $2)::jsonb WHERE video_by_day::text LIKE '%' || $1 || '%'`,
        [oldP, newP],
      );
      const v = await c.query(
        `UPDATE itineraries SET video_url = replace(video_url, $1, $2) WHERE video_url LIKE '%' || $1 || '%'`,
        [oldP, newP],
      );
      const g = await c.query(
        `UPDATE guides SET image_url = replace(image_url, $1, $2) WHERE image_url LIKE '%' || $1 || '%'`,
        [oldP, newP],
      );
      const e = await c.query(
        `UPDATE external_calls SET city_id = $2 WHERE city_id = $1`,
        [from, to],
      );
      await c.query("COMMIT");
      console.log(
        `  DB = 여정 장소·사진 주소 ${a.rowCount} · 여정 일별 영상 ${b.rowCount} · 여정 영상 ${v.rowCount} · 가이드 사진 ${g.rowCount} · 외부 호출 기록 ${e.rowCount}`,
      );
    } catch (err) {
      await c.query("ROLLBACK");
      throw err;
    }
  }
  const after = await refCounts(c);
  console.log("  DB 에서 옛 폴더를 가리키는 곳(후) =", JSON.stringify(after));

  // 3) 이 PC 폴더(원본 · 보고서)
  for (const sub of ["docs/raw", "docs/b1-reports"]) {
    const a = path.join(REPO, sub, String(from));
    const b = path.join(REPO, sub, String(to));
    if (!fs.existsSync(a)) continue;
    const names = fs.readdirSync(a);
    let moved = 0,
      clash = 0;
    for (const n of names) {
      let dst = path.join(b, n);
      if (fs.existsSync(dst)) {
        if (isLedger(n)) {
          if (apply) {
            const x = JSON.parse(fs.readFileSync(dst, "utf-8"));
            const y = JSON.parse(fs.readFileSync(path.join(a, n), "utf-8"));
            fs.writeFileSync(dst, JSON.stringify({ ...y, ...x }, null, 2));
            fs.rmSync(path.join(a, n));
          }
          clash++;
          continue;
        }
        dst = suffixed(dst);
        clash++;
      }
      if (apply) {
        fs.mkdirSync(b, { recursive: true });
        fs.renameSync(path.join(a, n), dst);
      }
      moved++;
    }
    if (apply && fs.existsSync(a) && !fs.readdirSync(a).length) fs.rmdirSync(a);
    console.log(
      `  이 PC ${sub}/${from} → /${to} = 옮김 ${moved} · 이름 겹침 ${clash}`,
    );
  }

  // 4) 옛 R2 폴더 삭제 = 옛 주소가 0 이고 새 자리에 전부 있을 때만
  if (apply && deleteOld) {
    const refs = Object.values(after).reduce((s, n) => s + n, 0);
    const now = new Set(
      ((await listR2(`${to}/`)) as any[]).map((o) => String(o.key)),
    );
    const missing = src.filter((o) => {
      const ok = String(o.key);
      return !now.has(
        renamed.get(ok) ?? `${to}/${ok.slice(String(from).length + 1)}`,
      );
    });
    if (refs !== 0 || missing.length)
      throw new Error(
        `옛 폴더를 지우지 않음 = 옛 주소 ${refs}곳 · 새 자리에 없는 파일 ${missing.length}개`,
      );
    for (const o of src) await deleteFromR2(String(o.key));
    console.log(
      `  옛 R2 폴더 ${from}/ 삭제 = ${src.length}개 · 남은 것 ${((await listR2(`${from}/`)) as any[]).length}`,
    );
  }
  await c.end();
  process.exit(0);
})().catch((e) => {
  console.error("✗ 저장소 병합 실패:", e?.message || e);
  process.exit(1);
});
