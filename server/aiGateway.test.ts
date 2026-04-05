import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("aiGateway", () => {
  it("env defaults use provider-neutral gateway values", async () => {
    vi.stubEnv("AI_BASE_URL", "");
    vi.stubEnv("AI_API_KEY", "");
    vi.stubEnv("AI_CHAT_MODEL", "");
    vi.stubEnv("AI_STT_MODEL", "");
    vi.stubEnv("AI_TTS_MODEL", "");
    vi.stubEnv("S3_REGION", "");
    vi.stubEnv("OPENAI_API_KEY", "");
    vi.stubEnv("OPENAI_CHAT_MODEL", "");
    vi.stubEnv("OPENAI_STT_MODEL", "");
    vi.stubEnv("OPENAI_TTS_MODEL", "");
    vi.stubEnv("AWS_REGION", "");

    const { ENV } = await import("./_core/env");

    expect(ENV.aiBaseUrl).toBe("https://aihubmix.com/v1");
    expect(ENV.aiChatModel).toBe("gemini-2.5-flash-lite");
    expect(ENV.s3Region).toBe("ap-hongkong");
  });

  it("env falls back to the OpenAI base url when only legacy openai envs are set", async () => {
    vi.stubEnv("AI_BASE_URL", "");
    vi.stubEnv("AI_API_KEY", "");
    vi.stubEnv("AI_CHAT_MODEL", "");
    vi.stubEnv("AI_STT_MODEL", "");
    vi.stubEnv("AI_TTS_MODEL", "");
    vi.stubEnv("OPENAI_API_KEY", "legacy-key");

    const { ENV } = await import("./_core/env");

    expect(ENV.aiBaseUrl).toBe("https://api.openai.com/v1");
    expect(ENV.aiApiKey).toBe("legacy-key");
    expect(ENV.aiChatModel).toBe("gpt-4o-mini");
  });

  it("buildAiGatewayUrl trims trailing slashes before joining paths", async () => {
    vi.stubEnv("AI_BASE_URL", "https://ai.example.com/v1///");
    vi.stubEnv("AI_API_KEY", "test-key");

    const { buildAiGatewayUrl } = await import("./_core/aiGateway");

    expect(buildAiGatewayUrl("/audio/transcriptions")).toBe(
      "https://ai.example.com/v1/audio/transcriptions"
    );
  });

  it("assertAiGatewayConfigured throws when base url or api key is missing", async () => {
    vi.stubEnv("AI_BASE_URL", "");
    vi.stubEnv("AI_API_KEY", "");

    const { assertAiGatewayConfigured } = await import("./_core/aiGateway");

    expect(() => assertAiGatewayConfigured()).toThrow(
      "AI_BASE_URL and AI_API_KEY must be configured"
    );
  });

  it("getAiGatewayHeaders merges auth headers with extra headers", async () => {
    vi.stubEnv("AI_BASE_URL", "https://ai.example.com/v1");
    vi.stubEnv("AI_API_KEY", "test-key");

    const { getAiGatewayHeaders } = await import("./_core/aiGateway");

    expect(
      getAiGatewayHeaders({
        "content-type": "application/json",
        "x-trace-id": "trace-123",
      })
    ).toEqual({
      authorization: "Bearer test-key",
      "content-type": "application/json",
      "x-trace-id": "trace-123",
    });
  });
});
