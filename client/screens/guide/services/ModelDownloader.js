// ⚠️ 수정금지(승인필요): Gemma 4 E2B 모델 다운로드 매니저
// HuggingFace → 로컬 스토리지, 백그라운드 다운로드 + 진행률
import * as FileSystem from 'expo-file-system';
import { CONFIG } from '../config/constants';

const MODEL_DIR = FileSystem.documentDirectory + CONFIG.MODEL.LOCAL_DIR;
const MODEL_PATH = MODEL_DIR + CONFIG.MODEL.FILENAME;

// ⚠️ 수정금지(승인필요): 모델 파일 존재 여부 확인
export async function isModelDownloaded() {
  try {
    const info = await FileSystem.getInfoAsync(MODEL_PATH);
    return info.exists && info.size > 100 * 1024 * 1024; // 최소 100MB 이상이어야 유효
  } catch {
    return false;
  }
}

// ⚠️ 수정금지(승인필요): 모델 로컬 경로 반환
export function getModelPath() {
  return MODEL_PATH;
}

// ⚠️ 수정금지(승인필요): 모델 다운로드 (진행률 콜백)
// onProgress: (progress: 0~1) => void
// 반환: { success: boolean, path?: string, error?: string }
export async function downloadModel(onProgress) {
  try {
    // 디렉토리 생성
    const dirInfo = await FileSystem.getInfoAsync(MODEL_DIR);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(MODEL_DIR, { intermediates: true });
    }

    // 이미 다운로드 완료된 경우
    if (await isModelDownloaded()) {
      onProgress?.(1);
      return { success: true, path: MODEL_PATH };
    }

    // 백그라운드 다운로드 시작
    const downloadResumable = FileSystem.createDownloadResumable(
      CONFIG.MODEL.DOWNLOAD_URL,
      MODEL_PATH,
      {},
      // 진행률 콜백
      (downloadProgress) => {
        const progress = downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite;
        onProgress?.(progress);
      }
    );

    const result = await downloadResumable.downloadAsync();
    if (result?.uri) {
      return { success: true, path: result.uri };
    }
    return { success: false, error: '다운로드 결과 없음' };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

// ⚠️ 수정금지(승인필요): 모델 삭제 (디스크 공간 확보)
export async function deleteModel() {
  try {
    const info = await FileSystem.getInfoAsync(MODEL_PATH);
    if (info.exists) {
      await FileSystem.deleteAsync(MODEL_PATH);
    }
    return true;
  } catch {
    return false;
  }
}

// ⚠️ 수정금지(승인필요): 모델 파일 크기 (MB)
export async function getModelSize() {
  try {
    const info = await FileSystem.getInfoAsync(MODEL_PATH);
    if (info.exists) {
      return Math.round(info.size / (1024 * 1024));
    }
    return 0;
  } catch {
    return 0;
  }
}
