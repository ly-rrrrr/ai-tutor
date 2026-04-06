import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

const {
  storagePutMock,
  storageGetMock,
  storageExistsMock,
  createMessageMock,
  updateMessageMock,
  getConversationMessagesMock,
  getMessageByIdMock,
} = vi.hoisted(() => ({
  storagePutMock: vi.fn(),
  storageGetMock: vi.fn(),
  storageExistsMock: vi.fn(),
  createMessageMock: vi.fn(),
  updateMessageMock: vi.fn(),
  getConversationMessagesMock: vi.fn(),
  getMessageByIdMock: vi.fn(),
}));

vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [
      {
        message: {
          content: "Assistant reply",
        },
      },
    ],
  }),
}));

vi.mock("./_core/tts", () => ({
  textToSpeech: vi.fn().mockResolvedValue({
    audioBuffer: Buffer.from("tts-audio"),
    contentType: "audio/mpeg",
  }),
}));

vi.mock("./storage", () => ({
  storagePut: storagePutMock,
  storageGet: storageGetMock,
  storageExists: storageExistsMock,
}));

vi.mock("./db", () => ({
  getAllScenarios: vi.fn(),
  getScenarioById: vi.fn(),
  createConversation: vi.fn(),
  getConversationById: vi.fn().mockImplementation(async (id: number) => {
    if (id !== 42) {
      return undefined;
    }

    return {
      id: 42,
      userId: 1,
      title: "Test Conversation",
      status: "active",
      messageCount: 2,
      createdAt: new Date("2026-04-06T00:00:00.000Z"),
      updatedAt: new Date("2026-04-06T00:00:00.000Z"),
    };
  }),
  getUserConversations: vi.fn(),
  updateConversation: vi.fn(),
  createMessage: createMessageMock,
  updateMessage: updateMessageMock,
  getConversationMessages: getConversationMessagesMock,
  getMessageById: getMessageByIdMock,
  upsertLearningRecord: vi.fn(),
  getUserLearningRecords: vi.fn(),
  getUserDashboardStats: vi.fn(),
  updateUserStats: vi.fn(),
}));

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createAuthContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    authUserId: "test-user-001",
    email: "test@example.com",
    name: "Test Learner",
    loginMethod: "magic_link",
    role: "user",
    level: "A2",
    totalPracticeSeconds: 0,
    totalConversations: 0,
    avgPronunciationScore: 0,
    createdAt: new Date("2026-04-06T00:00:00.000Z"),
    updatedAt: new Date("2026-04-06T00:00:00.000Z"),
    lastSignedIn: new Date("2026-04-06T00:00:00.000Z"),
  } as AuthenticatedUser;

  return {
    user,
    authSessionId: "session-1",
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  storagePutMock.mockImplementation(async (key: string) => ({
    key,
    url: `https://signed.example.com/${key}`,
  }));
  storageGetMock.mockImplementation(async (key: string) => ({
    key,
    url: `https://resigned.example.com/${key}`,
  }));
  storageExistsMock.mockResolvedValue(true);
  createMessageMock.mockImplementation(async (data: { role?: string }) =>
    data.role === "assistant" ? 202 : 101
  );
  updateMessageMock.mockResolvedValue(undefined);
  getMessageByIdMock.mockImplementation(async (id: number) => ({
    id,
    conversationId: 42,
    role: id === 202 ? "assistant" : "user",
    content: "Persisted message",
    createdAt: new Date("2026-04-06T00:00:02.000Z"),
  }));
  getConversationMessagesMock.mockResolvedValue([
    {
      id: 1,
      conversationId: 42,
      role: "system",
      content: "System prompt",
      createdAt: new Date("2026-04-06T00:00:00.000Z"),
    },
    {
      id: 2,
      conversationId: 42,
      role: "user",
      content: "Hello from audio",
      createdAt: new Date("2026-04-06T00:00:01.000Z"),
    },
  ]);
});

describe("audio persistence", () => {
  it("returns durable upload metadata and persists object keys for user audio", async () => {
    const caller = appRouter.createCaller(createAuthContext());

    const upload = await caller.voice.uploadAudio({
      audioBase64: Buffer.from("test-audio").toString("base64"),
      mimeType: "audio/webm",
    });

    expect(upload).toMatchObject({
      audioUrl: expect.stringContaining("https://signed.example.com/audio/1/"),
      audioObjectKey: expect.stringMatching(/^audio\/1\/.+\.webm$/),
      audioContentType: "audio/webm",
    });

    await caller.chat.send({
      conversationId: 42,
      content: "Hello from audio",
      audioObjectKey: upload.audioObjectKey,
      audioContentType: upload.audioContentType,
      audioUrl: upload.audioUrl,
    } as never);

    expect(createMessageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: 42,
        role: "user",
        content: "Hello from audio",
        audioObjectKey: upload.audioObjectKey,
        audioContentType: "audio/webm",
      })
    );
  });

  it("re-signs stored object keys when loading a conversation", async () => {
    getConversationMessagesMock.mockResolvedValueOnce([
      {
        id: 10,
        conversationId: 42,
        role: "assistant",
        content: "Persisted audio reply",
        audioUrl: null,
        audioObjectKey: "tts/1/persisted-reply.mp3",
        audioContentType: "audio/mpeg",
        createdAt: new Date("2026-04-06T00:00:02.000Z"),
      },
    ]);

    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.conversation.getById({ id: 42 });

    expect(storageGetMock).toHaveBeenCalledWith("tts/1/persisted-reply.mp3");
    expect(result.messages[0]).toMatchObject({
      audioObjectKey: "tts/1/persisted-reply.mp3",
      audioContentType: "audio/mpeg",
      audioUrl: "https://resigned.example.com/tts/1/persisted-reply.mp3",
    });
  });

  it("persists generated TTS audio against the assistant message", async () => {
    const caller = appRouter.createCaller(createAuthContext());

    const result = await caller.voice.tts({
      text: "Persist this assistant audio",
      voice: "nova",
      speed: 1,
      messageId: 202,
    } as never);

    expect(result.audioUrl).toContain("https://signed.example.com/tts/1/");
    expect(updateMessageMock).toHaveBeenCalledWith(
      202,
      expect.objectContaining({
        audioObjectKey: expect.stringMatching(/^tts\/1\/.+\.mp3$/),
        audioContentType: "audio/mpeg",
      })
    );
  });

  it("rejects uploaded audio keys outside the caller namespace", async () => {
    const caller = appRouter.createCaller(createAuthContext());

    await expect(
      caller.chat.send({
        conversationId: 42,
        content: "Forged audio reference",
        audioObjectKey: "audio/2/foreign.webm",
        audioContentType: "audio/webm",
      } as never)
    ).rejects.toThrow("Audio upload does not belong to the current user");
  });

  it("rejects TTS persistence for messages outside the caller conversation", async () => {
    getMessageByIdMock.mockResolvedValueOnce({
      id: 999,
      conversationId: 404,
      role: "assistant",
      content: "Other user's assistant reply",
      createdAt: new Date("2026-04-06T00:00:03.000Z"),
    });

    const caller = appRouter.createCaller(createAuthContext());

    await expect(
      caller.voice.tts({
        text: "Should not persist",
        voice: "nova",
        speed: 1,
        messageId: 999,
      } as never)
    ).rejects.toThrow("Message not found");
  });
});
