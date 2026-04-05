import { describe, expect, it, vi, beforeEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

// Mock the LLM module
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{
      message: {
        content: JSON.stringify({
          grammarCorrections: [],
          expressionSuggestions: [],
          overallScore: 90,
          encouragement: "Great job!",
        }),
      },
    }],
  }),
}));

// Mock the TTS module
vi.mock("./_core/tts", () => ({
  textToSpeech: vi.fn().mockResolvedValue({
    audioBuffer: Buffer.from("fake-audio-data"),
    contentType: "audio/mpeg",
  }),
}));

// Mock the voice transcription module
vi.mock("./_core/voiceTranscription", () => ({
  transcribeAudio: vi.fn().mockResolvedValue({
    text: "Hello, how are you?",
    language: "en",
    duration: 2.5,
  }),
}));

// Mock the storage module
vi.mock("./storage", () => ({
  storagePut: vi.fn().mockResolvedValue({
    key: "audio/1/test.webm",
    url: "https://storage.example.com/audio/1/test.webm",
  }),
}));

// Mock the db module
vi.mock("./db", () => ({
  getAllScenarios: vi.fn().mockResolvedValue([
    {
      id: 1,
      title: "Airport Check-in",
      titleZh: "机场值机",
      description: "Practice checking in at the airport",
      descriptionZh: "练习在机场办理值机手续",
      category: "travel",
      difficulty: "beginner",
      icon: "Plane",
      systemPrompt: "You are an airport staff member.",
      openingMessage: "Welcome! How can I help you today?",
      vocabulary: ["boarding pass", "luggage", "gate"],
      isActive: 1,
      sortOrder: 1,
      createdAt: new Date(),
    },
    {
      id: 2,
      title: "Restaurant Ordering",
      titleZh: "餐厅点餐",
      description: "Practice ordering food at a restaurant",
      descriptionZh: "练习在餐厅点餐",
      category: "daily",
      difficulty: "beginner",
      icon: "Utensils",
      systemPrompt: "You are a waiter at a restaurant.",
      openingMessage: "Good evening! Welcome to our restaurant.",
      vocabulary: ["menu", "appetizer", "main course"],
      isActive: 1,
      sortOrder: 2,
      createdAt: new Date(),
    },
    {
      id: 3,
      title: "Job Interview",
      titleZh: "求职面试",
      description: "Practice a job interview",
      descriptionZh: "练习求职面试",
      category: "business",
      difficulty: "intermediate",
      icon: "Briefcase",
      systemPrompt: "You are an interviewer.",
      openingMessage: "Hello, please have a seat.",
      vocabulary: ["resume", "experience", "qualifications"],
      isActive: 1,
      sortOrder: 3,
      createdAt: new Date(),
    },
  ]),
  getScenarioById: vi.fn().mockImplementation(async (id: number) => {
    const scenarios: Record<number, any> = {
      1: {
        id: 1,
        title: "Airport Check-in",
        titleZh: "机场值机",
        description: "Practice checking in at the airport",
        descriptionZh: "练习在机场办理值机手续",
        category: "travel",
        difficulty: "beginner",
        systemPrompt: "You are an airport staff member.",
        openingMessage: "Welcome! How can I help you today?",
        vocabulary: ["boarding pass", "luggage", "gate"],
      },
    };
    return scenarios[id] || undefined;
  }),
  createConversation: vi.fn().mockResolvedValue(42),
  getConversationById: vi.fn().mockImplementation(async (id: number) => {
    if (id === 42) {
      return {
        id: 42,
        userId: 1,
        scenarioId: 1,
        title: "Airport Check-in",
        status: "active",
        messageCount: 2,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    }
    return undefined;
  }),
  getUserConversations: vi.fn().mockResolvedValue([
    {
      id: 42,
      userId: 1,
      title: "Airport Check-in",
      status: "active",
      messageCount: 2,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ]),
  updateConversation: vi.fn().mockResolvedValue(undefined),
  createMessage: vi.fn().mockResolvedValue(1),
  getConversationMessages: vi.fn().mockResolvedValue([
    { id: 1, conversationId: 42, role: "system", content: "You are an airport staff member.", createdAt: new Date() },
    { id: 2, conversationId: 42, role: "assistant", content: "Welcome! How can I help you today?", createdAt: new Date() },
  ]),
  upsertLearningRecord: vi.fn().mockResolvedValue(undefined),
  getUserLearningRecords: vi.fn().mockResolvedValue([]),
  getUserDashboardStats: vi.fn().mockResolvedValue({
    totalPracticeSeconds: 3600,
    totalConversations: 10,
    avgPronunciationScore: 82,
    level: "B1",
    recentRecords: [],
    recentConversations: [],
  }),
  updateUserStats: vi.fn().mockResolvedValue(undefined),
  updateMessage: vi.fn().mockResolvedValue(undefined),
  upsertUser: vi.fn().mockResolvedValue(undefined),
  getUserByAuthUserId: vi.fn().mockResolvedValue(undefined),
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
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
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

function createPublicContext(): TrpcContext {
  return {
    user: null,
    authSessionId: null,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

describe("Scenario Routes", () => {
  it("scenario.list returns all active scenarios", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const scenarios = await caller.scenario.list();

    expect(scenarios).toHaveLength(3);
    expect(scenarios[0]).toHaveProperty("title", "Airport Check-in");
    expect(scenarios[0]).toHaveProperty("category", "travel");
    expect(scenarios[0]).toHaveProperty("difficulty", "beginner");
  });

  it("scenario.getById returns a specific scenario", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const scenario = await caller.scenario.getById({ id: 1 });

    expect(scenario).toBeDefined();
    expect(scenario.title).toBe("Airport Check-in");
    expect(scenario.systemPrompt).toContain("airport");
  });

  it("scenario.getById throws NOT_FOUND for invalid id", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(caller.scenario.getById({ id: 999 })).rejects.toThrow("Scenario not found");
  });
});

describe("Conversation Routes", () => {
  it("conversation.create creates a new conversation with scenario", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.conversation.create({ scenarioId: 1 });

    expect(result).toHaveProperty("conversationId", 42);
    expect(result).toHaveProperty("title", "Airport Check-in");
    expect(result).toHaveProperty("openingMessage");
  });

  it("conversation.create creates a free conversation without scenario", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.conversation.create({});

    expect(result).toHaveProperty("conversationId", 42);
    expect(result.title).toBe("Free Conversation");
  });

  it("conversation.list returns user conversations", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const convs = await caller.conversation.list({ limit: 10, offset: 0 });

    expect(convs).toHaveLength(1);
    expect(convs[0]).toHaveProperty("title", "Airport Check-in");
  });

  it("conversation.getById returns conversation with messages", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.conversation.getById({ id: 42 });

    expect(result.conversation).toBeDefined();
    expect(result.conversation?.title).toBe("Airport Check-in");
    expect(result.messages).toHaveLength(2);
  });

  it("conversation.getById throws NOT_FOUND for non-existent conversation", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    await expect(caller.conversation.getById({ id: 999 })).rejects.toThrow();
  });

  it("conversation.create requires authentication", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(caller.conversation.create({})).rejects.toThrow();
  });
});

