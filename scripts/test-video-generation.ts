/**
 * Seedance 영상 생성 테스트 스크립트 (Text-to-Video)
 * 
 * 실행: npx tsx scripts/test-video-generation.ts
 */

import * as dotenv from "dotenv";
dotenv.config();

import { generateSeedanceClip } from "../server/services/seedance-video-generator";

async function runTest() {
    console.log("🎬 Starting Seedance Video Generation Test...");
    console.log("---------------------------------------------");

    const testPrompt = "A cinematic shot of a cute Korean child looking at the Eiffel Tower with wonder, warm sunlight, Studio Ghibli style, high quality, 4k";

    console.log(`📝 Prompt: "${testPrompt}"`);
    console.log("⏳ Sending request to BytePlus API...");

    try {
        const result = await generateSeedanceClip({
            prompt: testPrompt,
            duration: 5, // 테스트용으로 짧게
            aspectRatio: "9:16",
        });

        console.log("---------------------------------------------");

        if (result.success) {
            console.log("✅ Video Generation Successful! 🎉");
            console.log(`🆔 Task ID: ${result.taskId}`);
            console.log(`⏱️ Processing Time: ${(result.processingTime || 0) / 1000}s`);
            console.log(`🔗 Video URL: ${result.videoUrl}`);
        } else {
            console.error("❌ Video Generation Failed!");
            console.error(`Error: ${result.error}`);
            if (result.taskId) console.error(`Task ID: ${result.taskId}`);
        }

    } catch (error) {
        console.error("❌ Script Error:", error);
    }
}

runTest()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
