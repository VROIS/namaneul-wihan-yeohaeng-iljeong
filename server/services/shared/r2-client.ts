// ⚠️ 수정금지(승인필요) 2026-08-06 사장님 SSOT = Cloudflare R2 단일 진입점 (업로드·다운로드·삭제·목록·공개URL).
// = 2026-08-06 Cloudflare 이전계획 1단계: R2 가 미디어·raw 의 정식 저장소(옛 "신규 영상만 병행" 문구 폐기 = 2026-08-06 §19).
// = 버킷 1개(R2_BUCKET_NAME) + 프리픽스 4종: place-images/ itinerary-videos/ raw-responses/ guides/
// = R2 는 S3 호환 API + SigV4 서명 필요(@aws-sdk/client-s3) = Supabase Storage(Bearer PUT)와 인증 방식이 다름.
// = 공개 URL = R2_PUBLIC_URL(r2.dev 버킷 공개접근, 사장님이 대시보드에서 활성화) + key 조합.
//   Supabase 의 `.../object/public/...` 영구 URL 패턴과 동일 역할(서명URL 아님 = 만료 없음, DB 영구저장 가능).
// = 이 모듈이 유일한 R2 진입점. 다른 곳에서 S3Client 직접 생성 금지(§16 재발명 금지).

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
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

/** R2 환경변수 5종 전부 있는지 — best-effort 호출부(saveRaw/tsPhoto)가 조용히 skip 판정할 때 사용(env 검사 재발명 금지 §16) */
export function isR2Configured(): boolean {
  return !!(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET_NAME &&
    process.env.R2_PUBLIC_URL
  );
}

/** key → 영구 공개 URL (r2.dev 공개접근 활성화 전제) */
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

// data:URI(글자 사진) → R2 파일 변환 1벌 = 신규 가이드 저장(guide-routes) + 기존 행 추출(guides-photo-extract) 공용(§16)
const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/** data:image;base64 → 디코드 → R2 `${keyBase}.{확장자}` 업로드 → 공개 URL. data:URI 형식이 아니면 null(호출부가 원본 유지 판단) */
export async function uploadDataUriToR2(
  keyBase: string,
  dataUri: string,
): Promise<string | null> {
  const m = /^data:(image\/[a-z+]+);base64,(.+)$/s.exec(dataUri || "");
  if (!m) return null;
  const buf = Buffer.from(m[2], "base64");
  if (!buf.length) return null;
  const ext = EXT_BY_MIME[m[1]] || "jpg";
  const up = await uploadToR2(`${keyBase}.${ext}`, buf, m[1]);
  return up.publicUrl;
}

/** 파일 다운로드 → Buffer (없으면 null) — 1단계 복사 검증·guides 추출 대조용 */
export async function getFromR2(key: string): Promise<Buffer | null> {
  const client = getClient();
  const bucket = getBucketName();
  try {
    const res = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key }),
    );
    if (!res.Body) return null;
    const bytes = await res.Body.transformToByteArray();
    return Buffer.from(bytes);
  } catch (e: any) {
    if (e?.name === "NoSuchKey" || e?.$metadata?.httpStatusCode === 404)
      return null;
    throw e;
  }
}

/** 파일 삭제 — 철거·정리 도구 전용(운영 경로에서 호출 금지, DB 자산 보호 원칙과 동형) */
export async function deleteFromR2(key: string): Promise<void> {
  const client = getClient();
  const bucket = getBucketName();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

/** prefix 하위 파일 전체 목록(키·크기·수정시각) — S3 는 1회 1,000개 한도라 페이지 순회(사진 ~1만개 대응, 2026-08-06). lastModified = 포렌식·소크 관찰용(storage-observe) */
export async function listR2(
  prefix = "",
): Promise<{ key: string; size: number; lastModified: Date | null }[]> {
  const client = getClient();
  const bucket = getBucketName();
  const out: { key: string; size: number; lastModified: Date | null }[] = [];
  let token: string | undefined;
  do {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: token,
      }),
    );
    for (const o of res.Contents || [])
      out.push({
        key: o.Key || "",
        size: o.Size || 0,
        lastModified: o.LastModified || null,
      });
    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);
  return out;
}
