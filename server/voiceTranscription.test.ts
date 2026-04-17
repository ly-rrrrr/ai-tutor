import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.resetModules();
  vi.clearAllMocks();
});

describe("voice transcription", () => {
  it("keeps webm file extensions when static storage serves browser audio as video/webm", async () => {
    vi.stubEnv("AI_BASE_URL", "https://ai.example.com/v1");
    vi.stubEnv("AI_API_KEY", "ai-key");
    vi.stubEnv("AI_STT_MODEL", "whisper-1");

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(new Uint8Array([1, 2, 3]), {
          status: 200,
          headers: { "content-type": "video/webm; codecs=opus" },
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            task: "transcribe",
            language: "english",
            duration: 1,
            text: "Hello",
            segments: [],
          }),
          {
            status: 200,
            headers: { "content-type": "application/json" },
          }
        )
      );
    vi.stubGlobal("fetch", fetchMock);

    const { transcribeAudio } = await import("./_core/voiceTranscription");

    const result = await transcribeAudio({
      audioUrl: "https://app.example.com/api/storage/audio/1/test.webm",
      language: "en",
    });

    expect("error" in result).toBe(false);
    const [, transcriptionRequest] = fetchMock.mock.calls[1];
    const formData = transcriptionRequest?.body as FormData;
    const file = formData.get("file") as File;
    expect(file.name).toBe("audio.webm");
    expect(file.type).toBe("video/webm");
    expect(formData.get("language")).toBe("en");
  });
});
