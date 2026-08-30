// ⚠️ 수정금지(승인필요) 2026-08-06 사장님 SSOT = Cloudflare R2 단일 진입점 (업로드·다운로드·삭제·목록·공개URL).

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

export function isR2Configured(): boolean {
  return !!(
    process.env.R2_ACCOUNT_ID &&
    process.env.R2_ACCESS_KEY_ID &&
    process.env.R2_SECRET_ACCESS_KEY &&
    process.env.R2_BUCKET_NAME &&
    process.env.R2_PUBLIC_URL
  );
}

export function getR2PublicUrl(key: string): string {
  const publicUrl = process.env.R2_PUBLIC_URL;
  if (!publicUrl) throw new Error("[r2-client] R2_PUBLIC_URL 누락");
  return `${publicUrl}/${key}`;
}

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

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

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

export async function deleteFromR2(key: string): Promise<void> {
  const client = getClient();
  const bucket = getBucketName();
  await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}

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
