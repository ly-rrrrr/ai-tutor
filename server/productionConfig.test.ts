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
  vi.stubEnv("SMTP_HOST", "smtp.example.com");
  vi.stubEnv("SMTP_PORT", "587");
  vi.stubEnv("SMTP_USER", "smtp-user");
  vi.stubEnv("SMTP_PASS", "smtp-pass");
  vi.stubEnv("SMTP_FROM_EMAIL", "noreply@example.com");
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

  it("does not throw outside production", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("AI_API_KEY", "");
    vi.stubEnv("DATABASE_URL", "");

    const { assertProductionConfig } = await import("./_core/productionConfig");

    expect(() => assertProductionConfig()).not.toThrow();
  });
});
