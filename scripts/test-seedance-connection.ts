/**
 * Seedance API 연결 테스트 스크립트
 * 
 * 실행: npx tsx scripts/test-seedance-connection.ts
 */

import * as dotenv from "dotenv";
dotenv.config();

import { testBytePlusConnection } from "../server/services/seedance-video-generator";

async function runTest() {
    console.log("Testing Seedance API connection...");

    try {
        const result = await testBytePlusConnection();

        if (result.connected) {
            console.log("✅ Connection Successful!");
            console.log(result.message);
        } else {
            console.error("❌ Connection Failed!");
            console.error(result.message);
        }
    } catch (error) {
        console.error("❌ Test Script Error:", error);
    }
}

runTest()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
