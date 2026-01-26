/**
 * Phase E - BytePlus ModelArk Seedance 1.5 Pro 영상 클립 생성 서비스
 * 
 * API 문서: https://docs.byteplus.com/en/docs/ModelArk/1366799
 * 
 * 기능:
 * 1. 텍스트/이미지 → 영상 클립 생성
 * 2. 비동기 작업 생성 및 폴링
 */

import { db } from "../db";
import { apiKeys } from "../../shared/schema";
import { eq } from "drizzle-orm";

// BytePlus ModelArk API 설정
const BYTEPLUS_BASE_URL = "https://ark.ap-southeast.bytepluses.com/api/v3";
// 정확한 모델 ID: 문서 예시에 따름 (seedance-1-5-pro-251215)
const SEEDANCE_MODEL_ID = "seedance-1-5-pro-251215"; // 실제 모델 ID 확인 필요

interface SeedanceClipInput {
    prompt: string;              // 영상 생성 프롬프트
    imageUrl?: string;           // 참조 이미지 URL (선택)
    duration?: number;           // 영상 길이 (초)
    aspectRatio?: string;        // 화면 비율 (9:16, 16:9, 1:1)
}

interface VideoGenerationTask {
    taskId: string;
    status: "pending" | "running" | "succeeded" | "failed";
    videoUrl?: string;
    error?: string;
    createdAt: string;
    updatedAt: string;
}

interface SeedanceClipResult {
    success: boolean;
    taskId?: string;
    videoUrl?: string;
    status?: string;
    error?: string;
    processingTime?: number;
}

// 직접 연결을 위한 pg import
import pg from "pg";
const { Pool } = pg;

// DB 연결 객체 캐싱 (스크립트 실행용)
let scriptPool: pg.Pool | null = null;
let scriptDb: any = null;

/**
 * DB에서 BytePlus API 키 가져오기
 * server/db.ts의 db가 null이면 직접 연결 시도
 */
async function getBytePlusCredentials(): Promise<{ apiKey: string } | null> {
    try {
        let database = db;

        // db가 null이고 DATABASE_URL이 있으면 직접 연결 시도
        if (!database && process.env.DATABASE_URL) {
            if (!scriptDb) {
                console.log("[Seedance] db connection not initialized, creating direct connection...");
                const { drizzle } = await import("drizzle-orm/node-postgres");
                const { apiKeys } = await import("../../shared/schema");

                scriptPool = new Pool({
                    connectionString: process.env.DATABASE_URL,
                    connectionTimeoutMillis: 10000,
                });
                scriptDb = drizzle(scriptPool, { schema: { apiKeys } });
            }
            database = scriptDb;
        }

        if (!database) {
            console.warn("[Seedance] Database connection not available");
            return null;
        }

        // apiKeys 스키마 접근 (직접 연결 시 schema 구조 차이 고려)
        const table = database.query?.apiKeys ? database.query.apiKeys : null;

        // query builder 방식이 안 되면 일반 select 방식 사용
        let apiKeyRow;

        if (database.select) {
            const rows = await database
                .select()
                .from(apiKeys)
                .where(eq(apiKeys.keyName, "SEEDANCE_API_KEY"))
                .limit(1);
            apiKeyRow = rows[0];
        } else {
            console.error("[Seedance] Invalid db object structure");
            return null;
        }

        if (!apiKeyRow) {
            console.warn("[Seedance] API key not found in database");
            return null;
        }

        return {
            apiKey: apiKeyRow.keyValue,
        };
    } catch (error) {
        console.error("[Seedance] Error fetching credentials:", error);
        return null;
    }
}

/**
 * 영상 생성 작업 생성 (비동기)
 * API: POST /contents/generations/tasks
 */
