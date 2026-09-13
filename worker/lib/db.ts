// ⚠️ 수정금지(승인필요) 2026-09-13 사장님 결정 = 엔진·필시티가 같은 db.ts 1벌을 쓴다. Worker 안 = 요청마다 Hyperdrive Pool(max 5, 끝에 닫음) / Node(필시티 CLI) = 운영 server/db.ts 와 같은 고정 Pool 1개(SUPA_URL). 엔진 파일은 그대로, 이 파일 1개만 바꿔 낀다 (정본 §)
import { AsyncLocalStorage } from "node:async_hooks";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";
import { IS_WORKER } from "./services/shared/runtime";

const { Pool } = pg;

type EngineDb = NodePgDatabase<typeof schema>;
type Ctx = { pool: pg.Pool; db: EngineDb };

const store = new AsyncLocalStorage<Ctx>();
const POOL_OPTS = {
  options: "-c client_encoding=UTF8",
  idleTimeoutMillis: 35000,
};

function attach(p: pg.Pool): pg.Pool {
  p.on("connect", (client) => {
    client.query("SET client_encoding TO 'UTF8'");
  });
  p.on("error", (err: Error) => {
    console.error("❌ [DB Pool] 유휴 커넥션 오류(자동 복구됨):", err.message);
  });
  return p;
}

let nodeCtx: Ctx | null = null;
function nodeContext(): Ctx {
  if (!nodeCtx) {
    const connectionString =
      process.env.SUPA_URL ||
      process.env.SUPABASE_DATABASE_URL ||
      process.env.DATABASE_URL;
    if (!connectionString)
      throw new Error(
        "[db] SUPA_URL / SUPABASE_DATABASE_URL / DATABASE_URL 없음",
      );
    const p = attach(new Pool({ connectionString, ...POOL_OPTS }));
    nodeCtx = { pool: p, db: drizzle(p, { schema }) };
  }
  return nodeCtx;
}

function current(): Ctx {
  const c = store.getStore();
  if (c) return c;
  if (!IS_WORKER) return nodeContext();
  throw new Error("[db] withEngineDb() 안에서만 엔진 DB 를 쓸 수 있다");
}

export async function withEngineDb<T>(run: () => Promise<T>): Promise<T> {
  const { env } = await import("cloudflare:workers");
  const p = attach(
    new Pool({
      connectionString: env.HYPERDRIVE.connectionString,
      ...POOL_OPTS,
      max: 5,
    }),
  );
  const dbInstance = drizzle(p, { schema });
  try {
    return await store.run({ pool: p, db: dbInstance }, run);
  } finally {
    // 장부(external_calls) 등 던져 놓은 쿼리가 대기열에 남아 있으면 pool.end() 가 버린다 → 대기열이 빌 때까지(최대 10초) 기다린 뒤 닫는다
    const until = Date.now() + 10_000;
    while (p.waitingCount > 0 && Date.now() < until)
      await new Promise((r) => setTimeout(r, 25));
    await p.end().catch(() => {});
  }
}

function bindTo<T extends object>(pick: () => T): T {
  return new Proxy({} as T, {
    get(_t, prop) {
      const target = pick() as unknown as Record<string | symbol, unknown>;
      const v = target[prop];
      return typeof v === "function"
        ? (v as (...a: unknown[]) => unknown).bind(target)
        : v;
    },
  });
}

const pool: pg.Pool | null = bindTo(() => current().pool);
const db: EngineDb | null = bindTo(() => current().db);

export { pool, db };

export function isDatabaseConnected(): boolean {
  return !IS_WORKER || store.getStore() != null;
}