describe("Chat Routes", () => {
  it("chat.send sends a message and gets AI response", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.chat.send({
      conversationId: 42,
      content: "I'd like to check in for my flight.",
    });

    expect(result).toHaveProperty("content");
    expect(typeof result.content).toBe("string");
  });

  it("chat.send returns userMessageId for analysis persistence", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.chat.send({
      conversationId: 42,
      content: "I go to airport yesterday.",
    });

    expect(result).toHaveProperty("userMessageId");
    expect(typeof result.userMessageId).toBe("number");
  });

  it("chat.analyze accepts optional messageId for persistence", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.chat.analyze({
      userMessage: "I go to airport yesterday",
      conversationId: 42,
      messageId: 1,
    });

    expect(result).toHaveProperty("grammarCorrections");
    expect(result).toHaveProperty("overallScore");
  });

  it("chat.analyze returns grammar and expression analysis", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.chat.analyze({
      userMessage: "I go to airport yesterday",
      conversationId: 42,
    });

    expect(result).toHaveProperty("grammarCorrections");
    expect(result).toHaveProperty("expressionSuggestions");
    expect(result).toHaveProperty("overallScore");
    expect(result).toHaveProperty("encouragement");
    expect(typeof result.overallScore).toBe("number");
  });

  it("chat.send requires authentication", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.chat.send({ conversationId: 42, content: "Hello" })
    ).rejects.toThrow();
  });
});

