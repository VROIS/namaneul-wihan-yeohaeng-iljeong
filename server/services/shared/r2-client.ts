// ⚠️ 수정금지(승인필요) 2026-08-04 사장님 SSOT = Cloudflare R2 업로드+공개URL 단일 진입점
// = 신규 영상만 R2 병행 저장(기존 Supabase 자산은 그대로 둠, 완전이전 아님).
// = R2 는 S3 호환 API + SigV4 서명 필요(@aws-sdk/client-s3) = Supabase Storage(Bearer PUT)와 인증 방식이 다름.
// = 공개 URL = R2_PUBLIC_URL(r2.dev 버킷 공개접근, 사장님이 대시보드에서 활성화) + key 조합.
//   Supabase 의 `.../object/public/...` 영구 URL 패턴과 동일 역할(서명URL 아님 = 만료 없음, DB 영구저장 가능).
// = 이 모듈이 유일한 R2 진입점. 다른 곳에서 S3Client 직접 생성 금지(§16 재발명 금지).

import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
} from "@aws-sdk/client-s3";

function getClient(): S3Client {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "[r2-client] R2 환경변수 누락 (R2_ACCOUNT_ID/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY)",
    );
  }
  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
}

function getBucketName(): string {
  const bucket = process.env.R2_BUCKET_NAME;
  if (!bucket) throw new Error("[r2-client] R2_BUCKET_NAME 누락");
  return bucket;
}

/** key → 영구 공개 URL (r2.dev 공개접근 활성화 전제, video-stitcher.ts 의 supaPublicUrl 과 동형) */
export function getR2PublicUrl(key: string): string {
  const publicUrl = process.env.R2_PUBLIC_URL;
  if (!publicUrl) throw new Error("[r2-client] R2_PUBLIC_URL 누락");
  return `${publicUrl}/${key}`;
}

/** 파일 업로드 → key/size/공개URL 반환 */
export async function uploadToR2(
  key: string,
  body: Buffer,
  contentType: string,
): Promise<{ key: string; size: number; publicUrl: string }> {
  const client = getClient();
  const bucket = getBucketName();
  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentType,
    }),
  );
  return { key, size: body.length, publicUrl: getR2PublicUrl(key) };
}

/** prefix 하위 파일 목록(키·크기) — 업로드 실증·용량 감사용 */
export async function listR2(
  prefix = "",
): Promise<{ key: string; size: number }[]> {
  const client = getClient();
  const bucket = getBucketName();
  const res = await client.send(
    new ListObjectsV2Command({ Bucket: bucket, Prefix: prefix }),
  );
  return (res.Contents || []).map((o) => ({
    key: o.Key || "",
    size: o.Size || 0,
  }));
}