export async function createVideoGenerationTask(
    input: SeedanceClipInput
): Promise<SeedanceClipResult> {
    console.log(`[Seedance] Creating video generation task...`);

    const startTime = Date.now();

    try {
        const credentials = await getBytePlusCredentials();

        if (!credentials) {
            console.warn("[Seedance] Credentials not available, using mock response");
            return generateMockResponse(input);
        }

        // 요청 본문 구성 (문서 기반)
        const requestBody = {
            model: input.modelId || SEEDANCE_MODEL_ID, // 입력된 모델 ID 우선 사용
            content: [
                {
                    type: "text",
                    text: input.prompt
                }
            ],
            resolution: "720p", // Seedance 1.5 pro default
            ratio: input.aspectRatio || "9:16",
            duration: input.duration || 5,
            generate_audio: true, // 오디오 생성 활성화
        };

        // 이미지 입력이 있는 경우 (Image-to-Video)
        if (input.imageUrl) {
            // @ts-ignore
            requestBody.content.push({
                type: "image_url", // 문서/cURL 예제: type은 "image_url"
                image_url: {       // image_url은 객체 형태여야 함
                    url: input.imageUrl
                }
            });
        }

        console.log("[Seedance] Request Body:", JSON.stringify(requestBody, null, 2));

        const response = await fetch(`${BYTEPLUS_BASE_URL}/contents/generations/tasks`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${credentials.apiKey}`,
            },
            body: JSON.stringify(requestBody),
        });

        if (!response.ok) {
            const errorText = await response.text();
            console.error("[Seedance] API error:", response.status, errorText);
            return {
                success: false,
                error: `API error: ${response.status} - ${errorText}`,
                processingTime: Date.now() - startTime,
            };
        }

        const result = await response.json();
        console.log("[Seedance] Task Created:", result);

        return {
            success: true,
            taskId: result.id,
            status: "pending",
            processingTime: Date.now() - startTime,
        };
    } catch (error) {
        console.error("[Seedance] Error creating task:", error);
        return {
            success: false,
            error: String(error),
            processingTime: Date.now() - startTime,
        };
    }
}

/**
 * 영상 생성 작업 상태 조회
 * API: GET /contents/generations/tasks/{id}
 */
export async function getVideoGenerationTask(
    taskId: string
): Promise<VideoGenerationTask | null> {
    try {
        const credentials = await getBytePlusCredentials();

        if (!credentials) {
            return null;
        }

        const response = await fetch(
            `${BYTEPLUS_BASE_URL}/contents/generations/tasks/${taskId}`,
            {
                method: "GET",
                headers: {
                    Authorization: `Bearer ${credentials.apiKey}`,
                },
            }
        );

        if (!response.ok) {
            console.error("[Seedance] Failed to get task:", response.status);
            return null;
        }

        const result = await response.json();
        // console.log("[Seedance] Task Status:", JSON.stringify(result, null, 2));

        // 응답 구조 매핑 (문서에 명확하지 않아 일반적인 구조 가정)
        // 실제 응답 확인 후 수정 필요할 수 있음
        const status = result.status || (result.result?.status) || "pending";
        const videoUrl = result.content?.video_url || result.result?.video_url || result.video_url;

        return {
            taskId: result.id || taskId,
            status: status,
            videoUrl: videoUrl,
            error: result.error?.message || result.error,
            createdAt: result.created_at,
            updatedAt: result.updated_at,
        };
    } catch (error) {
        console.error("[Seedance] Error getting task:", error);
        return null;
    }
}

/**
 * 영상 생성 완료까지 폴링
 */
export async function waitForVideoGeneration(
    taskId: string,
    maxWaitMs: number = 300000, // 최대 5분
    pollIntervalMs: number = 5000 // 5초마다 확인
): Promise<SeedanceClipResult> {
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitMs) {
        const task = await getVideoGenerationTask(taskId);

        if (!task) {
            return {
                success: false,
                taskId,
                error: "Failed to get task status",
                processingTime: Date.now() - startTime,
            };
        }

        if (task.status === "succeeded") {
            return {
                success: true,
                taskId,
                videoUrl: task.videoUrl,
                status: task.status,
                processingTime: Date.now() - startTime,
            };
        }

        if (task.status === "failed") {
            return {
                success: false,
                taskId,
                error: task.error || "Video generation failed",
                status: task.status,
                processingTime: Date.now() - startTime,
            };
        }

        // 대기 후 다시 확인
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    return {
        success: false,
        taskId,
        error: "Timeout waiting for video generation",
        processingTime: Date.now() - startTime,
    };
}

/**
 * 전체 플로우: 작업 생성 + 완료 대기
 */
export async function generateSeedanceClip(
    input: SeedanceClipInput
): Promise<SeedanceClipResult> {
    // 1. 작업 생성
    const createResult = await createVideoGenerationTask(input);

    if (!createResult.success || !createResult.taskId) {
        return createResult;
    }

    // 2. 완료 대기
    return waitForVideoGeneration(createResult.taskId);
}

/**
 * 일정표 전체에 대한 클립 일괄 생성
 */
export async function generateItineraryClips(
    scenes: Array<{
        placeName: string;
        prompt: string;
        imageUrl?: string;
    }>
): Promise<SeedanceClipResult[]> {
    console.log(`[Seedance] Generating ${scenes.length} clips...`);

    const results: SeedanceClipResult[] = [];

    // 순차 처리 (API 레이트 리밋 고려)
    for (const scene of scenes) {
        console.log(`[Seedance] Processing: ${scene.placeName}`);

        const result = await generateSeedanceClip({
            prompt: scene.prompt,
            imageUrl: scene.imageUrl,
            duration: 8,
            aspectRatio: "9:16",
        });

        results.push(result);

        // 레이트 리밋 방지 (2초 대기)
        await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    const successCount = results.filter((r) => r.success).length;
    console.log(
        `[Seedance] Generated ${successCount}/${scenes.length} clips successfully`
    );

    return results;
}

/**
 * API 없을 때 목 응답 생성 (개발용)
 */
function generateMockResponse(input: SeedanceClipInput): SeedanceClipResult {
    console.log("[Seedance] Using mock response for development");

    return {
        success: true,
        taskId: `mock-${Date.now()}`,
        videoUrl: `https://mock-seedance.local/videos/${Date.now()}.mp4`,
        status: "succeeded",
        processingTime: 100,
    };
}

/**
 * BytePlus API 연결 테스트
 */
export async function testBytePlusConnection(): Promise<{
    connected: boolean;
    message: string;
}> {
    try {
        const credentials = await getBytePlusCredentials();

        if (!credentials) {
            return {
                connected: false,
                message: "API key not configured in database",
            };
        }

        // 간단한 테스트 요청
        const response = await fetch(`${BYTEPLUS_BASE_URL}/models`, {
            headers: {
                Authorization: `Bearer ${credentials.apiKey}`,
            },
        });

        if (response.ok) {
            return {
                connected: true,
                message: "BytePlus ModelArk API connected successfully",
            };
        }

        return {
            connected: false,
            message: `API returned status: ${response.status}`,
        };
    } catch (error) {
        return {
            connected: false,
            message: `Connection error: ${String(error)}`,
        };
    }
}
