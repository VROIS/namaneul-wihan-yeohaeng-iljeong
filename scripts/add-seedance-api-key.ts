/**
 * Seedance API 키 DB 저장 스크립트
 * 
 * 실행: npx tsx scripts/add-seedance-api-key.ts
 */

import * as dotenv from "dotenv";
import { drizzle } from "drizzle-orm/node-postgres";
import pg from "pg";
import { apiKeys } from "../shared/schema";

dotenv.config(); // .env 파일 로드

const { Pool } = pg;

async function addSeedanceApiKey() {
    console.log("Adding Seedance API key to database...");

    if (!process.env.DATABASE_URL) {
        console.error("❌ DATABASE_URL is not defined in .env");
        process.exit(1);
    }

    // 직접 DB 연결 생성
    const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        // Supabase 연결 옵션 (필요시)
        connectionTimeoutMillis: 10000,
    });

    const db = drizzle(pool, { schema: { apiKeys } });

    try {
        // Seedance API 키 정보
        const seedanceKeys = [
            {
                keyName: "SEEDANCE_API_KEY",
                keyValue: "29e41ec6-ef9c-4cf5-b6c3-5ef5e0d08713",
                displayName: "Seedance 1.5 Pro API Key",
                description: "영상 생성용 Seedance 1.5 Pro API 키 (중국 회사, 무료 테스트)",
                isActive: true,
            },
            {
                keyName: "SEEDANCE_PROJECT_ID",
                keyValue: "3001035846",
                displayName: "Seedance Project ID",
                description: "Seedance 프로젝트 ID",
                isActive: true,
            },
        ];

        for (const key of seedanceKeys) {
            // 기존 키 확인
            const existing = await db.query.apiKeys.findFirst({
                where: (apiKeys, { eq }) => eq(apiKeys.keyName, key.keyName),
            });

            if (existing) {
                console.log(`${key.keyName} already exists, updating...`);
                // 업데이트
                await db
                    .update(apiKeys)
                    .set({ keyValue: key.keyValue })
                    .where(eq(apiKeys.keyName, key.keyName));
            } else {
                await db.insert(apiKeys).values(key);
                console.log(`${key.keyName} added successfully!`);
            }
        }

        console.log("✅ Seedance API keys saved to database!");

    } catch (error) {
        console.error("Error adding Seedance API key:", error);
        throw error;
    } finally {
        // 연결 종료
        await pool.end();
    }
}

// 'eq' 함수 import 필요
import { eq } from "drizzle-orm";

addSeedanceApiKey()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
