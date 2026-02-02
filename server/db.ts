import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "@shared/schema";

const { Pool } = pg;

// DATABASE_URL이 없으면 경고만 출력하고 null로 설정
let pool: pg.Pool | null = null;
let db: ReturnType<typeof drizzle> | null = null;

if (!process.env.DATABASE_URL) {
  console.warn(
    "⚠️  DATABASE_URL이 설정되지 않았습니다.",
    "\n   DB 연동 기능이 비활성화됩니다.",
    "\n   Neon DB 연결을 위해 .env 파일에 DATABASE_URL을 설정하세요.",
  );
} else {
  try {
    pool = new Pool({ 
      connectionString: process.env.DATABASE_URL,
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
