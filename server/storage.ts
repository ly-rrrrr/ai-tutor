import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ENV } from "./_core/env";

type StorageConfig = {
  bucket: string;
  client: S3Client;
};

let s3Client: S3Client | null = null;

function getStorageConfig(): StorageConfig {
  if (
    !ENV.s3Region ||
    !ENV.s3Bucket ||
    !ENV.s3AccessKeyId ||
    !ENV.s3SecretAccessKey
  ) {
    throw new Error(
      "S3 storage is not configured. Set S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY."
    );
  }

  if (!s3Client) {
    s3Client = new S3Client({
      ...(ENV.s3Endpoint ? { endpoint: ENV.s3Endpoint } : {}),
      region: ENV.s3Region,
      credentials: {
        accessKeyId: ENV.s3AccessKeyId,
        secretAccessKey: ENV.s3SecretAccessKey,
      },
    });
  }

  return {
    bucket: ENV.s3Bucket,
    client: s3Client,
  };
}

function normalizeKey(relKey: string) {
  return relKey.replace(/^\/+/, "");
}

function normalizeBody(data: Buffer | Uint8Array | string): Buffer | Uint8Array | string {
  if (typeof data === "string") {
    return data;
  }

  if (Buffer.isBuffer(data)) {
    return data;
  }

  return Buffer.from(data);
}

export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);
  const { bucket, client } = getStorageConfig();

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: normalizeBody(data),
      ContentType: contentType,
    })
  );

  return {
    key,
    url: await storageGetSignedUrl(key),
  };
}

async function storageGetSignedUrl(relKey: string): Promise<string> {
  const key = normalizeKey(relKey);
  const { bucket, client } = getStorageConfig();

  return getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
    { expiresIn: 60 * 60 }
  );
}

export async function storageGet(
  relKey: string
): Promise<{ key: string; url: string }> {
  const key = normalizeKey(relKey);

  return {
    key,
    url: await storageGetSignedUrl(key),
  };
}
