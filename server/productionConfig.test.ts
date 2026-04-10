import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function setRequiredProductionEnv() {
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("APP_ORIGIN", "https://app.example.com");
  vi.stubEnv("DATABASE_URL", "mysql://user:pass@localhost:3306/ai_tutor");
  vi.stubEnv("BETTER_AUTH_SECRET", "super-secret");
  vi.stubEnv("AI_BASE_URL", "https://ai.example.com/v1");
  vi.stubEnv("AI_API_KEY", "ai-key");
  vi.stubEnv("S3_ENDPOINT", "https://storage.example.com");
  vi.stubEnv("S3_REGION", "ap-hongkong");
  vi.stubEnv("S3_BUCKET", "ai-tutor-audio");
  vi.stubEnv("S3_ACCESS_KEY_ID", "access-key");
  vi.stubEnv("S3_SECRET_ACCESS_KEY", "secret-key");
  vi.stubEnv("EMAIL_PROVIDER", "smtp");
  vi.stubEnv("EMAIL_FROM", "noreply@example.com");
  vi.stubEnv("SMTP_HOST", "smtp.example.com");
  vi.stubEnv("SMTP_PORT", "587");
  vi.stubEnv("SMTP_USER", "smtp-user");
  vi.stubEnv("SMTP_PASS", "smtp-pass");
  vi.stubEnv("SMTP_FROM_EMAIL", "noreply@example.com");
  vi.stubEnv("TENCENT_SES_SECRET_ID", "");
  vi.stubEnv("TENCENT_SES_SECRET_KEY", "");
  vi.stubEnv("TENCENT_SES_REGION", "");
  vi.stubEnv("TENCENT_SES_MAGIC_LINK_TEMPLATE_ID", "");
  vi.stubEnv("TENCENT_SES_ALLOW_SIMPLE_CONTENT", "false");
}

function setLegacyAwsStorageEnv() {
  vi.stubEnv("S3_ENDPOINT", "");
  vi.stubEnv("S3_REGION", "");
  vi.stubEnv("S3_BUCKET", "");
  vi.stubEnv("S3_ACCESS_KEY_ID", "");
  vi.stubEnv("S3_SECRET_ACCESS_KEY", "");
  vi.stubEnv("AWS_REGION", "ap-hongkong");
  vi.stubEnv("AWS_S3_BUCKET", "legacy-bucket");
  vi.stubEnv("AWS_ACCESS_KEY_ID", "legacy-key");
  vi.stubEnv("AWS_SECRET_ACCESS_KEY", "legacy-secret");
}

describe("production config", () => {
  beforeEach(() => {
    vi.resetModules();
    setRequiredProductionEnv();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("fails fast when AI credentials are missing in production", async () => {
    vi.stubEnv("AI_API_KEY", "");

    const { assertProductionConfig } = await import("./_core/productionConfig");

    expect(() => assertProductionConfig()).toThrow("AI_API_KEY");
  });

  it("fails fast when S3 region is missing in production", async () => {
    vi.stubEnv("S3_REGION", "");
    vi.stubEnv("AWS_REGION", "");

    const { assertProductionConfig } = await import("./_core/productionConfig");

    expect(() => assertProductionConfig()).toThrow("S3_REGION");
  });

  it("accepts the legacy AWS storage configuration path in production", async () => {
    setLegacyAwsStorageEnv();

    const { assertProductionConfig } = await import("./_core/productionConfig");

    expect(() => assertProductionConfig()).not.toThrow();
  });

  it("accepts disabled email delivery in production", async () => {
    vi.stubEnv("EMAIL_PROVIDER", "disabled");
    vi.stubEnv("EMAIL_FROM", "");
    vi.stubEnv("SMTP_HOST", "");
    vi.stubEnv("SMTP_USER", "");
    vi.stubEnv("SMTP_PASS", "");
    vi.stubEnv("SMTP_FROM_EMAIL", "");

    const { assertProductionConfig } = await import("./_core/productionConfig");

    expect(() => assertProductionConfig()).not.toThrow();
  });

  it("accepts Tencent SES API email delivery in production", async () => {
    vi.stubEnv("EMAIL_PROVIDER", "tencent_ses_api");
    vi.stubEnv("EMAIL_FROM", "noreply@example.com");
    vi.stubEnv("SMTP_HOST", "");
    vi.stubEnv("SMTP_USER", "");
    vi.stubEnv("SMTP_PASS", "");
    vi.stubEnv("TENCENT_SES_SECRET_ID", "secret-id");
    vi.stubEnv("TENCENT_SES_SECRET_KEY", "secret-key");
    vi.stubEnv("TENCENT_SES_REGION", "ap-guangzhou");
    vi.stubEnv("TENCENT_SES_MAGIC_LINK_TEMPLATE_ID", "1001");

    const { assertProductionConfig } = await import("./_core/productionConfig");

    expect(() => assertProductionConfig()).not.toThrow();
  });

  it("does not throw outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("AI_API_KEY", "");
    vi.stubEnv("DATABASE_URL", "");

    const { assertProductionConfig } = await import("./_core/productionConfig");

    expect(() => assertProductionConfig()).not.toThrow();
  });
});
