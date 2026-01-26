/**
 * Phase E - 영상 생성 통합 파이프라인
 * 
 * 워크플로우:
 * 1. itinerary 데이터 로드
 * 2. 캐릭터 매칭 (birthDate + companionAges)
 * 3. Gemini 대사 생성
 * 4. Seedance 클립 생성
 * 5. Remotion 합성 (CLI)
 * 6. 결과 URL 저장
 */

import { generateSceneDialogue, generateItineraryDialogues, getAgeRangeFromCharacterId } from "./video-dialogue-generator";
import { createVideoGenerationTask, getVideoGenerationTask, generateSeedanceClip } from "./seedance-video-generator";
import { exec } from "child_process";
import { promisify } from "util";
import path from "path";

const execAsync = promisify(exec);

// 캐릭터 이미지 경로 (travel-preview/public/characters/)
const CHARACTER_IMAGES: Record<string, string> = {
    M1: "char_m1_boy_child.png",
    F1: "char_f1_girl_child.png",
    M2: "char_m2_teen_boy.png",
    F2: "char_f2_teen_girl.png",
    M3: "char_m3_20s_male.png",
    F3: "char_f3_20s_female.png",
    M4: "char_m4_stylish_30s.png",
    F4: "char_f4_elegant_40s.png",
    M5: "char_m5_mature_40s.png",
    F5: "char_f5_elegant_50s.png",
    M6: "char_m6_distinguished_50s.png",
    F6: "char_f6_graceful_50s.png",
    M7: "char_m7_distinguished_60s.png",
    F7: "char_f7_graceful_60s.png",
};

// 연령 → 캐릭터 ID 매핑
function getCharacterIdFromAge(age: number, gender: "M" | "F"): string {
    if (age < 10) return gender + "1";
    if (age < 18) return gender + "2";
    if (age < 30) return gender + "3";
    if (age < 40) return gender + "4";
    if (age < 50) return gender + "5";
    if (age < 60) return gender + "6";
    return gender + "7";
}

// 일정표 데이터 타입
interface ItineraryPlace {
    name: string;
    type: string;
    photoUrl?: string;
    timeSlot: string;
}

interface ItineraryDay {
    day: number;
    city: string;
    places: ItineraryPlace[];
}

interface PipelineInput {
    itineraryId: number;
    destination: string;
    days: ItineraryDay[];
    userBirthDate: string;
    companionAges: number[];
    vibes: string[];
    curationFocus: string;
    travelPace: string;
}

interface PipelineResult {
    success: boolean;
    dayVideos: Array<{
        day: number;
        videoUrl?: string;
        status: string;
    }>;
    fullVideoUrl?: string;
    error?: string;
}

/**
 * 전체 영상 생성 파이프라인 실행
 */
export async function runVideoGenerationPipeline(
    input: PipelineInput
): Promise<PipelineResult> {
    console.log(`[Pipeline] Starting video generation for itinerary ${input.itineraryId}...`);

    try {
        // 1. 캐릭터 매칭
        console.log("[Pipeline] Step 1: Character matching...");
        const userAge = calculateAge(input.userBirthDate);
        const protagonistId = getCharacterIdFromAge(userAge, "M"); // 기본 남성, 실제로는 성별 정보 필요

        const companions = input.companionAges.map((age, idx) => ({
            id: getCharacterIdFromAge(age, idx % 2 === 0 ? "M" : "F"),
            age: getAgeRangeFromCharacterId(getCharacterIdFromAge(age, idx % 2 === 0 ? "M" : "F")),
            relation: "family"
        }));

        // 2. 일별 영상 생성
        const dayVideos: PipelineResult["dayVideos"] = [];

        for (const day of input.days) {
            console.log(`[Pipeline] Processing Day ${day.day}...`);

            // 2a. 대사 생성 (Gemini)
            console.log(`[Pipeline] Step 2a: Generating dialogues for Day ${day.day}...`);
            const dialogues = await generateItineraryDialogues(
                day.places.map(p => ({
                    placeName: p.name,
                    placeType: p.type,
                    cityName: day.city,
                })),
                {
                    protagonist: { id: protagonistId, age: getAgeRangeFromCharacterId(protagonistId) },
                    companions,
                },
                input.vibes,
                input.curationFocus
            );

            console.log(`[Pipeline] Generated ${dialogues.length} dialogues for Day ${day.day}`);

            // 2b. 클립 생성 (Seedance)
            console.log(`[Pipeline] Step 2b: Generating clips for Day ${day.day}...`);
            const clipResults = [];

            for (let i = 0; i < dialogues.length; i++) {
                const dialogue = dialogues[i];
                const place = day.places[i];

                // Seedance API 호출
                const clipResult = await createVideoGenerationTask({
                    prompt: dialogue.videoPrompt,
                    imageUrl: place.photoUrl,
                    duration: 8, // 8초 클립
                    aspectRatio: "9:16", // 모바일 세로
                });

                clipResults.push({
                    placeName: place.name,
                    taskId: clipResult.taskId,
                    status: clipResult.status,
                });
            }

            // 일별 결과 저장
            dayVideos.push({
                day: day.day,
                status: "clips_generated",
            });
        }

        // 3. TODO: Remotion 합성 (CLI 또는 Lambda)
        console.log("[Pipeline] Step 3: Remotion composition (TODO)...");

        return {
            success: true,
            dayVideos,
            error: undefined,
        };

    } catch (error) {
        console.error("[Pipeline] Error:", error);
        return {
            success: false,
            dayVideos: [],
            error: error instanceof Error ? error.message : "Unknown error",
        };
    }
}

/**
 * 생년월일로 나이 계산
 */
function calculateAge(birthDate: string): number {
    const birth = new Date(birthDate);
    const today = new Date();
    let age = today.getFullYear() - birth.getFullYear();
    const m = today.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
        age--;
    }
    return age;
}

/**
 * 테스트용 간단한 파이프라인 실행
 */
export async function testPipeline(): Promise<void> {
    console.log("[Pipeline] Running test...");

    const testInput: PipelineInput = {
        itineraryId: 1,
        destination: "파리, 프랑스",
        days: [
            {
                day: 1,
                city: "파리",
                places: [
                    { name: "에펠탑", type: "landmark", timeSlot: "09:00" },
                    { name: "루브르 박물관", type: "museum", timeSlot: "11:00" },
                ],
            },
        ],
        userBirthDate: "1990-01-15",
        companionAges: [5, 60],
        vibes: ["Healing", "Family"],
        curationFocus: "Kids",
        travelPace: "Relaxed",
    };

    const result = await runVideoGenerationPipeline(testInput);
    console.log("[Pipeline] Test Result:", JSON.stringify(result, null, 2));
}
