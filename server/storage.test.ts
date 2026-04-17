import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const sendMock = vi.fn();
const getSignedUrlMock = vi.fn();
const s3ClientCtorMock = vi.fn();
const tmpDirs: string[] = [];

vi.mock("@aws-sdk/client-s3", () => {
  class MockS3Client {
    send = sendMock;

    constructor(config: unknown) {
      s3ClientCtorMock(config);
    }
  }

  class MockPutObjectCommand {
    constructor(public input: unknown) {}
  }

  class MockGetObjectCommand {
    constructor(public input: unknown) {}
  }

  class MockHeadObjectCommand {
    constructor(public input: unknown) {}
  }

  return {
    S3Client: MockS3Client,
    PutObjectCommand: MockPutObjectCommand,
    GetObjectCommand: MockGetObjectCommand,
    HeadObjectCommand: MockHeadObjectCommand,
  };
});

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: getSignedUrlMock,
}));

afterEach(async () => {
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.clearAllMocks();
  await Promise.all(tmpDirs.splice(0).map(dir => fs.rm(dir, { recursive: true, force: true })));
});

describe("storage", () => {
  async function makeStorageDir() {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ai-tutor-storage-"));
    tmpDirs.push(dir);
    return dir;
  }

  it("uses local storage when STORAGE_DRIVER is local", async () => {
    const dir = await makeStorageDir();
    vi.stubEnv("STORAGE_DRIVER", "local");
    vi.stubEnv("LOCAL_STORAGE_DIR", dir);
    vi.stubEnv("APP_ORIGIN", "https://app.example.com");

    const { storageExists, storageGet, storagePut } = await import("./storage");

    const result = await storagePut("/audio/1/test file.mp3", Buffer.from("audio-data"), "audio/mpeg");

    await expect(fs.readFile(path.join(dir, "audio/1/test file.mp3"), "utf8")).resolves.toBe("audio-data");
    await expect(storageExists("audio/1/test file.mp3")).resolves.toBe(true);
    await expect(storageExists("audio/1/missing.mp3")).resolves.toBe(false);
    expect(result).toEqual({
      key: "audio/1/test file.mp3",
      url: "https://app.example.com/api/storage/audio/1/test%20file.mp3",
    });
    await expect(storageGet("audio/1/test file.mp3")).resolves.toEqual(result);
  });

  it("uses provider-neutral s3 envs including endpoint when creating the client", async () => {
    vi.stubEnv("S3_ENDPOINT", "https://cos.ap-hongkong.myqcloud.com");
    vi.stubEnv("S3_REGION", "ap-hongkong");
    vi.stubEnv("S3_BUCKET", "ai-tutor-audio-1250000000");
    vi.stubEnv("S3_ACCESS_KEY_ID", "key-id");
    vi.stubEnv("S3_SECRET_ACCESS_KEY", "secret-key");
    getSignedUrlMock.mockResolvedValue("https://storage.example.com/audio.mp3");

    const { storagePut } = await import("./storage");

    await storagePut("/audio.mp3", "audio-data", "audio/mpeg");

    expect(s3ClientCtorMock).toHaveBeenCalledWith({
      endpoint: "https://cos.ap-hongkong.myqcloud.com",
      region: "ap-hongkong",
      credentials: {
        accessKeyId: "key-id",
        secretAccessKey: "secret-key",
      },
    });
  });

  it("reports missing provider-neutral storage env names in the error", async () => {
    vi.stubEnv("S3_ENDPOINT", "");
    vi.stubEnv("S3_BUCKET", "");
    vi.stubEnv("S3_ACCESS_KEY_ID", "");
    vi.stubEnv("S3_SECRET_ACCESS_KEY", "");
    vi.stubEnv("AWS_REGION", "");
    vi.stubEnv("AWS_S3_BUCKET", "");
    vi.stubEnv("AWS_ACCESS_KEY_ID", "");
    vi.stubEnv("AWS_SECRET_ACCESS_KEY", "");

    const { storageGet } = await import("./storage");

    await expect(storageGet("audio.mp3")).rejects.toThrow(
      "S3 storage is not configured. Set S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY."
    );
  });

  it("requires S3_ENDPOINT when provider-neutral credentials are used", async () => {
    vi.stubEnv("S3_ENDPOINT", "");
    vi.stubEnv("S3_BUCKET", "ai-tutor-audio-1250000000");
    vi.stubEnv("S3_ACCESS_KEY_ID", "key-id");
    vi.stubEnv("S3_SECRET_ACCESS_KEY", "secret-key");

    const { storageGet } = await import("./storage");

    await expect(storageGet("audio.mp3")).rejects.toThrow(
      "S3 storage is not configured. Set S3_ENDPOINT, S3_REGION, S3_BUCKET, S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY."
    );
  });

  it("falls back to legacy AWS envs when only the bucket has been renamed", async () => {
    vi.stubEnv("S3_ENDPOINT", "");
    vi.stubEnv("S3_REGION", "");
    vi.stubEnv("S3_BUCKET", "renamed-bucket");
    vi.stubEnv("S3_ACCESS_KEY_ID", "");
    vi.stubEnv("S3_SECRET_ACCESS_KEY", "");
    vi.stubEnv("AWS_REGION", "us-east-2");
    vi.stubEnv("AWS_S3_BUCKET", "");
    vi.stubEnv("AWS_ACCESS_KEY_ID", "key-id");
    vi.stubEnv("AWS_SECRET_ACCESS_KEY", "secret-key");
    getSignedUrlMock.mockResolvedValue("https://storage.example.com/audio.mp3");

    const { storagePut } = await import("./storage");

    await storagePut("/audio.mp3", "audio-data", "audio/mpeg");

    expect(s3ClientCtorMock).toHaveBeenCalledWith({
      region: "us-east-2",
      credentials: {
        accessKeyId: "key-id",
        secretAccessKey: "secret-key",
      },
    });
  });

  it("uses legacy AWS alias fields and default region in the explicit legacy branch", async () => {
    vi.stubEnv("S3_ENDPOINT", "");
    vi.stubEnv("S3_REGION", "");
    vi.stubEnv("S3_BUCKET", "");
    vi.stubEnv("S3_ACCESS_KEY_ID", "");
    vi.stubEnv("S3_SECRET_ACCESS_KEY", "");
    vi.stubEnv("AWS_REGION", "");
    vi.stubEnv("AWS_S3_BUCKET", "legacy-bucket");
    vi.stubEnv("AWS_ACCESS_KEY_ID", "legacy-key-id");
    vi.stubEnv("AWS_SECRET_ACCESS_KEY", "legacy-secret-key");
    getSignedUrlMock.mockResolvedValue("https://storage.example.com/audio.mp3");

    const { storagePut } = await import("./storage");

    await storagePut("/audio.mp3", "audio-data", "audio/mpeg");

    expect(s3ClientCtorMock).toHaveBeenCalledWith({
      region: "ap-southeast-1",
      credentials: {
        accessKeyId: "legacy-key-id",
        secretAccessKey: "legacy-secret-key",
      },
    });
  });

  it("fails fast when the legacy AWS branch is only partially configured", async () => {
    vi.stubEnv("S3_ENDPOINT", "");
    vi.stubEnv("S3_REGION", "");
    vi.stubEnv("S3_BUCKET", "");
    vi.stubEnv("S3_ACCESS_KEY_ID", "");
    vi.stubEnv("S3_SECRET_ACCESS_KEY", "");
    vi.stubEnv("AWS_REGION", "us-east-2");
    vi.stubEnv("AWS_S3_BUCKET", "");
    vi.stubEnv("AWS_ACCESS_KEY_ID", "");
    vi.stubEnv("AWS_SECRET_ACCESS_KEY", "");

    const { storageGet } = await import("./storage");

    await expect(storageGet("audio.mp3")).rejects.toThrow(
      "S3 storage is not configured. Set AWS_REGION, AWS_S3_BUCKET, AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY."
    );
  });

  it("storageExists returns false for missing objects", async () => {
    vi.stubEnv("S3_ENDPOINT", "https://cos.ap-hongkong.myqcloud.com");
    vi.stubEnv("S3_REGION", "ap-hongkong");
    vi.stubEnv("S3_BUCKET", "ai-tutor-audio-1250000000");
    vi.stubEnv("S3_ACCESS_KEY_ID", "key-id");
    vi.stubEnv("S3_SECRET_ACCESS_KEY", "secret-key");
    sendMock.mockRejectedValueOnce({
      name: "NotFound",
      $metadata: { httpStatusCode: 404 },
    });

    const { storageExists } = await import("./storage");

    await expect(storageExists("missing.mp3")).resolves.toBe(false);
  });
});
