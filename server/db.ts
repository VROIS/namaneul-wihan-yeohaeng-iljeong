import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

function convertToPoolerUrl(url: string): string {
  const match = url.match(/postgresql:\/\/postgres:([^@]+)@db\.([^.]+)\.supabase\.co:5432\/postgres/);
  if (match) {
    const [, password, projectRef] = match;
    const poolerUrl = `postgresql://postgres.${projectRef}:${password}@aws-1-eu-west-3.pooler.supabase.com:6543/postgres`;
    console.log("[DB] Direct connection URL → Transaction Pooler URL 자동 변환");
    return poolerUrl;
  }
  return url;
}

const rawConnectionString = process.env.SUPABASE_DATABASE_URL || process.env.DATABASE_URL;
const connectionString = rawConnectionString ? convertToPoolerUrl(rawConnectionString) : rawConnectionString;

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
    });
    
    // 연결 시 UTF-8 인코딩 강제 설정
    pool.on('connect', (client) => {
      client.query("SET client_encoding TO 'UTF8'");
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
