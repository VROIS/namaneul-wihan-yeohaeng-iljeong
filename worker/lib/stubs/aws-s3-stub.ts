// ⚠️ 수정금지(승인필요) 2026-09-13 사장님 결정 = Worker 번들에서는 S3 SDK 를 싣지 않는다(R2 는 바인딩) = wrangler alias 로 이 빈 껍데기를 대신 넣는다. Node(필시티)는 진짜 @aws-sdk/client-s3 를 쓴다 (정본 §)
const never = (name: string) =>
  class {
    constructor() {
      throw new Error(
        `[r2-client] ${name} 는 Worker 안에서 쓰지 않는다(바인딩 사용)`,
      );
    }
  };
export const S3Client = never("S3Client");
export const PutObjectCommand = never("PutObjectCommand");
export const GetObjectCommand = never("GetObjectCommand");
export const DeleteObjectCommand = never("DeleteObjectCommand");
export const ListObjectsV2Command = never("ListObjectsV2Command");
