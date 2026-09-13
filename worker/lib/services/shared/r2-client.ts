// ⚠️ 수정금지(승인필요) 2026-09-13 사장님 결정 = R2 창고 접근 1벌 = Worker 안 = 바인딩(env.RAW_BUCKET) / Node(필시티 CLI) = 운영 r2-client.ts 와 같은 S3 API(.env R2_* 키). 같은 이름·같은 동작이라 엔진·필시티 파일은 그대로 (정본 §)
import { IS_WORKER } from "./runtime";

async function bucket(): Promise<R2Bucket> {
  const { env } = await import("cloudflare:workers");
  return env.RAW_BUCKET;
}
async function s3() {
  const m = await import("@aws-sdk/client-s3");
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey)
    throw new Error(
      "[r2-client] R2 환경변수 누락 (R2_ACCOUNT_ID/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY)",
    );
  const bucketName = process.env.R2_BUCKET_NAME;
  if (!bucketName) throw new Error("[r2-client] R2_BUCKET_NAME 누락");
  const client = new m.S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  return { m, client, bucketName };
}

export function isR2Configured(): boolean {
  if (IS_WORKER) return !!process.env.R2_PUBLIC_URL;
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
  if (IS_WORKER) {
    await (await bucket()).put(key, body, { httpMetadata: { contentType } });
  } else {
    const { m, client, bucketName } = await s3();
    await client.send(
      new m.PutObjectCommand({
        Bucket: bucketName,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
  }
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
  if (IS_WORKER) {
    const obj = await (await bucket()).get(key);
    if (!obj) return null;
    return Buffer.from(await obj.arrayBuffer());
  }
  const { m, client, bucketName } = await s3();
  try {
    const res = await client.send(
      new m.GetObjectCommand({ Bucket: bucketName, Key: key }),
    );
    if (!res.Body) return null;
    return Buffer.from(await res.Body.transformToByteArray());
  } catch (e: any) {
    if (e?.name === "NoSuchKey" || e?.$metadata?.httpStatusCode === 404)
      return null;
    throw e;
  }
}

export async function deleteFromR2(key: string): Promise<void> {
  if (IS_WORKER) {
    await (await bucket()).delete(key);
    return;
  }
  const { m, client, bucketName } = await s3();
  await client.send(
    new m.DeleteObjectCommand({ Bucket: bucketName, Key: key }),
  );
}

export async function listR2(
  prefix = "",
): Promise<{ key: string; size: number; lastModified: Date | null }[]> {
  const out: { key: string; size: number; lastModified: Date | null }[] = [];
  if (IS_WORKER) {
    const b = await bucket();
    let cursor: string | undefined = undefined;
    for (;;) {
      const listed: R2Objects = await b.list({ prefix, cursor });
      for (const o of listed.objects)
        out.push({
          key: o.key,
          size: o.size,
          lastModified: o.uploaded ?? null,
        });
      if (!listed.truncated) break;
      cursor = listed.cursor;
    }
    return out;
  }
  const { m, client, bucketName } = await s3();
  let token: string | undefined = undefined;
  for (;;) {
    const res: any = await client.send(
      new m.ListObjectsV2Command({
        Bucket: bucketName,
        Prefix: prefix,
        ContinuationToken: token,
      }),
    );
    for (const o of res.Contents ?? [])
      out.push({
        key: o.Key!,
        size: o.Size ?? 0,
        lastModified: o.LastModified ?? null,
      });
    if (!res.IsTruncated) break;
    token = res.NextContinuationToken;
  }
  return out;
}
