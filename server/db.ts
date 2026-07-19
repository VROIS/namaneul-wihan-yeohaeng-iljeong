import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

function convertToPoolerUrl(url: string): string {
  const match = url.match(
    /postgresql:\/\/postgres:([^@]+)@db\.([^.]+)\.supabase\.co:5432\/postgres/,
  );
  if (match) {
    const [, password, projectRef] = match;
    const poolerUrl = `postgresql://postgres.${projectRef}:${password}@aws-1-eu-west-3.pooler.supabase.com:6543/postgres`;
    console.log(
      "[DB] Direct connection URL → Transaction Pooler URL 자동 변환",
    );
    return poolerUrl;
  }
  return url;
}

const rawConnectionString =
  process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;
const connectionString = rawConnectionString
  ? convertToPoolerUrl(rawConnectionString)
  : rawConnectionString;

let pool: pg.Pool | null = null;
let db: ReturnType<typeof drizzle> | null = null;

if (!connectionString) {
  console.warn(
    "⚠️  DATABASE_URL이 설정되지 않았습니다.",
    "\n   DB 연동 기능이 비활성화됩니다.",
    "\n   Supabase PostgreSQL 연결을 위해 SUPABASE_DATABASE_URL을 설정하세요.",
  );
} else {
  try {
    pool = new Pool({
      connectionString,
      // 🇰🇷 한글 인코딩 보장을 위한 UTF-8 설정
      options: "-c client_encoding=UTF8",
      // ⚠️ 2026-07-16 §0 = 폴링주기(30초)보다 짧은 기본 idleTimeoutMillis(10초) 때문에 매 요청이 콜드 재연결(TCP+TLS+SCRAM) 되던 지연 제거. 시뮬 실측(SELECT 1 재사용 5ms vs 재연결 42ms) 확인.
      idleTimeoutMillis: 35000,
    });

    // 연결 시 UTF-8 인코딩 강제 설정
    pool.on("connect", (client) => {
      client.query("SET client_encoding TO 'UTF8'");
    });

    // ⚠️ 2026-07-16 §0 = 유휴 커넥션이 원격에서 끊기면 pg-pool 이 'error' 를 emit 하는데 리스너가 없으면 Node 가 uncaughtException 으로 프로세스 전체가 죽음(시뮬 재현 확인). 로그만 남기고 삼켜서 다음 요청에서 자동 재연결되게 함.
    pool.on("error", (err: Error) => {
      console.error("❌ [DB Pool] 유휴 커넥션 오류(자동 복구됨):", err.message);
    });

    db = drizzle(pool, { schema });
    console.log("✅ 데이터베이스 연결 성공 (UTF-8 인코딩)");
  } catch (error) {
    console.error("❌ 데이터베이스 연결 실패:", error);
  }
}

// DB가 없어도 사용 가능하도록 export
export { pool, db };

// DB 연결 상태 확인 함수
export function isDatabaseConnected(): boolean {
  return db !== null && pool !== null;
}