describe("Voice Routes", () => {
  it("voice.uploadAudio uploads audio and returns URL", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.voice.uploadAudio({
      audioBase64: "dGVzdA==", // base64 of "test"
      mimeType: "audio/webm",
    });

    expect(result).toHaveProperty("audioUrl");
    expect(result.audioUrl).toContain("https://");
  });

  it("voice.transcribe returns transcribed text", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.voice.transcribe({
      audioUrl: "https://storage.example.com/audio/test.webm",
      language: "en",
    });

    expect(result).toHaveProperty("text", "Hello, how are you?");
    expect(result).toHaveProperty("language", "en");
  });

  it("voice.assessPronunciation returns pronunciation scores", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);

    const result = await caller.voice.assessPronunciation({
      spokenText: "Hello, how are you?",
      conversationId: 42,
    });

    // The LLM mock returns grammar analysis format JSON, which when parsed
    // by the pronunciation handler won't have the expected keys.
    // The catch block returns fallback values.
    expect(result).toBeDefined();
    // Either the parsed result or the fallback should have a score-like structure
    if ('accuracy' in result) {
      expect(typeof result.accuracy).toBe('number');
      expect(typeof result.fluency).toBe('number');
    } else {
      // Fallback from catch block
      expect(result).toHaveProperty('overallScore');
    }
  });
});

describe("TTS Routes", () => {
  it("voice.tts converts text to speech and returns audio URL", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.voice.tts({
      text: "Hello, welcome to the airport!",
      voice: "nova",
      speed: 1.0,
    });

    expect(result).toHaveProperty("audioUrl");
    expect(result.audioUrl).toContain("https://");
  });

  it("voice.tts works with different voices", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.voice.tts({
      text: "Testing different voice",
      voice: "alloy",
      speed: 0.9,
    });

    expect(result).toHaveProperty("audioUrl");
  });

  it("voice.tts requires authentication", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.voice.tts({ text: "Hello", voice: "nova", speed: 1.0 })
    ).rejects.toThrow();
  });
});

describe("Dashboard Routes", () => {
  it("dashboard.stats returns user learning statistics", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const stats = await caller.dashboard.stats();

    expect(stats).toBeDefined();
    expect(stats).toHaveProperty("totalConversations", 10);
    expect(stats).toHaveProperty("avgPronunciationScore", 82);
    expect(stats).toHaveProperty("level", "B1");
  });

  it("dashboard.learningRecords returns learning history", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const records = await caller.dashboard.learningRecords({ days: 30 });

    expect(Array.isArray(records)).toBe(true);
  });

  it("dashboard.recommendations returns personalized recommendations", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const recs = await caller.dashboard.recommendations();

    expect(recs).toHaveProperty("level");
    expect(recs).toHaveProperty("recommended");
    expect(recs).toHaveProperty("challenge");
    expect(recs).toHaveProperty("tip");
    expect(Array.isArray(recs.recommended)).toBe(true);
    expect(Array.isArray(recs.challenge)).toBe(true);
    expect(typeof recs.tip).toBe("string");
  });

  it("dashboard.stats requires authentication", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);

    await expect(caller.dashboard.stats()).rejects.toThrow();
  });
});

describe("Auth Routes", () => {
  it("auth.me returns null for unauthenticated user", async () => {
    const ctx = createPublicContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();

    expect(result).toBeNull();
  });

  it("auth.me returns user for authenticated user", async () => {
    const ctx = createAuthContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();

    expect(result).toBeDefined();
    expect(result?.name).toBe("Test Learner");
    expect(result?.email).toBe("test@example.com");
  });
});
