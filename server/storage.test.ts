import { afterEach, describe, expect, it, vi } from "vitest";

const sendMock = vi.fn();
const getSignedUrlMock = vi.fn();
const s3ClientCtorMock = vi.fn();

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

  return {
    S3Client: MockS3Client,
    PutObjectCommand: MockPutObjectCommand,
    GetObjectCommand: MockGetObjectCommand,
  };
});

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: getSignedUrlMock,
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.clearAllMocks();
});

describe("storage", () => {
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

  it("falls back to AWS_REGION when S3_REGION is unset", async () => {
    vi.stubEnv("S3_ENDPOINT", "");
    vi.stubEnv("S3_REGION", "");
    vi.stubEnv("AWS_REGION", "us-east-2");
    vi.stubEnv("S3_BUCKET", "ai-tutor-audio-1250000000");
    vi.stubEnv("S3_ACCESS_KEY_ID", "key-id");
    vi.stubEnv("S3_SECRET_ACCESS_KEY", "secret-key");
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
});
